import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ReportGenerationProcessor } from './report-generation.processor';
import { NotificationDispatchProcessor } from './notification-dispatch.processor';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    BullModule.registerQueue(
      {
        name: 'reports',
      },
      {
        name: 'notifications-queue',
      },
    ),
    NotificationModule,
  ],
  providers: [ReportGenerationProcessor, NotificationDispatchProcessor],
  exports: [BullModule],
})
export class JobsModule {}
