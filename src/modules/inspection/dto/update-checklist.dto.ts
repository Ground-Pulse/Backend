import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CheckStatus } from '@prisma/client';

export class ChecklistItemUpdateDto {
  @IsUUID()
  id!: string;

  @IsEnum(CheckStatus)
  @IsOptional()
  status?: CheckStatus;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  mediaUrls?: string[];

  @IsString()
  @IsOptional()
  notes?: string;
}

export class BatchUpdateChecklistDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemUpdateDto)
  items!: ChecklistItemUpdateDto[];
}
