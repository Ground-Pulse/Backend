import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { NotificationChannel } from '@prisma/client';

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}

export class UpdatePreferencesDto {
  @IsEnum(NotificationChannel)
  notificationChannel!: NotificationChannel;
}
