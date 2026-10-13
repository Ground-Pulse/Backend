import { Module } from '@nestjs/common';
import { InspectionService } from './inspection.service';
import { InspectionController } from './inspection.controller';
import { JobsModule } from '../jobs/jobs.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [JobsModule, AuthModule],
  controllers: [InspectionController],
  providers: [InspectionService],
  exports: [InspectionService],
})
export class InspectionModule {}
