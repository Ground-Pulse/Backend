import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ReassignDto } from './dto/reassign.dto';
import { GroundPulseException } from '../../common/exceptions/ground-pulse.exception';
import { Role, User } from '@prisma/client';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async getDashboard() {
    const [activeProperties, pendingInspections, openIssues, inProgressRepairs] =
      await Promise.all([
        this.prisma.property.count(),
        this.prisma.inspection.count({
          where: {
            status: { in: ['SCHEDULED', 'IN_PROGRESS'] },
          },
        }),
        this.prisma.issue.count({
          where: {
            status: { in: ['FLAGGED', 'APPROVED'] },
          },
        }),
        this.prisma.repair.count({
          where: {
            status: { in: ['ASSIGNED', 'IN_PROGRESS'] },
          },
        }),
      ]);

    return {
      activeProperties,
      pendingInspections,
      openIssues,
      inProgressRepairs,
    };
  }

  async reassign(adminUser: Omit<User, 'passwordHash'>, dto: ReassignDto) {
    if (dto.type === 'INSPECTOR') {
      const inspector = await this.prisma.user.findFirst({
        where: { id: dto.newAssigneeId, role: Role.INSPECTOR },
      });

      if (!inspector) {
        throw new BadRequestException('Target user is not a valid inspector');
      }

      const inspection = await this.prisma.inspection.findUnique({
        where: { id: dto.targetId },
      });

      if (!inspection) {
        throw GroundPulseException.inspectionNotFound();
      }

      const updated = await this.prisma.$transaction(async (tx) => {
        const ins = await tx.inspection.update({
          where: { id: dto.targetId },
          data: { inspectorId: dto.newAssigneeId },
        });

        await tx.auditLog.create({
          data: {
            entityType: 'INSPECTION',
            entityId: dto.targetId,
            action: 'REASSIGNED',
            actorId: adminUser.id,
            metadata: { newInspectorId: dto.newAssigneeId },
          },
        });

        return ins;
      });

      return { success: true, type: 'INSPECTOR', updated };
    }

    if (dto.type === 'PROVIDER') {
      const provider = await this.prisma.serviceProvider.findUnique({
        where: { id: dto.newAssigneeId },
      });

      if (!provider) {
        throw new BadRequestException('Service provider not found');
      }

      if (!provider.verified) {
        throw GroundPulseException.providerNotVerified();
      }

      const repair = await this.prisma.repair.findUnique({
        where: { id: dto.targetId },
      });

      if (!repair) {
        throw GroundPulseException.repairNotFound();
      }

      const updated = await this.prisma.$transaction(async (tx) => {
        const rep = await tx.repair.update({
          where: { id: dto.targetId },
          data: { providerId: dto.newAssigneeId },
        });

        await tx.auditLog.create({
          data: {
            entityType: 'REPAIR',
            entityId: dto.targetId,
            action: 'REASSIGNED',
            actorId: adminUser.id,
            metadata: { newProviderId: dto.newAssigneeId },
          },
        });

        return rep;
      });

      return { success: true, type: 'PROVIDER', updated };
    }

    throw new BadRequestException('Invalid reassign type');
  }
}
