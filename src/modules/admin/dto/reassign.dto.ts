import { IsIn, IsNotEmpty, IsUUID } from 'class-validator';

export class ReassignDto {
  @IsIn(['INSPECTOR', 'PROVIDER'], {
    message: 'type must be INSPECTOR or PROVIDER',
  })
  type!: 'INSPECTOR' | 'PROVIDER';

  @IsUUID()
  @IsNotEmpty()
  targetId!: string; // inspectionId if INSPECTOR, repairId if PROVIDER

  @IsUUID()
  @IsNotEmpty()
  newAssigneeId!: string; // inspector userId if INSPECTOR, serviceProvider.id if PROVIDER
}
