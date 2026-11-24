import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import * as path from 'path';
import { GroundPulseException } from '../../common/exceptions/ground-pulse.exception';
import { PrismaService } from '../../prisma/prisma.service';
import { PresignDto } from './dto/presign.dto';

export const ALLOWED_TYPES = /^(image\/(jpeg|png|webp|gif|heic)|video\/(mp4|quicktime|webm)|application\/pdf)$/;
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
/** Files kept in Postgres are capped lower; the frontend shrinks photos first. */
export const MAX_DB_BYTES = 10 * 1024 * 1024;
const KEY_RE = /^[a-zA-Z0-9.-]+$/;

type Driver = 'db' | 'local' | 's3';

/**
 * Media uploads (TR-006). Clients never send files through the JSON API:
 *  1. POST /media/presign → { uploadUrl, publicUrl }
 *  2. PUT the file to uploadUrl
 *  3. store publicUrl on the checklist item / issue / repair / property
 *
 * MEDIA_DRIVER=db    → (default without S3 keys) signed URL to this API, file stored in the
 *                      media_files table, served from GET /media/file/:key — survives restarts
 * MEDIA_DRIVER=s3    → pre-signed S3/R2 PUT URL, public URL on the bucket/CDN
 * MEDIA_DRIVER=local → like db, but written to ./uploads on disk (lost on hosts without a persistent disk)
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly driver: Driver;
  private readonly s3: S3Client | null = null;
  private readonly bucket: string;
  private readonly region: string;
  readonly uploadDir: string;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    const accessKey = config.get<string>('AWS_ACCESS_KEY_ID');
    const secretKey = config.get<string>('AWS_SECRET_ACCESS_KEY');
    const hasKeys = !!accessKey && accessKey !== 'test' && !!secretKey;
    const wanted = (config.get<string>('MEDIA_DRIVER') as Driver) || (hasKeys ? 's3' : 'db');
    if (wanted === 's3' && !hasKeys) {
      this.logger.warn('MEDIA_DRIVER=s3 but AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY are missing — storing uploads in the database');
    }
    this.driver = wanted === 's3' ? (hasKeys ? 's3' : 'db') : wanted === 'local' ? 'local' : 'db';
    this.region = config.get<string>('AWS_REGION') || 'ap-south-1';
    this.bucket = config.get<string>('S3_BUCKET') || 'groundpulse-media-dev';
    this.uploadDir = path.resolve(config.get<string>('UPLOAD_DIR') || 'uploads');
    if (this.driver === 's3') {
      // S3_ENDPOINT enables S3-compatible stores, e.g. Cloudflare R2:
      //   https://<ACCOUNT_ID>.r2.cloudflarestorage.com  (with AWS_REGION=auto)
      const endpoint = config.get<string>('S3_ENDPOINT') || undefined;
      this.s3 = new S3Client({
        region: this.region,
        endpoint,
        credentials: { accessKeyId: accessKey!, secretAccessKey: secretKey! },
        // Browser PUTs to a presigned URL can't send the SDK's automatic CRC32
        // checksum, so only add checksums when the operation requires them.
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
      });
    }
    this.logger.log(`Media driver: ${this.driver}`);
  }

  private apiUrl() {
    return (this.config.get<string>('API_PUBLIC_URL') || process.env.RENDER_EXTERNAL_URL || `http://localhost:${this.config.get('PORT') || 3001}`).replace(/\/$/, '');
  }

  /** HMAC over key + expiry + uploader, so a link can't be reused for another key or user. */
  private sign(key: string, exp: number, userId = '') {
    return createHmac('sha256', this.config.get<string>('JWT_SECRET') || 'super-secret-jwt-key').update(`${key}:${exp}:${userId}`).digest('hex');
  }

  private checkSignature(key: string, exp: string, sig: string, userId: string) {
    if (!KEY_RE.test(key)) throw GroundPulseException.validation('Invalid key');
    const expected = Buffer.from(this.sign(key, Number(exp), userId));
    const given = Buffer.from(sig || '');
    if (Number(exp) < Date.now() || expected.length !== given.length || !timingSafeEqual(expected, given)) {
      throw GroundPulseException.unauthorized('Upload link expired or invalid');
    }
  }

  async presign(dto: PresignDto, userId: string) {
    if (!ALLOWED_TYPES.test(dto.contentType)) throw GroundPulseException.validation('Only photos, videos or PDFs can be uploaded.');
    if (dto.size != null && dto.size > MAX_UPLOAD_BYTES) throw GroundPulseException.validation('Files must be under 25 MB.');
    const ext = path.extname(dto.fileName).toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 6);
    const key = `${userId.slice(0, 8)}-${Date.now()}-${randomUUID()}${ext}`;

    if (this.driver === 's3') {
      const command = new PutObjectCommand({ Bucket: this.bucket, Key: `media/${key}`, ContentType: dto.contentType });
      const uploadUrl = await getSignedUrl(this.s3!, command, { expiresIn: 900 });
      const cdn = this.config.get<string>('MEDIA_PUBLIC_BASE_URL');
      const publicUrl = cdn ? `${cdn.replace(/\/$/, '')}/media/${key}` : `https://${this.bucket}.s3.${this.region}.amazonaws.com/media/${key}`;
      return { uploadUrl, publicUrl, key, expiresIn: 900 };
    }

    if (this.driver === 'db' && dto.size != null && dto.size > MAX_DB_BYTES) {
      throw GroundPulseException.validation('Files must be under 10 MB.');
    }
    const exp = Date.now() + 15 * 60 * 1000;
    const uploadUrl = `${this.apiUrl()}/media/upload/${key}?exp=${exp}&u=${userId}&sig=${this.sign(key, exp, userId)}`;
    const publicUrl = this.driver === 'db' ? `${this.apiUrl()}/media/file/${key}` : `${this.apiUrl()}/uploads/${key}`;
    return { uploadUrl, publicUrl, key, expiresIn: 900 };
  }

  /** db/local drivers: verify the signed URL, then store the raw body. */
  async store(key: string, exp: string, sig: string, userId: string, contentType: string | undefined, body: Buffer) {
    if (this.driver === 's3') throw GroundPulseException.notFound();
    this.checkSignature(key, exp, sig, userId);
    if (!Buffer.isBuffer(body) || !body.length) throw GroundPulseException.validation('Empty upload');
    const type = (contentType || '').split(';')[0].trim().toLowerCase();
    if (!ALLOWED_TYPES.test(type)) throw GroundPulseException.validation('Only photos, videos or PDFs can be uploaded.');

    if (this.driver === 'db') {
      if (body.length > MAX_DB_BYTES) throw GroundPulseException.validation('Files must be under 10 MB.');
      // upsert: a retried PUT of the same signed link must not fail
      await this.prisma.mediaFile.upsert({
        where: { id: key },
        update: { contentType: type, size: body.length, data: body },
        create: { id: key, ownerId: userId, contentType: type, size: body.length, data: body },
      });
      return { ok: true };
    }

    if (body.length > MAX_UPLOAD_BYTES) throw GroundPulseException.validation('Files must be under 25 MB.');
    await mkdir(this.uploadDir, { recursive: true });
    await writeFile(path.join(this.uploadDir, key), body);
    return { ok: true };
  }

  /** db driver: the stored file for GET /media/file/:key. */
  async getFile(key: string) {
    if (!KEY_RE.test(key)) throw GroundPulseException.notFound('File not found');
    const file = await this.prisma.mediaFile.findUnique({ where: { id: key }, select: { contentType: true, data: true } });
    if (!file) throw GroundPulseException.notFound('File not found');
    return file;
  }
}
