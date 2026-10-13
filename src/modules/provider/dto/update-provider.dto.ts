import { IsArray, IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class UpdateProviderDto {
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  serviceTypes?: string[];

  @IsString()
  @IsOptional()
  locality?: string;

  @IsBoolean()
  @IsOptional()
  verified?: boolean;

  @IsNumber()
  @IsOptional()
  rating?: number;
}
