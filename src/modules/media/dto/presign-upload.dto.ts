import { IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class PresignUploadDto {
  @IsString()
  @IsNotEmpty()
  fileName!: string;

  @IsString()
  @IsNotEmpty()
  @IsIn(
    [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
      'image/heic',
      'application/pdf',
      'video/mp4',
      'video/quicktime',
    ],
    {
      message: 'fileType must be a valid image, video, or PDF MIME type',
    },
  )
  fileType!: string;

  @IsString()
  @IsOptional()
  category?: 'properties' | 'inspections' | 'issues' | 'repairs';
}
