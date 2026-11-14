import { Module } from '@nestjs/common';
import { IssueRepairService } from './issue-repair.service';
import { IssueController } from './issue.controller';
import { RepairController } from './repair.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [IssueController, RepairController],
  providers: [IssueRepairService],
  exports: [IssueRepairService],
})
export class IssueRepairModule {}
