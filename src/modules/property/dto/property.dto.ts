import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { DocumentKind } from '@prisma/client';
import { PROPERTY_TYPES } from '../../../common/checklist-templates';

export class CreatePropertyDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name!: string;

  @IsString()
  @IsNotEmpty({ message: 'Address is required' })
  @MaxLength(300)
  address!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  city!: string;

  @IsIn(PROPERTY_TYPES as unknown as string[], { message: `Type must be one of: ${PROPERTY_TYPES.join(', ')}` })
  type!: string;

  /** S3/CDN URL from /media/presign (or a data URL in local dev) */
  @IsString()
  @IsNotEmpty({ message: 'At least one photo is required' })
  coverPhotoUrl!: string;
}

export class UpdatePropertyDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Address is required' })
  @MaxLength(300)
  address?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  city?: string;

  @IsOptional()
  @IsIn(PROPERTY_TYPES as unknown as string[])
  type?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  coverPhotoUrl?: string;
}

export class CreateDocumentDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsIn(Object.values(DocumentKind))
  kind?: DocumentKind;

  @IsString()
  @IsNotEmpty()
  url!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sizeBytes?: number;
}
