import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateNested } from 'class-validator';
import { CheckStatus } from '@prisma/client';

export class ScheduleInspectionDto {
  @IsUUID()
  propertyId!: string;

  @IsDateString()
  scheduledDate!: string;

  /** FREQ=WEEKLY | FREQ=MONTHLY | FREQ=MONTHLY;INTERVAL=3 */
  @IsOptional()
  @IsString()
  @Matches(/^FREQ=(WEEKLY|MONTHLY)(;INTERVAL=\d{1,2})?$/, { message: 'Unsupported recurrence rule' })
  recurrenceRule?: string;
}

export class ChecklistItemDraftDto {
  @IsUUID()
  id!: string;

  @IsOptional()
  @IsEnum(CheckStatus)
  status!: CheckStatus | null;

  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  mediaUrls!: string[];

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes!: string | null;
}

export class SaveChecklistDraftDto {
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ChecklistItemDraftDto)
  items!: ChecklistItemDraftDto[];
}
