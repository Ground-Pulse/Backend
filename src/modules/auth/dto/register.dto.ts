import { ArrayMaxSize, IsArray, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Role } from '@prisma/client';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  password!: string;

  /** Admins are invite-only */
  @IsIn([Role.OWNER, Role.INSPECTOR, Role.PROVIDER], { message: 'Role must be OWNER, INSPECTOR, or PROVIDER' })
  role!: Role;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  phone?: string;

  /** Provider only */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsString({ each: true })
  serviceTypes?: string[];

  /** Provider only */
  @IsOptional()
  @IsString()
  @MaxLength(60)
  locality?: string;
}
