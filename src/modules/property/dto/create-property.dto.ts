import { IsIn, IsNotEmpty, IsString, IsUrl } from 'class-validator';

export class CreatePropertyDto {
  @IsString()
  @IsNotEmpty()
  address!: string;

  @IsString()
  @IsIn(['Apartment', 'Villa', 'Plot'], {
    message: 'type must be Apartment, Villa, or Plot',
  })
  type!: string;

  @IsString()
  @IsNotEmpty()
  coverPhotoUrl!: string;
}
