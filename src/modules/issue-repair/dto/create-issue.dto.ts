import {
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsString,
  IsUUID,
} from 'class-validator';
import { IssueCategory } from '@prisma/client';

export class CreateIssueDto {
  @IsUUID()
  @IsNotEmpty()
  inspectionId!: string;

  @IsUUID()
  @IsNotEmpty()
  propertyId!: string;

  @IsEnum(IssueCategory, {
    message: 'category must be LEAK, ELECTRICAL, SECURITY, CLEANLINESS, or OTHER',
  })
  category!: IssueCategory;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'At least one photo or media proof is required when flagging an issue' })
  @IsString({ each: true })
  mediaUrls!: string[];
}
