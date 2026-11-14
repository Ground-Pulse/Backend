import { Injectable } from '@nestjs/common';
import { NotificationChannel, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationGateway } from './notification.gateway';
import { EmailService } from './email.service';
import { GroundPulseException } from '../../common/exceptions/ground-pulse.exception';
import { toNotification } from '../../common/views';

export type NotificationType =
  | 'REPORT_READY'
  | 'ISSUE_FLAGGED'
  | 'REPAIR_STATUS_UPDATED'
  | 'INSPECTION_ASSIGNED'
  | 'INSPECTION_SCHEDULED'
  | 'REPAIR_REQUESTED'
  | 'JOB_ASSIGNED'
  | 'ACCOUNT_VERIFIED'
  | 'NEW_MESSAGE';

/**
 * Fan-out for every trigger event (TR-009): stores the in-app notification,
 * pushes it over Socket.IO to the user's room and emails it when the user's
 * channel preference includes email. Payload is { title, body, href }.
 */
@Injectable()
export class NotificationService {
  constructor(
    private prisma: PrismaService,
    private gateway: NotificationGateway,
    private emailService: EmailService,
  ) {}

  async notify(userId: string, type: NotificationType, title: string, body: string, href?: string) {
    const created = await this.prisma.notification.create({
      data: { userId, type, payload: { title, body, ...(href ? { href } : {}) } },
      include: { user: { include: { preference: true } } },
    });
    const { user, ...row } = created;
    const n = toNotification(row);
    this.gateway.emitToUser(userId, 'notification.new', n);

    const channel = user.preference?.notificationChannel ?? NotificationChannel.BOTH;
    if (channel !== NotificationChannel.IN_APP) {
      // fire-and-forget: email latency must never block the request
      void this.emailService.sendMail(user.email, `[GroundPulse] ${title}`, this.emailHtml(user.name, title, body, href));
    }
    return n;
  }

  async notifyAdmins(type: NotificationType, title: string, body: string, href?: string) {
    const admins = await this.adminIds();
    await Promise.all(admins.map((id) => this.notify(id, type, title, body, href)));
  }

  async adminIds() {
    const admins = await this.prisma.user.findMany({ where: { role: Role.ADMIN }, select: { id: true } });
    return admins.map((a) => a.id);
  }

  /** Push a realtime event to several users (deduplicated, nulls ignored). */
  emit(userIds: (string | null | undefined)[], event: string, payload: unknown) {
    new Set(userIds.filter(Boolean) as string[]).forEach((id) => this.gateway.emitToUser(id, event, payload));
  }

  async emitWithAdmins(userIds: (string | null | undefined)[], event: string, payload: unknown) {
    this.emit([...userIds, ...(await this.adminIds())], event, payload);
  }

  async dashboardChanged() {
    this.emit(await this.adminIds(), 'dashboard.changed', {});
  }

  async list(userId: string) {
    const rows = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map(toNotification);
  }

  async markAsRead(id: string, userId: string) {
    const n = await this.prisma.notification.findUnique({ where: { id } });
    if (!n || n.userId !== userId) throw GroundPulseException.notFound('Notification not found');
    await this.prisma.notification.update({ where: { id }, data: { read: true } });
    return { ok: true };
  }

  async markAllRead(userId: string) {
    await this.prisma.notification.updateMany({ where: { userId, read: false }, data: { read: true } });
    return { ok: true };
  }

  private emailHtml(name: string, title: string, body: string, href?: string) {
    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const link = href ? `<p><a href="${appUrl}${href}" style="color:#12452E;font-weight:600">Open in GroundPulse</a></p>` : '';
    return `<div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;border:1px solid #E4DFD2;border-radius:12px">
      <h2 style="color:#12452E;margin-top:0">${title}</h2>
      <p>Hello ${name},</p>
      <p>${body}</p>${link}
      <p style="color:#6B6B63;font-size:13px">You can change how you receive notifications in Settings.</p>
    </div>`;
  }
}
