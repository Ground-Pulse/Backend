import { IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class PresignDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  fileName!: string;

  @IsString()
  @IsNotEmpty()
  contentType!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  size?: number;
}
