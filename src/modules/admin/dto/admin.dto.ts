import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength, ValidateNested } from 'class-validator';

export class ReassignDto {
  @IsIn(['INSPECTION', 'REPAIR'])
  kind!: 'INSPECTION' | 'REPAIR';

  @IsUUID()
  id!: string;

  @IsUUID()
  assigneeId!: string;
}

export class VerificationDecisionDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class TemplateItemDto {
  @IsString()
  @MaxLength(60)
  roomArea!: string;

  @IsString()
  @MaxLength(120)
  itemName!: string;
}

export class SaveTemplateDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'A template needs at least one item.' })
  @ArrayMaxSize(150)
  @ValidateNested({ each: true })
  @Type(() => TemplateItemDto)
  items!: TemplateItemDto[];
}
