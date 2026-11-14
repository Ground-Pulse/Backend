import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InspectionStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { GroundPulseException } from '../../common/exceptions/ground-pulse.exception';
import { AuthUser } from '../../common/access';
import { writeAudit } from '../../common/audit';
import { inspectionInclude, issueInclude, toChecklistItem, toInspection, toIssue, toReport } from '../../common/views';
import { NotificationService } from '../notification/notification.service';
import { SaveChecklistDraftDto, ScheduleInspectionDto } from './dto/inspection.dto';
import { createInspectionWithChecklist, QUEUE_ASSIGNMENTS, QUEUE_REPORTS } from './inspection.factory';

export interface InspectionFilters {
  propertyId?: string;
  status?: string;
  unassigned?: string;
}

@Injectable()
export class InspectionService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationService,
    @InjectQueue(QUEUE_REPORTS) private reportsQueue: Queue,
    @InjectQueue(QUEUE_ASSIGNMENTS) private assignmentsQueue: Queue,
  ) {}

  /** Role-scoped list: owners → their properties, inspectors → assigned, admins → all. */
  async list(user: AuthUser, f: InspectionFilters) {
    const where: Prisma.InspectionWhereInput = {};
    if (user.role === Role.OWNER) where.property = { ownerId: user.id };
    else if (user.role === Role.INSPECTOR) where.inspectorId = user.id;
    else if (user.role !== Role.ADMIN) throw GroundPulseException.forbidden();
    if (f.propertyId) where.propertyId = f.propertyId;
    if (f.status) where.status = { in: f.status.split(',') as InspectionStatus[] };
    if (f.unassigned === 'true') where.inspectorId = null;
    const rows = await this.prisma.inspection.findMany({ where, include: inspectionInclude, orderBy: { scheduledDate: 'asc' } });
    return rows.map(toInspection);
  }

  /** Throws 404 (not 403) so callers can't probe for other users' inspections. */
  async getVisible(user: AuthUser, id: string) {
    const i = await this.prisma.inspection.findUnique({ where: { id }, include: inspectionInclude });
    const allowed =
      i &&
      (user.role === Role.ADMIN ||
        (user.role === Role.OWNER && i.property.ownerId === user.id) ||
        (user.role === Role.INSPECTOR && i.inspectorId === user.id));
    if (!i || !allowed) throw GroundPulseException.inspectionNotFound();
    return i;
  }

  async detail(user: AuthUser, id: string) {
    const i = await this.getVisible(user, id);
    const [items, issues, report] = await Promise.all([
      this.prisma.checklistItem.findMany({ where: { inspectionId: id }, orderBy: { position: 'asc' } }),
      this.prisma.issue.findMany({ where: { inspectionId: id }, include: issueInclude, orderBy: { createdAt: 'asc' } }),
      this.prisma.inspectionReport.findUnique({ where: { inspectionId: id } }),
    ]);
    return {
      ...toInspection(i),
      checklistItems: items.map(toChecklistItem),
      issues: issues.map(toIssue),
      report: report ? toReport(report) : null,
    };
  }

  async schedule(user: AuthUser, dto: ScheduleInspectionDto) {
    const p = await this.prisma.property.findUnique({ where: { id: dto.propertyId } });
    if (!p || p.archived) throw GroundPulseException.propertyNotFound();
    if (user.role === Role.OWNER && p.ownerId !== user.id) throw GroundPulseException.forbiddenNotOwner();

    const date = new Date(dto.scheduledDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) throw GroundPulseException.pastDateNotAllowed('Please select a valid future date.');

    const row = await this.prisma.$transaction(async (tx) => {
      const ins = await createInspectionWithChecklist(tx, {
        propertyId: p.id,
        propertyType: p.type,
        scheduledDate: date,
        recurrenceRule: dto.recurrenceRule ?? null,
        inspectorId: null,
      });
      await writeAudit(tx, 'Inspection', ins.id, 'SCHEDULED', user.id, {
        scheduledDate: ins.scheduledDate.toISOString(),
        recurrenceRule: ins.recurrenceRule,
      });
      return tx.inspection.findUniqueOrThrow({ where: { id: ins.id }, include: inspectionInclude });
    });

    // Async auto-assignment (verified inspector with the lightest load)
    await this.assignmentsQueue.add('assign-inspector', { inspectionId: row.id }, { delay: 1500, attempts: 3, removeOnComplete: true });
    await this.notifications.dashboardChanged();
    return toInspection(row);
  }

  async start(user: AuthUser, id: string) {
    const i = await this.getVisible(user, id);
    if (i.status === InspectionStatus.SUBMITTED) throw GroundPulseException.inspectionAlreadySubmitted();
    if (i.status === InspectionStatus.IN_PROGRESS) return toInspection(i);
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.inspection.update({
        where: { id },
        data: { status: InspectionStatus.IN_PROGRESS, startedAt: new Date() },
        include: inspectionInclude,
      });
      await writeAudit(tx, 'Inspection', id, 'STARTED', user.id);
      return u;
    });
    await this.notifications.emitWithAdmins([i.property.ownerId], 'inspection.updated', { inspectionId: id, status: updated.status });
    return toInspection(updated);
  }

  /** UPSERT-style draft save (TR-005). Only items belonging to this inspection are touched. */
  async saveDraft(user: AuthUser, id: string, dto: SaveChecklistDraftDto) {
    const i = await this.getVisible(user, id);
    if (i.status === InspectionStatus.SUBMITTED) throw GroundPulseException.inspectionAlreadySubmitted('This checklist is locked.');
    await this.prisma.$transaction([
      ...dto.items.map((item) =>
        this.prisma.checklistItem.updateMany({
          where: { id: item.id, inspectionId: id },
          data: { status: item.status ?? null, mediaUrls: item.mediaUrls ?? [], notes: item.notes ?? null },
        }),
      ),
      ...(i.status === InspectionStatus.SCHEDULED
        ? [this.prisma.inspection.update({ where: { id }, data: { status: InspectionStatus.IN_PROGRESS, startedAt: new Date() } })]
        : []),
    ]);
    return { ok: true, savedAt: new Date().toISOString() };
  }

  /** Locks the checklist and enqueues report generation (BullMQ). */
  async submit(user: AuthUser, id: string) {
    const i = await this.getVisible(user, id);
    if (i.status === InspectionStatus.SUBMITTED) throw GroundPulseException.inspectionAlreadySubmitted();
    const incomplete = await this.prisma.checklistItem.count({ where: { inspectionId: id, status: null } });
    if (incomplete) throw GroundPulseException.checklistIncomplete('Complete all checklist items before submitting.');
    await this.prisma.$transaction(async (tx) => {
      await tx.inspection.update({ where: { id }, data: { status: InspectionStatus.SUBMITTED, submittedAt: new Date() } });
      await writeAudit(tx, 'Inspection', id, 'SUBMITTED', user.id, { items: i.checklistItems.length });
    });
    await this.reportsQueue.add('generate-report', { inspectionId: id }, { attempts: 3, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: true });
    await this.notifications.emitWithAdmins([i.property.ownerId], 'inspection.updated', { inspectionId: id, status: InspectionStatus.SUBMITTED });
    return { ok: true, inspectionId: id, message: 'Report is being generated.' };
  }

  async cancel(user: AuthUser, id: string) {
    const i = await this.getVisible(user, id);
    if (i.status !== InspectionStatus.SCHEDULED) {
      throw GroundPulseException.conflict('VALIDATION_ERROR', 'Only scheduled inspections can be cancelled.');
    }
    await this.prisma.$transaction(async (tx) => {
      await writeAudit(tx, 'Inspection', id, 'CANCELLED', user.id, { scheduledDate: i.scheduledDate.toISOString() });
      await tx.inspection.delete({ where: { id } });
    });
    if (i.inspectorId) {
      await this.notifications.notify(
        i.inspectorId,
        'INSPECTION_ASSIGNED',
        'Job cancelled',
        `The inspection of ${i.property.name} on ${i.scheduledDate.toLocaleDateString('en-IN')} was cancelled by the owner.`,
        '/inspections',
      );
    }
    await this.notifications.dashboardChanged();
    return { ok: true };
  }
}
