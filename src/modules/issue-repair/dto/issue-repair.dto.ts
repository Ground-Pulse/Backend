import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { IssueCategory, RepairStatus } from '@prisma/client';

export class FlagIssueDto {
  @IsUUID()
  inspectionId!: string;

  @IsEnum(IssueCategory)
  category!: IssueCategory;

  @IsString()
  @MinLength(5)
  @MaxLength(1000)
  description!: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'At least one photo is required' })
  @ArrayMaxSize(20)
  @IsString({ each: true })
  mediaUrls!: string[];
}

export class ReasonDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class MessageDto {
  @IsString()
  @IsNotEmpty({ message: "Message can't be empty." })
  @MaxLength(2000)
  body!: string;
}

export class AssignProviderDto {
  @IsUUID()
  providerId!: string;
}

export class RepairStatusDto {
  @IsIn([RepairStatus.ASSIGNED, RepairStatus.IN_PROGRESS, RepairStatus.REQUESTED])
  status!: RepairStatus;

  @IsOptional()
  @IsNumber()
  @Min(0)
  costEstimate?: number | null;
}

export class CompleteRepairDto {
  @IsString()
  @MaxLength(2000)
  completionNotes!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  completionPhotos?: string[];
}

export class RateRepairDto {
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;
}
