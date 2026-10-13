import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PresignUploadDto } from './dto/presign-upload.dto';
import * as path from 'path';
import { randomUUID } from 'crypto';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly s3Client: S3Client;
  private readonly bucket: string;
  private readonly region: string;

  constructor(private configService: ConfigService) {
    this.region = this.configService.get<string>('AWS_REGION') || 'ap-south-1';
    this.bucket = this.configService.get<string>('S3_BUCKET') || 'groundpulse-media-dev';

    this.s3Client = new S3Client({
      region: this.region,
      credentials: {
        accessKeyId: this.configService.get<string>('AWS_ACCESS_KEY_ID') || 'test',
        secretAccessKey: this.configService.get<string>('AWS_SECRET_ACCESS_KEY') || 'test',
      },
    });
  }

  async getPresignedUploadUrl(dto: PresignUploadDto, userId: string) {
    const ext = path.extname(dto.fileName).toLowerCase();
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.pdf', '.mp4', '.mov'];

    if (ext && !allowedExtensions.includes(ext)) {
      throw new BadRequestException(`File extension '${ext}' is not permitted.`);
    }

    const category = dto.category || 'general';
    const cleanFileName = path.basename(dto.fileName).replace(/[^a-zA-Z0-9.-]/g, '_');
    const key = `${category}/${userId}/${Date.now()}-${randomUUID()}${ext || ''}`;

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: dto.fileType,
    });

    try {
      // 15-minute expiration (900 seconds)
      const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 900 });
      const fileUrl = `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;

      this.logger.log(`Generated presigned S3 upload URL for key: ${key}`);

      return {
        uploadUrl,
        fileUrl,
        key,
        expiresIn: 900,
      };
    } catch (err: any) {
      this.logger.error(`Error generating pre-signed S3 URL: ${err.message}`);
      throw new BadRequestException('Could not generate pre-signed upload URL');
    }
  }
}
