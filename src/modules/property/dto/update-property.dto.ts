import { IsIn, IsOptional, IsString } from 'class-validator';

export class UpdatePropertyDto {
  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  @IsIn(['Apartment', 'Villa', 'Plot'], {
    message: 'type must be Apartment, Villa, or Plot',
  })
  type?: string;

  @IsString()
  @IsOptional()
  coverPhotoUrl?: string;
}
