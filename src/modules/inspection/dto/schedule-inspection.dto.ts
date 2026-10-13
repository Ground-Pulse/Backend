import { IsDateString, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class ScheduleInspectionDto {
  @IsUUID()
  @IsNotEmpty()
  propertyId!: string;

  @IsDateString()
  @IsNotEmpty()
  scheduledDate!: string;

  @IsString()
  @IsOptional()
  recurrenceRule?: string;

  @IsUUID()
  @IsOptional()
  inspectorId?: string;
}
