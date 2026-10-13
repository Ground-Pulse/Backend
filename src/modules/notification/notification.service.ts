import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationGateway } from './notification.gateway';
import { EmailService } from './email.service';
import { GroundPulseException } from '../../common/exceptions/ground-pulse.exception';

@Injectable()
export class NotificationService {
  constructor(
    private prisma: PrismaService,
    private gateway: NotificationGateway,
    private emailService: EmailService,
  ) {}

  async createNotification(
    userId: string,
    type: 'REPORT_READY' | 'ISSUE_FLAGGED' | 'REPAIR_STATUS_UPDATED',
    payload: Record<string, any>,
    sendEmail = true,
  ) {
    const notification = await this.prisma.notification.create({
      data: {
        userId,
        type,
        payload,
        read: false,
      },
      include: {
        user: true,
      },
    });

    // Real-time Socket.IO push
    this.gateway.emitNewNotification(userId, {
      id: notification.id,
      type: notification.type,
      payload: notification.payload,
    });

    // Optional email dispatch
    if (sendEmail && notification.user?.email) {
      const subject = this.getEmailSubject(type, payload);
      const html = this.buildEmailHtml(type, payload, notification.user.name);
      await this.emailService.sendMail(notification.user.email, subject, html);
    }

    return notification;
  }

  async getUserNotifications(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markAsRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.userId !== userId) {
      throw GroundPulseException.forbiddenNotOwner('Cannot update notification belonging to another user');
    }

    return this.prisma.notification.update({
      where: { id },
      data: { read: true },
    });
  }

  private getEmailSubject(type: string, payload: any): string {
    switch (type) {
      case 'REPORT_READY':
        return `[GroundPulse] Inspection Report Ready - ${payload.propertyName || 'Your Property'}`;
      case 'ISSUE_FLAGGED':
        return `[GroundPulse] Action Required: New Issue Flagged (${payload.category || 'Maintenance'})`;
      case 'REPAIR_STATUS_UPDATED':
        return `[GroundPulse] Repair Status Updated: ${payload.status || 'Updated'}`;
      default:
        return '[GroundPulse] Platform Notification';
    }
  }

  private buildEmailHtml(type: string, payload: any, userName: string): string {
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #0f172a;">GroundPulse Notification</h2>
        <p>Hello ${userName},</p>
        <p><strong>Notification Type:</strong> ${type}</p>
        <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0;">
          <pre style="white-space: pre-wrap; font-family: inherit; color: #334155;">${JSON.stringify(payload, null, 2)}</pre>
        </div>
        <p style="color: #64748b; font-size: 14px;">Log in to your GroundPulse Dashboard to view details and take action.</p>
      </div>
    `;
  }
}
