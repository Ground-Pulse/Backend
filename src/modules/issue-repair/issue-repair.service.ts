import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateIssueDto } from './dto/create-issue.dto';
import { DeclineIssueDto } from './dto/decline-issue.dto';
import {
  AssignProviderDto,
  UpdateRepairStatusDto,
  CompleteRepairDto,
} from './dto/repair-actions.dto';
import { NotificationService } from '../notification/notification.service';
import { NotificationGateway } from '../notification/notification.gateway';
import { GroundPulseException } from '../../common/exceptions/ground-pulse.exception';
import { IssueStatus, RepairStatus, Role, User, Prisma } from '@prisma/client';

@Injectable()
export class IssueRepairService {
  private readonly logger = new Logger(IssueRepairService.name);

  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
    private gateway: NotificationGateway,
  ) {}

  async createIssue(user: Omit<User, 'passwordHash'>, dto: CreateIssueDto) {
    if (!dto.mediaUrls || dto.mediaUrls.length === 0) {
      throw GroundPulseException.issueMediaRequired();
    }

    const inspection = await this.prisma.inspection.findUnique({
      where: { id: dto.inspectionId },
      include: { property: true },
    });

    if (!inspection) {
      throw GroundPulseException.inspectionNotFound();
    }

    const issue = await this.prisma.$transaction(async (tx) => {
      const created = await tx.issue.create({
        data: {
          inspectionId: dto.inspectionId,
          propertyId: dto.propertyId,
          category: dto.category,
          description: dto.description,
          mediaUrls: dto.mediaUrls,
          status: IssueStatus.FLAGGED,
          flaggedBy: user.id,
        },
        include: {
          property: true,
          inspector: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      await tx.auditLog.create({
        data: {
          entityType: 'ISSUE',
          entityId: created.id,
          action: 'FLAGGED',
          actorId: user.id,
          metadata: {
            category: dto.category,
            propertyId: dto.propertyId,
          },
        },
      });

      return created;
    });

    // Notify owner
    const ownerId = issue.property.ownerId;
    const notificationPayload = {
      issueId: issue.id,
      propertyId: issue.propertyId,
      propertyName: issue.property.address,
      category: issue.category,
      description: issue.description,
      message: `Inspector ${user.name} flagged a ${issue.category} issue for ${issue.property.address}.`,
    };

    await this.notificationService.createNotification(
      ownerId,
      'ISSUE_FLAGGED',
      notificationPayload,
      true,
    );

    // Socket.IO event
    this.gateway.emitIssueFlagged(issue.id, issue.propertyId, ownerId);

    return issue;
  }

  async getIssue(id: string, user: Omit<User, 'passwordHash'>) {
    const issue = await this.prisma.issue.findUnique({
      where: { id },
      include: {
        property: true,
        inspection: true,
        inspector: {
          select: { id: true, name: true, email: true, phone: true },
        },
        repair: {
          include: {
            provider: {
              include: {
                user: {
                  select: { id: true, name: true, email: true, phone: true },
                },
              },
            },
          },
        },
      },
    });

    if (!issue) {
      throw GroundPulseException.issueNotFound();
    }

    if (user.role === Role.OWNER && issue.property.ownerId !== user.id) {
      throw GroundPulseException.forbiddenNotOwner();
    }

    return issue;
  }

  async approveIssue(id: string, user: Omit<User, 'passwordHash'>) {
    const issue = await this.prisma.issue.findUnique({
      where: { id },
      include: { property: true },
    });

    if (!issue) {
      throw GroundPulseException.issueNotFound();
    }

    if (user.role !== Role.ADMIN && issue.property.ownerId !== user.id) {
      throw GroundPulseException.forbiddenNotOwner();
    }

    if (issue.status !== IssueStatus.FLAGGED) {
      throw GroundPulseException.issueAlreadyDecided();
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedIssue = await tx.issue.update({
        where: { id },
        data: {
          status: IssueStatus.APPROVED,
        },
      });

      const repair = await tx.repair.create({
        data: {
          issueId: id,
          status: RepairStatus.REQUESTED,
        },
      });

      await tx.auditLog.create({
        data: {
          entityType: 'ISSUE',
          entityId: id,
          action: 'APPROVED',
          actorId: user.id,
          metadata: { repairId: repair.id },
        },
      });

      return { updatedIssue, repair };
    });

    // Real-time broadcast
    this.gateway.emitRepairStatusUpdated(result.repair.id, RepairStatus.REQUESTED);

    return result;
  }

  async declineIssue(id: string, user: Omit<User, 'passwordHash'>, dto: DeclineIssueDto) {
    const issue = await this.prisma.issue.findUnique({
      where: { id },
      include: { property: true },
    });

    if (!issue) {
      throw GroundPulseException.issueNotFound();
    }

    if (user.role !== Role.ADMIN && issue.property.ownerId !== user.id) {
      throw GroundPulseException.forbiddenNotOwner();
    }

    if (issue.status !== IssueStatus.FLAGGED) {
      throw GroundPulseException.issueAlreadyDecided();
    }

    const updatedIssue = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.issue.update({
        where: { id },
        data: {
          status: IssueStatus.CLOSED,
          decisionReason: dto.decisionReason,
        },
      });

      await tx.auditLog.create({
        data: {
          entityType: 'ISSUE',
          entityId: id,
          action: 'DECLINED',
          actorId: user.id,
          metadata: { reason: dto.decisionReason },
        },
      });

      return updated;
    });

    return updatedIssue;
  }

  async assignProvider(repairId: string, user: Omit<User, 'passwordHash'>, dto: AssignProviderDto) {
    const repair = await this.prisma.repair.findUnique({
      where: { id: repairId },
      include: {
        issue: {
          include: { property: true },
        },
      },
    });

    if (!repair) {
      throw GroundPulseException.repairNotFound();
    }

    // Critical Business Rule: Must verify service_providers.verified === true
    const provider = await this.prisma.serviceProvider.findUnique({
      where: { id: dto.providerId },
      include: { user: true },
    });

    if (!provider || !provider.verified) {
      throw GroundPulseException.providerNotVerified();
    }

    const updatedRepair = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.repair.update({
        where: { id: repairId },
        data: {
          providerId: dto.providerId,
          status: RepairStatus.ASSIGNED,
          ...(dto.costEstimate !== undefined && {
            costEstimate: new Prisma.Decimal(dto.costEstimate),
          }),
        },
        include: {
          provider: { include: { user: true } },
          issue: { include: { property: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          entityType: 'REPAIR',
          entityId: repairId,
          action: 'ASSIGNED',
          actorId: user.id,
          metadata: {
            providerId: dto.providerId,
            costEstimate: dto.costEstimate,
          },
        },
      });

      return updated;
    });

    // Notify Owner & Provider
    const ownerId = updatedRepair.issue.property.ownerId;
    const providerUserId = provider.userId;

    const payload = {
      repairId: updatedRepair.id,
      status: RepairStatus.ASSIGNED,
      propertyName: updatedRepair.issue.property.address,
      category: updatedRepair.issue.category,
      providerName: provider.user.name,
      message: `Technician ${provider.user.name} has been assigned to your repair request.`,
    };

    await Promise.all([
      this.notificationService.createNotification(ownerId, 'REPAIR_STATUS_UPDATED', payload),
      this.notificationService.createNotification(providerUserId, 'REPAIR_STATUS_UPDATED', {
        ...payload,
        message: `You have been assigned a new repair job at ${updatedRepair.issue.property.address}.`,
      }),
    ]);

    this.gateway.emitRepairStatusUpdated(repairId, RepairStatus.ASSIGNED, [ownerId, providerUserId]);

    return updatedRepair;
  }

  async updateRepairStatus(
    repairId: string,
    user: Omit<User, 'passwordHash'>,
    dto: UpdateRepairStatusDto,
  ) {
    const repair = await this.prisma.repair.findUnique({
      where: { id: repairId },
      include: {
        issue: { include: { property: true } },
        provider: true,
      },
    });

    if (!repair) {
      throw GroundPulseException.repairNotFound();
    }

    // State machine validation
    const validTransitions: Record<RepairStatus, RepairStatus[]> = {
      [RepairStatus.REQUESTED]: [RepairStatus.ASSIGNED],
      [RepairStatus.ASSIGNED]: [RepairStatus.IN_PROGRESS],
      [RepairStatus.IN_PROGRESS]: [RepairStatus.COMPLETED],
      [RepairStatus.COMPLETED]: [],
    };

    const allowed = validTransitions[repair.status];
    if (!allowed || !allowed.includes(dto.status)) {
      throw GroundPulseException.repairInvalidTransition(
        `Cannot transition repair from ${repair.status} to ${dto.status}`,
      );
    }

    const updatedRepair = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.repair.update({
        where: { id: repairId },
        data: {
          status: dto.status,
        },
        include: {
          issue: { include: { property: true } },
          provider: { include: { user: true } },
        },
      });

      await tx.auditLog.create({
        data: {
          entityType: 'REPAIR',
          entityId: repairId,
          action: 'STATUS_CHANGED',
          actorId: user.id,
          metadata: {
            from: repair.status,
            to: dto.status,
          },
        },
      });

      return updated;
    });

    const ownerId = updatedRepair.issue.property.ownerId;
    const notifyUserIds = [ownerId];
    if (updatedRepair.provider?.userId) {
      notifyUserIds.push(updatedRepair.provider.userId);
    }

    await this.notificationService.createNotification(
      ownerId,
      'REPAIR_STATUS_UPDATED',
      {
        repairId,
        status: dto.status,
        propertyName: updatedRepair.issue.property.address,
        message: `Repair status changed to ${dto.status}.`,
      },
    );

    this.gateway.emitRepairStatusUpdated(repairId, dto.status, notifyUserIds);

    return updatedRepair;
  }

  async completeRepair(
    repairId: string,
    user: Omit<User, 'passwordHash'>,
    dto: CompleteRepairDto,
  ) {
    const repair = await this.prisma.repair.findUnique({
      where: { id: repairId },
      include: {
        issue: { include: { property: true } },
        provider: true,
      },
    });

    if (!repair) {
      throw GroundPulseException.repairNotFound();
    }

    // Verify provider role/assignment if provider
    if (user.role === Role.PROVIDER) {
      if (!repair.provider || repair.provider.userId !== user.id) {
        throw GroundPulseException.forbiddenNotOwner('You are not assigned to this repair');
      }
    }

    if (repair.status !== RepairStatus.IN_PROGRESS && repair.status !== RepairStatus.ASSIGNED) {
      throw GroundPulseException.repairInvalidTransition(
        'Repair must be assigned or in progress to complete',
      );
    }

    const completedRepair = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.repair.update({
        where: { id: repairId },
        data: {
          status: RepairStatus.COMPLETED,
          completionNotes: dto.completionNotes,
          completionPhotos: dto.completionPhotos || [],
        },
        include: {
          issue: { include: { property: true } },
          provider: { include: { user: true } },
        },
      });

      // Mark the parent issue CLOSED once repair is completed
      await tx.issue.update({
        where: { id: repair.issueId },
        data: { status: IssueStatus.CLOSED },
      });

      await tx.auditLog.create({
        data: {
          entityType: 'REPAIR',
          entityId: repairId,
          action: 'COMPLETED',
          actorId: user.id,
          metadata: {
            notes: dto.completionNotes,
            photosCount: dto.completionPhotos?.length || 0,
          },
        },
      });

      return updated;
    });

    const ownerId = completedRepair.issue.property.ownerId;
    await this.notificationService.createNotification(
      ownerId,
      'REPAIR_STATUS_UPDATED',
      {
        repairId,
        status: RepairStatus.COMPLETED,
        propertyName: completedRepair.issue.property.address,
        completionNotes: dto.completionNotes,
        message: `Repair at ${completedRepair.issue.property.address} has been completed!`,
      },
    );

    this.gateway.emitRepairStatusUpdated(repairId, RepairStatus.COMPLETED, [ownerId]);

    return completedRepair;
  }
}
