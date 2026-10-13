import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { NotificationService } from '../notification/notification.service';

export interface NotificationDispatchJobData {
  userId: string;
  type: 'REPORT_READY' | 'ISSUE_FLAGGED' | 'REPAIR_STATUS_UPDATED';
  payload: Record<string, any>;
  sendEmail?: boolean;
}

@Processor('notifications-queue')
export class NotificationDispatchProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationDispatchProcessor.name);

  constructor(private notificationService: NotificationService) {
    super();
  }

  async process(job: Job<NotificationDispatchJobData>): Promise<any> {
    const { userId, type, payload, sendEmail } = job.data;
    this.logger.log(`[BullMQ] Processing notification dispatch for user ${userId} (${type})`);

    await this.notificationService.createNotification(
      userId,
      type,
      payload,
      sendEmail ?? true,
    );

    return { success: true };
  }
}
