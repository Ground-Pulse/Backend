import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHmac, randomUUID, timingSafeEqual } from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import * as path from 'path';
import { GroundPulseException } from '../../common/exceptions/ground-pulse.exception';
import { PresignDto } from './dto/presign.dto';

export const ALLOWED_TYPES = /^(image\/(jpeg|png|webp|gif|heic)|video\/(mp4|quicktime|webm)|application\/pdf)$/;
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/**
 * Media uploads (TR-006). Clients never send files through the JSON API:
 *  1. POST /media/presign → { uploadUrl, publicUrl }
 *  2. PUT the file to uploadUrl
 *  3. store publicUrl on the checklist item / issue / repair / property
 *
 * MEDIA_DRIVER=s3    → pre-signed S3/R2 PUT URL, public URL on the bucket/CDN
 * MEDIA_DRIVER=local → signed URL to this API (PUT /media/upload/:key), files served from /uploads
 */
@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly driver: 'local' | 's3';
  private readonly s3: S3Client | null = null;
  private readonly bucket: string;
  private readonly region: string;
  readonly uploadDir: string;

  constructor(private config: ConfigService) {
    const accessKey = config.get<string>('AWS_ACCESS_KEY_ID');
    this.driver = (config.get<string>('MEDIA_DRIVER') as 'local' | 's3') || (!accessKey || accessKey === 'test' ? 'local' : 's3');
    this.region = config.get<string>('AWS_REGION') || 'ap-south-1';
    this.bucket = config.get<string>('S3_BUCKET') || 'groundpulse-media-dev';
    this.uploadDir = path.resolve(config.get<string>('UPLOAD_DIR') || 'uploads');
    if (this.driver === 's3') {
      this.s3 = new S3Client({
        region: this.region,
        credentials: { accessKeyId: accessKey!, secretAccessKey: config.get<string>('AWS_SECRET_ACCESS_KEY') || '' },
      });
    }
    this.logger.log(`Media driver: ${this.driver}`);
  }

  private apiUrl() {
    return (this.config.get<string>('API_PUBLIC_URL') || process.env.RENDER_EXTERNAL_URL || `http://localhost:${this.config.get('PORT') || 3001}`).replace(/\/$/, '');
  }

  private sign(key: string, exp: number) {
    return createHmac('sha256', this.config.get<string>('JWT_SECRET') || 'super-secret-jwt-key').update(`${key}:${exp}`).digest('hex');
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

    const exp = Date.now() + 15 * 60 * 1000;
    const uploadUrl = `${this.apiUrl()}/media/upload/${key}?exp=${exp}&sig=${this.sign(key, exp)}`;
    return { uploadUrl, publicUrl: `${this.apiUrl()}/uploads/${key}`, key, expiresIn: 900 };
  }

  /** Local driver: verify the signed URL and write the raw body to disk. */
  async storeLocal(key: string, exp: string, sig: string, body: Buffer) {
    if (this.driver !== 'local') throw GroundPulseException.notFound();
    if (!/^[a-zA-Z0-9.-]+$/.test(key)) throw GroundPulseException.validation('Invalid key');
    const expected = Buffer.from(this.sign(key, Number(exp)));
    const given = Buffer.from(sig || '');
    if (Number(exp) < Date.now() || expected.length !== given.length || !timingSafeEqual(expected, given)) {
      throw GroundPulseException.unauthorized('Upload link expired or invalid');
    }
    if (!Buffer.isBuffer(body) || !body.length) throw GroundPulseException.validation('Empty upload');
    if (body.length > MAX_UPLOAD_BYTES) throw GroundPulseException.validation('Files must be under 25 MB.');
    await mkdir(this.uploadDir, { recursive: true });
    await writeFile(path.join(this.uploadDir, key), body);
    return { ok: true };
  }
}
