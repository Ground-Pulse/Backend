import { Injectable } from '@nestjs/common';
import { InspectionStatus, IssueStatus, Prisma, RepairStatus, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { GroundPulseException } from '../../common/exceptions/ground-pulse.exception';
import { AuthUser } from '../../common/access';
import { writeAudit } from '../../common/audit';
import { DEFAULT_TEMPLATES } from '../../common/checklist-templates';
import { auditInclude, inspectionInclude, publicUser, toAudit, toInspection } from '../../common/views';
import { NotificationService } from '../notification/notification.service';
import { ReassignDto, SaveTemplateDto } from './dto/admin.dto';

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationService,
  ) {}

  /** Live counts (US-011), in one transaction so they're consistent with each other. */
  async dashboard() {
    const [activeProperties, pendingInspections, openIssues, inProgressRepairs, pendingVerifications, requestedRepairs] =
      await this.prisma.$transaction([
        this.prisma.property.count({ where: { archived: false } }),
        this.prisma.inspection.count({ where: { status: { not: InspectionStatus.SUBMITTED } } }),
        this.prisma.issue.count({ where: { status: IssueStatus.FLAGGED } }),
        this.prisma.repair.count({ where: { status: { in: [RepairStatus.ASSIGNED, RepairStatus.IN_PROGRESS] } } }),
        this.prisma.user.count({ where: { role: { in: [Role.INSPECTOR, Role.PROVIDER] }, verified: false } }),
        this.prisma.repair.count({ where: { status: RepairStatus.REQUESTED } }),
      ]);
    return { activeProperties, pendingInspections, openIssues, inProgressRepairs, pendingVerifications, requestedRepairs };
  }

  async inspectors(verifiedOnly: boolean) {
    const rows = await this.prisma.user.findMany({
      where: { role: Role.INSPECTOR, ...(verifiedOnly ? { verified: true } : {}) },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        verified: true,
        _count: { select: { inspections: { where: { status: { not: InspectionStatus.SUBMITTED } } } } },
      },
      orderBy: { name: 'asc' },
    });
    return rows.map(({ _count, ...u }) => ({ ...u, activeJobs: _count.inspections }));
  }

  /** Manual (re)assignment of a verified inspector. Repairs use POST /repairs/:id/assign. */
  async reassign(admin: AuthUser, dto: ReassignDto) {
    if (dto.kind !== 'INSPECTION') throw GroundPulseException.validation('Use /repairs/:id/assign for repairs.');
    const ins = await this.prisma.inspection.findUnique({ where: { id: dto.id }, include: { property: true } });
    if (!ins) throw GroundPulseException.inspectionNotFound();
    if (ins.status === InspectionStatus.SUBMITTED) throw GroundPulseException.inspectionAlreadySubmitted("Submitted inspections can't be reassigned.");
    const inspector = await this.prisma.user.findFirst({ where: { id: dto.assigneeId, role: Role.INSPECTOR } });
    if (!inspector) throw GroundPulseException.notFound('Inspector not found.');
    if (!inspector.verified) throw GroundPulseException.inspectorNotVerified();

    const previous = ins.inspectorId;
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.inspection.update({ where: { id: ins.id }, data: { inspectorId: inspector.id }, include: inspectionInclude });
      await writeAudit(tx, 'Inspection', ins.id, previous ? 'REASSIGNED' : 'ASSIGNED', admin.id, { from: previous, to: inspector.id });
      return u;
    });

    const p = ins.property;
    const when = ins.scheduledDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    await this.notifications.notify(inspector.id, 'INSPECTION_ASSIGNED', 'New job assigned', `${p.name}, ${p.city} — ${when}.`, `/inspection/${ins.id}/checklist`);
    await this.notifications.notify(p.ownerId, 'INSPECTION_ASSIGNED', 'Inspector assigned', `${inspector.name} (verified) will inspect ${p.name} on ${when}.`, `/property/${p.id}`);
    if (previous && previous !== inspector.id) {
      await this.notifications.notify(previous, 'INSPECTION_ASSIGNED', 'Job reassigned', `${p.name} on ${when} was moved to another inspector.`, '/inspections');
    }
    this.notifications.emit([p.ownerId, inspector.id, previous], 'inspection.updated', { inspectionId: ins.id, status: ins.status });
    await this.notifications.dashboardChanged();
    return toInspection(updated);
  }

  async verificationQueue() {
    const rows = await this.prisma.user.findMany({
      where: { role: { in: [Role.INSPECTOR, Role.PROVIDER] }, verified: false },
      include: { serviceProvider: true },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((u) => ({
      userId: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      role: u.role,
      serviceTypes: u.serviceProvider?.serviceTypes ?? [],
      locality: u.serviceProvider?.locality ?? null,
      createdAt: u.createdAt.toISOString(),
    }));
  }

  async approveVerification(admin: AuthUser, userId: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u || (u.role !== Role.INSPECTOR && u.role !== Role.PROVIDER)) throw GroundPulseException.notFound('User not found.');
    const updated = await this.prisma.$transaction(async (tx) => {
      const x = await tx.user.update({ where: { id: userId }, data: { verified: true } });
      await tx.serviceProvider.updateMany({ where: { userId }, data: { verified: true } });
      await writeAudit(tx, 'User', userId, 'VERIFIED', admin.id, { role: u.role });
      return x;
    });
    await this.notifications.notify(
      userId,
      'ACCOUNT_VERIFIED',
      "You're verified",
      'Your account has been verified. You can now be assigned jobs.',
      u.role === Role.PROVIDER ? '/provider/jobs' : '/inspections',
    );
    await this.notifications.dashboardChanged();
    return publicUser(updated);
  }

  /** Rejection removes the pending account (it has no jobs yet); the audit row is kept. */
  async rejectVerification(admin: AuthUser, userId: string, reason?: string) {
    const u = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!u || u.verified || (u.role !== Role.INSPECTOR && u.role !== Role.PROVIDER)) throw GroundPulseException.notFound('Pending applicant not found.');
    await this.prisma.$transaction(async (tx) => {
      await writeAudit(tx, 'User', userId, 'VERIFICATION_REJECTED', admin.id, { reason: reason ?? null, email: u.email });
      await tx.user.delete({ where: { id: userId } });
    });
    await this.notifications.dashboardChanged();
    return { ok: true };
  }

  async auditLogs(f: { entityType?: string; entityId?: string }) {
    const where: Prisma.AuditLogWhereInput = {};
    if (f.entityType) where.entityType = f.entityType;
    if (f.entityId) where.entityId = f.entityId;
    const rows = await this.prisma.auditLog.findMany({ where, include: auditInclude, orderBy: { timestamp: 'desc' }, take: 300 });
    return rows.map(toAudit);
  }

  /** Templates for every property type; missing ones are created from the defaults. */
  async templates() {
    const existing = await this.prisma.checklistTemplate.findMany();
    const missing = Object.keys(DEFAULT_TEMPLATES).filter((t) => !existing.some((e) => e.propertyType === t));
    if (missing.length) {
      await this.prisma.checklistTemplate.createMany({
        data: missing.map((propertyType) => ({ propertyType, items: DEFAULT_TEMPLATES[propertyType] })),
        skipDuplicates: true,
      });
    }
    const rows = await this.prisma.checklistTemplate.findMany({ orderBy: { propertyType: 'asc' } });
    const order = Object.keys(DEFAULT_TEMPLATES);
    return rows
      .sort((a, b) => order.indexOf(a.propertyType) - order.indexOf(b.propertyType))
      .map((t) => ({ id: t.id, propertyType: t.propertyType, items: t.items, updatedAt: t.updatedAt.toISOString() }));
  }

  async saveTemplate(id: string, dto: SaveTemplateDto) {
    const items = dto.items
      .map((i) => ({ roomArea: i.roomArea.trim(), itemName: i.itemName.trim() }))
      .filter((i) => i.roomArea && i.itemName);
    if (!items.length) throw GroundPulseException.validation('A template needs at least one item.');
    const exists = await this.prisma.checklistTemplate.findUnique({ where: { id } });
    if (!exists) throw GroundPulseException.notFound('Template not found.');
    const t = await this.prisma.checklistTemplate.update({ where: { id }, data: { items } });
    return { id: t.id, propertyType: t.propertyType, items: t.items, updatedAt: t.updatedAt.toISOString() };
  }
}
