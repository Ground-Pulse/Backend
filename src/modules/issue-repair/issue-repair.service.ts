import { Injectable } from '@nestjs/common';
import { InspectionStatus, IssueStatus, Prisma, RepairStatus, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { GroundPulseException } from '../../common/exceptions/ground-pulse.exception';
import { AuthUser } from '../../common/access';
import { writeAudit } from '../../common/audit';
import { auditInclude, issueInclude, IssueRow, repairInclude, RepairRow, toAudit, toIssue, toRepair } from '../../common/views';
import { NotificationService } from '../notification/notification.service';
import { AssignProviderDto, CompleteRepairDto, FlagIssueDto, RepairStatusDto } from './dto/issue-repair.dto';

/** Requested → Assigned → In Progress → Completed (TR-010). ASSIGNED → REQUESTED = provider declined. */
const TRANSITIONS: Record<RepairStatus, RepairStatus[]> = {
  REQUESTED: [RepairStatus.ASSIGNED],
  ASSIGNED: [RepairStatus.IN_PROGRESS, RepairStatus.REQUESTED],
  IN_PROGRESS: [RepairStatus.COMPLETED],
  COMPLETED: [],
};

const STATUS_TITLE: Record<RepairStatus, string> = {
  REQUESTED: 'Repair waiting for a provider',
  ASSIGNED: 'Provider assigned',
  IN_PROGRESS: 'Repair in progress',
  COMPLETED: 'Repair completed',
};

const lower = (s: string) => s.replace('_', ' ').toLowerCase();

@Injectable()
export class IssueRepairService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationService,
  ) {}

  // ================================================================ issues

  async listIssues(user: AuthUser, f: { propertyId?: string; status?: string }) {
    const where: Prisma.IssueWhereInput = {};
    if (user.role === Role.OWNER) where.property = { ownerId: user.id };
    else if (user.role === Role.INSPECTOR) where.flaggedBy = user.id;
    else if (user.role !== Role.ADMIN) throw GroundPulseException.forbidden();
    if (f.propertyId) where.propertyId = f.propertyId;
    if (f.status) where.status = { in: f.status.split(',') as IssueStatus[] };
    const rows = await this.prisma.issue.findMany({ where, include: issueInclude, orderBy: { createdAt: 'desc' } });
    return rows.map(toIssue);
  }

  /** Owner, admin, the flagging inspector, or the assigned provider. 404 otherwise. */
  private async getVisibleIssue(user: AuthUser, id: string): Promise<IssueRow> {
    const issue = await this.prisma.issue.findUnique({ where: { id }, include: issueInclude });
    const allowed =
      issue &&
      (user.role === Role.ADMIN ||
        (user.role === Role.OWNER && issue.property.ownerId === user.id) ||
        (user.role === Role.INSPECTOR && issue.flaggedBy === user.id) ||
        (user.role === Role.PROVIDER && issue.repair?.provider?.userId === user.id));
    if (!issue || !allowed) throw GroundPulseException.issueNotFound();
    return issue;
  }

  async flagIssue(user: AuthUser, dto: FlagIssueDto) {
    const ins = await this.prisma.inspection.findUnique({ where: { id: dto.inspectionId }, include: { property: true } });
    if (!ins || ins.inspectorId !== user.id) throw GroundPulseException.inspectionNotFound();
    if (ins.status === InspectionStatus.SUBMITTED) throw GroundPulseException.inspectionAlreadySubmitted('This inspection is locked.');
    if (!dto.mediaUrls.length) throw GroundPulseException.issueMediaRequired('At least one photo is required.');

    const issue = await this.prisma.$transaction(async (tx) => {
      const created = await tx.issue.create({
        data: {
          inspectionId: ins.id,
          propertyId: ins.propertyId,
          category: dto.category,
          description: dto.description.trim(),
          mediaUrls: dto.mediaUrls,
          flaggedBy: user.id,
        },
        include: issueInclude,
      });
      await writeAudit(tx, 'Issue', created.id, 'FLAGGED', user.id, { category: created.category });
      return created;
    });

    await this.notifications.notify(
      ins.property.ownerId,
      'ISSUE_FLAGGED',
      `Issue flagged: ${issue.category.toLowerCase()}`,
      `${user.name} flagged an issue at ${ins.property.name}. Review it and approve or decline the repair.`,
      `/issue/${issue.id}`,
    );
    await this.notifications.emitWithAdmins([ins.property.ownerId], 'issue.flagged', { issueId: issue.id, propertyId: ins.propertyId });
    return toIssue(issue);
  }

  async issueDetail(user: AuthUser, id: string) {
    const issue = await this.getVisibleIssue(user, id);
    const [repair, audit, messages] = await Promise.all([
      this.prisma.repair.findUnique({ where: { issueId: id }, include: repairInclude }),
      this.prisma.auditLog.findMany({
        where: {
          OR: [
            { entityType: 'Issue', entityId: id },
            ...(issue.repair ? [{ entityType: 'Repair', entityId: issue.repair.id }] : []),
          ],
        },
        include: auditInclude,
        orderBy: { timestamp: 'asc' },
      }),
      this.listMessagesRaw(id),
    ]);
    return {
      ...toIssue(issue),
      repair: repair ? toRepair(repair) : null,
      auditTrail: audit.map(toAudit),
      messages,
    };
  }

  /** Owner approval creates the repair — nothing happens without it (BR-008). */
  async approve(user: AuthUser, id: string) {
    const issue = await this.getVisibleIssue(user, id);
    if (user.role !== Role.OWNER) throw GroundPulseException.forbidden('Only the owner can approve a repair.');
    if (issue.status !== IssueStatus.FLAGGED) throw GroundPulseException.issueAlreadyDecided('A decision was already made on this issue.');

    const repair = await this.prisma.$transaction(async (tx) => {
      // conditional update guards against a double-click race
      const { count } = await tx.issue.updateMany({ where: { id, status: IssueStatus.FLAGGED }, data: { status: IssueStatus.APPROVED } });
      if (!count) throw GroundPulseException.issueAlreadyDecided();
      const r = await tx.repair.create({ data: { issueId: id }, include: repairInclude });
      await writeAudit(tx, 'Issue', id, 'APPROVED', user.id);
      await writeAudit(tx, 'Repair', r.id, 'CREATED', user.id, { status: RepairStatus.REQUESTED });
      return r;
    });

    await this.notifications.notifyAdmins(
      'REPAIR_REQUESTED',
      'Repair needs a provider',
      `${user.name} approved a ${issue.category.toLowerCase()} repair at ${issue.property.name}, ${issue.property.city}.`,
      '/admin/reassign',
    );
    await this.notifications.emitWithAdmins([user.id], 'repair.status.updated', { repairId: repair.id, status: repair.status, issueId: id });
    await this.notifications.dashboardChanged();
    return toRepair(repair);
  }

  async decline(user: AuthUser, id: string, reason?: string) {
    const issue = await this.getVisibleIssue(user, id);
    if (user.role !== Role.OWNER) throw GroundPulseException.forbidden('Only the owner can decline a repair.');
    if (issue.status !== IssueStatus.FLAGGED) throw GroundPulseException.issueAlreadyDecided('A decision was already made on this issue.');
    const text = reason?.trim();
    if (!text) throw GroundPulseException.validation('Please give a reason for declining.');
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.issue.update({ where: { id }, data: { status: IssueStatus.DECLINED, decisionReason: text }, include: issueInclude });
      await writeAudit(tx, 'Issue', id, 'DECLINED', user.id, { reason: text });
      return u;
    });
    await this.notifications.dashboardChanged();
    return toIssue(updated);
  }

  private async listMessagesRaw(issueId: string) {
    const rows = await this.prisma.issueMessage.findMany({
      where: { issueId },
      include: { author: { select: { name: true, role: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((m) => ({
      id: m.id,
      issueId: m.issueId,
      authorId: m.authorId,
      authorName: m.author.name,
      authorRole: m.author.role,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    }));
  }

  async listMessages(user: AuthUser, issueId: string) {
    await this.getVisibleIssue(user, issueId);
    return this.listMessagesRaw(issueId);
  }

  /** Per-issue thread between owner, inspector and provider (S-017). */
  async postMessage(user: AuthUser, issueId: string, body: string) {
    const issue = await this.getVisibleIssue(user, issueId);
    const m = await this.prisma.issueMessage.create({ data: { issueId, authorId: user.id, body: body.trim() } });
    const participants = [issue.property.ownerId, issue.flaggedBy, issue.repair?.provider?.userId].filter(
      (id): id is string => !!id && id !== user.id,
    );
    await Promise.all(
      participants.map((id) => this.notifications.notify(id, 'NEW_MESSAGE', `New message from ${user.name}`, body.trim().slice(0, 120), `/issue/${issueId}`)),
    );
    return {
      id: m.id,
      issueId,
      authorId: user.id,
      authorName: user.name,
      authorRole: user.role,
      body: m.body,
      createdAt: m.createdAt.toISOString(),
    };
  }

  // ================================================================ repairs

  async listRepairs(user: AuthUser, status?: string) {
    const where: Prisma.RepairWhereInput = {};
    if (user.role === Role.OWNER) where.issue = { property: { ownerId: user.id } };
    else if (user.role === Role.PROVIDER) where.provider = { userId: user.id };
    else if (user.role !== Role.ADMIN) throw GroundPulseException.forbidden();
    if (status) where.status = { in: status.split(',') as RepairStatus[] };
    const rows = await this.prisma.repair.findMany({ where, include: repairInclude, orderBy: { updatedAt: 'desc' } });
    return rows.map(toRepair);
  }

  private async getRepair(id: string) {
    const r = await this.prisma.repair.findUnique({ where: { id }, include: repairInclude });
    if (!r) throw GroundPulseException.repairNotFound();
    return r;
  }

  private assertMyJob(user: AuthUser, r: RepairRow) {
    if (user.role === Role.PROVIDER && r.provider?.userId !== user.id) throw GroundPulseException.forbidden("This job isn't assigned to you.");
  }

  /** State-machine transition + audit + owner notification + realtime push. */
  private async transition(
    tx: Prisma.TransactionClient,
    user: AuthUser,
    r: RepairRow,
    to: RepairStatus,
    data: Prisma.RepairUpdateInput = {},
    meta: Record<string, unknown> = {},
  ) {
    if (!TRANSITIONS[r.status].includes(to)) {
      throw GroundPulseException.repairInvalidTransition(`A repair can't move from ${r.status} to ${to}.`);
    }
    const updated = await tx.repair.update({ where: { id: r.id }, data: { ...data, status: to }, include: repairInclude });
    const action = to === RepairStatus.ASSIGNED ? 'ASSIGNED' : to === RepairStatus.COMPLETED ? 'COMPLETED' : 'STATUS_CHANGED';
    await writeAudit(tx, 'Repair', r.id, action, user.id, { from: r.status, to, ...meta });
    if (to === RepairStatus.COMPLETED) {
      await tx.issue.update({ where: { id: r.issueId }, data: { status: IssueStatus.CLOSED } });
    }
    return updated;
  }

  private async afterTransition(r: RepairRow) {
    const p = r.issue.property;
    await this.notifications.notify(
      p.ownerId,
      'REPAIR_STATUS_UPDATED',
      STATUS_TITLE[r.status],
      `${p.name}: ${r.issue.category.toLowerCase()} repair is now ${lower(r.status)}.`,
      `/issue/${r.issueId}`,
    );
    await this.notifications.emitWithAdmins([p.ownerId, r.provider?.userId], 'repair.status.updated', {
      repairId: r.id,
      status: r.status,
      issueId: r.issueId,
    });
    await this.notifications.dashboardChanged();
  }

  /** Admin assigns (or reassigns, before acceptance) a VERIFIED provider (TR-011). */
  async assign(user: AuthUser, id: string, dto: AssignProviderDto) {
    const r = await this.getRepair(id);
    const sp = await this.prisma.serviceProvider.findUnique({ where: { id: dto.providerId } });
    if (!sp) throw GroundPulseException.notFound('Provider not found.');
    if (!sp.verified) throw GroundPulseException.providerNotVerified('Only verified providers can be assigned.');

    let updated: RepairRow;
    if (r.status === RepairStatus.ASSIGNED) {
      updated = await this.prisma.$transaction(async (tx) => {
        const u = await tx.repair.update({ where: { id }, data: { providerId: sp.id }, include: repairInclude });
        await writeAudit(tx, 'Repair', id, 'REASSIGNED', user.id, { from: r.providerId, to: sp.id });
        return u;
      });
      await this.notifications.emitWithAdmins([r.issue.property.ownerId, sp.userId], 'repair.status.updated', { repairId: id, status: updated.status, issueId: r.issueId });
    } else {
      updated = await this.prisma.$transaction((tx) => this.transition(tx, user, r, RepairStatus.ASSIGNED, { provider: { connect: { id: sp.id } } }, { providerId: sp.id }));
      await this.afterTransition(updated);
    }

    const p = r.issue.property;
    await this.notifications.notify(sp.userId, 'JOB_ASSIGNED', 'New job assigned', `${r.issue.category.toLowerCase()} repair at ${p.name}, ${p.address}, ${p.city}.`, '/provider/jobs');
    return toRepair(updated);
  }

  /** Provider accepts (ASSIGNED → IN_PROGRESS) with an optional cost estimate; admins may also move states. */
  async updateStatus(user: AuthUser, id: string, dto: RepairStatusDto) {
    const r = await this.getRepair(id);
    this.assertMyJob(user, r);
    const data: Prisma.RepairUpdateInput = {};
    const meta: Record<string, unknown> = {};
    if (dto.costEstimate != null) {
      data.costEstimate = new Prisma.Decimal(dto.costEstimate);
      meta.costEstimate = dto.costEstimate;
    }
    const updated = await this.prisma.$transaction((tx) => this.transition(tx, user, r, dto.status, data, meta));
    await this.afterTransition(updated);
    return toRepair(updated);
  }

  async declineJob(user: AuthUser, id: string, reason?: string) {
    const r = await this.getRepair(id);
    this.assertMyJob(user, r);
    const why = reason?.trim() || 'Not available';
    const updated = await this.prisma.$transaction((tx) =>
      this.transition(tx, user, r, RepairStatus.REQUESTED, { provider: { disconnect: true } }, { declinedBy: r.providerId, reason: why }),
    );
    await this.afterTransition(updated);
    await this.notifications.notifyAdmins('REPAIR_REQUESTED', 'Provider declined a job', `${user.name} declined: "${why}". Reassign a provider.`, '/admin/reassign');
    return toRepair(updated);
  }

  async complete(user: AuthUser, id: string, dto: CompleteRepairDto) {
    const r = await this.getRepair(id);
    this.assertMyJob(user, r);
    const notes = dto.completionNotes?.trim();
    if (!notes) throw GroundPulseException.completionNoteRequired();
    const updated = await this.prisma.$transaction((tx) =>
      this.transition(tx, user, r, RepairStatus.COMPLETED, { completionNotes: notes, completionPhotos: dto.completionPhotos ?? [] }, { notes }),
    );
    await this.afterTransition(updated);
    return toRepair(updated);
  }

  /** Owner rates the provider after completion (S-016); provider average is recomputed. */
  async rate(user: AuthUser, id: string, rating: number) {
    const r = await this.getRepair(id);
    if (r.issue.property.ownerId !== user.id) throw GroundPulseException.forbiddenNotOwner('Not your repair.');
    if (r.status !== RepairStatus.COMPLETED) throw GroundPulseException.conflict('VALIDATION_ERROR', 'You can rate a provider once the repair is completed.');
    const updated = await this.prisma.$transaction(async (tx) => {
      const u = await tx.repair.update({ where: { id }, data: { ownerRating: rating }, include: repairInclude });
      if (r.providerId) {
        const agg = await tx.repair.aggregate({ where: { providerId: r.providerId, ownerRating: { not: null } }, _avg: { ownerRating: true } });
        await tx.serviceProvider.update({
          where: { id: r.providerId },
          data: { rating: agg._avg.ownerRating == null ? null : new Prisma.Decimal(agg._avg.ownerRating.toFixed(2)) },
        });
      }
      await writeAudit(tx, 'Repair', id, 'RATED', user.id, { rating });
      return tx.repair.findUniqueOrThrow({ where: { id: u.id }, include: repairInclude });
    });
    return toRepair(updated);
  }
}
