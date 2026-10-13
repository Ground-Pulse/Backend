import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { RepairStatus } from '@prisma/client';

export class AssignProviderDto {
  @IsUUID()
  @IsNotEmpty()
  providerId!: string;

  @IsNumber()
  @IsOptional()
  costEstimate?: number;
}

export class UpdateRepairStatusDto {
  @IsEnum(RepairStatus, {
    message: 'status must be REQUESTED, ASSIGNED, IN_PROGRESS, or COMPLETED',
  })
  status!: RepairStatus;
}

export class CompleteRepairDto {
  @IsString()
  @IsNotEmpty({ message: 'completionNotes is required to complete repair' })
  completionNotes!: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  completionPhotos?: string[];
}
