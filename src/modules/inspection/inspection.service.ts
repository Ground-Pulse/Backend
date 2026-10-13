import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { ScheduleInspectionDto } from './dto/schedule-inspection.dto';
import { BatchUpdateChecklistDto } from './dto/update-checklist.dto';
import { GroundPulseException } from '../../common/exceptions/ground-pulse.exception';
import { InspectionStatus, Role, User } from '@prisma/client';

@Injectable()
export class InspectionService {
  private readonly logger = new Logger(InspectionService.name);

  constructor(
    private prisma: PrismaService,
    @InjectQueue('reports') private reportsQueue: Queue,
  ) {}

  async schedule(user: Omit<User, 'passwordHash'>, dto: ScheduleInspectionDto) {
    const scheduledDate = new Date(dto.scheduledDate);
    const now = new Date();
    // Allow today or future, but ensure not in past day
    if (scheduledDate < new Date(now.setHours(0, 0, 0, 0))) {
      throw GroundPulseException.pastDateNotAllowed();
    }

    const property = await this.prisma.property.findUnique({
      where: { id: dto.propertyId },
    });

    if (!property) {
      throw GroundPulseException.propertyNotFound();
    }

    if (user.role === Role.OWNER && property.ownerId !== user.id) {
      throw GroundPulseException.forbiddenNotOwner();
    }

    const inspection = await this.prisma.$transaction(async (tx) => {
      const created = await tx.inspection.create({
        data: {
          propertyId: dto.propertyId,
          inspectorId: dto.inspectorId || (user.role === Role.INSPECTOR ? user.id : null),
          scheduledDate: new Date(dto.scheduledDate),
          recurrenceRule: dto.recurrenceRule,
          status: InspectionStatus.SCHEDULED,
        },
      });

      // Default baseline checklist items
      await tx.checklistItem.createMany({
        data: [
          {
            inspectionId: created.id,
            roomArea: 'Living Room',
            itemName: 'Main Door Lock & Intercom',
            status: null,
            mediaUrls: [],
          },
          {
            inspectionId: created.id,
            roomArea: 'Master Bedroom',
            itemName: 'Ceiling & Wall Paint Condition',
            status: null,
            mediaUrls: [],
          },
          {
            inspectionId: created.id,
            roomArea: 'Kitchen',
            itemName: 'Sink Plumbing & Drainage',
            status: null,
            mediaUrls: [],
          },
          {
            inspectionId: created.id,
            roomArea: 'Balcony',
            itemName: 'Railing Safety & Floor Drainage',
            status: null,
            mediaUrls: [],
          },
        ],
      });

      await tx.auditLog.create({
        data: {
          entityType: 'INSPECTION',
          entityId: created.id,
          action: 'SCHEDULED',
          actorId: user.id,
          metadata: {
            scheduledDate: dto.scheduledDate,
            propertyId: dto.propertyId,
          },
        },
      });

      return tx.inspection.findUnique({
        where: { id: created.id },
        include: { checklistItems: true, property: true, inspector: true },
      });
    });

    return inspection;
  }

  async findAll(user: Omit<User, 'passwordHash'>, roleQuery?: string) {
    if (user.role === Role.ADMIN) {
      return this.prisma.inspection.findMany({
        include: {
          property: true,
          inspector: {
            select: { id: true, name: true, email: true },
          },
          report: true,
          _count: {
            select: { checklistItems: true, issues: true },
          },
        },
        orderBy: { scheduledDate: 'desc' },
      });
    }

    if (roleQuery === 'inspector' || user.role === Role.INSPECTOR) {
      return this.prisma.inspection.findMany({
        where: { inspectorId: user.id },
        include: {
          property: true,
          report: true,
          _count: {
            select: { checklistItems: true, issues: true },
          },
        },
        orderBy: { scheduledDate: 'desc' },
      });
    }

    // Default to owner inspections
    return this.prisma.inspection.findMany({
      where: {
        property: { ownerId: user.id },
      },
      include: {
        property: true,
        inspector: {
          select: { id: true, name: true, email: true },
        },
        report: true,
        _count: {
          select: { checklistItems: true, issues: true },
        },
      },
      orderBy: { scheduledDate: 'desc' },
    });
  }

  async findOne(id: string, user: Omit<User, 'passwordHash'>) {
    const inspection = await this.prisma.inspection.findUnique({
      where: { id },
      include: {
        property: true,
        inspector: {
          select: { id: true, name: true, email: true, phone: true },
        },
        checklistItems: {
          orderBy: { roomArea: 'asc' },
        },
        report: true,
        issues: {
          include: { repair: true },
        },
      },
    });

    if (!inspection) {
      throw GroundPulseException.inspectionNotFound();
    }

    if (user.role === Role.OWNER && inspection.property.ownerId !== user.id) {
      throw GroundPulseException.forbiddenNotOwner();
    }

    return inspection;
  }

  async updateChecklist(
    id: string,
    user: Omit<User, 'passwordHash'>,
    dto: BatchUpdateChecklistDto,
  ) {
    const inspection = await this.prisma.inspection.findUnique({
      where: { id },
    });

    if (!inspection) {
      throw GroundPulseException.inspectionNotFound();
    }

    if (inspection.status === InspectionStatus.SUBMITTED) {
      throw GroundPulseException.inspectionAlreadySubmitted();
    }

    await this.prisma.$transaction(async (tx) => {
      // Update inspection status to IN_PROGRESS if SCHEDULED
      if (inspection.status === InspectionStatus.SCHEDULED) {
        await tx.inspection.update({
          where: { id },
          data: {
            status: InspectionStatus.IN_PROGRESS,
            startedAt: new Date(),
          },
        });
      }

      // Update individual checklist items
      for (const item of dto.items) {
        await tx.checklistItem.updateMany({
          where: {
            id: item.id,
            inspectionId: id,
          },
          data: {
            ...(item.status !== undefined && { status: item.status }),
            ...(item.mediaUrls !== undefined && { mediaUrls: item.mediaUrls }),
            ...(item.notes !== undefined && { notes: item.notes }),
          },
        });
      }
    });

    return this.prisma.checklistItem.findMany({
      where: { inspectionId: id },
      orderBy: { roomArea: 'asc' },
    });
  }

  async submit(id: string, user: Omit<User, 'passwordHash'>) {
    const inspection = await this.prisma.inspection.findUnique({
      where: { id },
      include: { checklistItems: true },
    });

    if (!inspection) {
      throw GroundPulseException.inspectionNotFound();
    }

    if (inspection.status === InspectionStatus.SUBMITTED) {
      throw GroundPulseException.inspectionAlreadySubmitted();
    }

    // Validate that all items have a non-null status
    const hasIncompleteItems =
      inspection.checklistItems.length === 0 ||
      inspection.checklistItems.some((item) => item.status === null);

    if (hasIncompleteItems) {
      throw GroundPulseException.checklistIncomplete();
    }

    const submitted = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.inspection.update({
        where: { id },
        data: {
          status: InspectionStatus.SUBMITTED,
          submittedAt: new Date(),
        },
      });

      await tx.auditLog.create({
        data: {
          entityType: 'INSPECTION',
          entityId: id,
          action: 'SUBMITTED',
          actorId: user.id,
          metadata: {
            checklistCount: inspection.checklistItems.length,
          },
        },
      });

      return updated;
    });

    // Enqueue BullMQ report generation job
    try {
      await this.reportsQueue.add('generate-report', { inspectionId: id });
      this.logger.log(`Enqueued generate-report job for inspection ${id}`);
    } catch (err: any) {
      this.logger.error(`Failed to enqueue generate-report job: ${err.message}`);
    }

    return submitted;
  }
}
