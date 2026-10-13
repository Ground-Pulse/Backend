import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { Role, User } from '@prisma/client';
import { GroundPulseException } from '../../common/exceptions/ground-pulse.exception';

@Injectable()
export class PropertyService {
  constructor(private prisma: PrismaService) {}

  async findAll(user: Omit<User, 'passwordHash'>) {
    if (user.role === Role.ADMIN) {
      return this.prisma.property.findMany({
        include: {
          owner: {
            select: { id: true, name: true, email: true, phone: true },
          },
          _count: {
            select: { inspections: true, issues: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (user.role === Role.OWNER) {
      return this.prisma.property.findMany({
        where: { ownerId: user.id },
        include: {
          _count: {
            select: { inspections: true, issues: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    if (user.role === Role.INSPECTOR) {
      return this.prisma.property.findMany({
        where: {
          inspections: {
            some: { inspectorId: user.id },
          },
        },
        include: {
          owner: {
            select: { id: true, name: true, email: true, phone: true },
          },
          _count: {
            select: { inspections: true, issues: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    }

    // PROVIDER: properties related to their repairs
    return this.prisma.property.findMany({
      where: {
        issues: {
          some: {
            repair: {
              provider: {
                userId: user.id,
              },
            },
          },
        },
      },
      include: {
        owner: {
          select: { id: true, name: true, email: true, phone: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(user: Omit<User, 'passwordHash'>, dto: CreatePropertyDto) {
    const property = await this.prisma.$transaction(async (tx) => {
      const created = await tx.property.create({
        data: {
          ownerId: user.id,
          address: dto.address,
          type: dto.type,
          coverPhotoUrl: dto.coverPhotoUrl,
          healthScore: null,
        },
      });

      await tx.auditLog.create({
        data: {
          entityType: 'PROPERTY',
          entityId: created.id,
          action: 'CREATED',
          actorId: user.id,
          metadata: {
            address: dto.address,
            type: dto.type,
          },
        },
      });

      return created;
    });

    return property;
  }

  async findOne(id: string, user: Omit<User, 'passwordHash'>) {
    const property = await this.prisma.property.findUnique({
      where: { id },
      include: {
        owner: {
          select: { id: true, name: true, email: true, phone: true },
        },
        inspections: {
          orderBy: { scheduledDate: 'desc' },
          take: 5,
          include: {
            inspector: {
              select: { id: true, name: true, email: true },
            },
            report: true,
          },
        },
        issues: {
          where: {
            status: { in: ['FLAGGED', 'APPROVED'] },
          },
          include: {
            repair: true,
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!property) {
      throw GroundPulseException.propertyNotFound();
    }

    if (user.role === Role.OWNER && property.ownerId !== user.id) {
      throw GroundPulseException.forbiddenNotOwner();
    }

    return property;
  }

  async update(id: string, user: Omit<User, 'passwordHash'>, dto: UpdatePropertyDto) {
    const property = await this.prisma.property.findUnique({
      where: { id },
    });

    if (!property) {
      throw GroundPulseException.propertyNotFound();
    }

    if (user.role !== Role.ADMIN && property.ownerId !== user.id) {
      throw GroundPulseException.forbiddenNotOwner();
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const res = await tx.property.update({
        where: { id },
        data: {
          ...(dto.address && { address: dto.address }),
          ...(dto.type && { type: dto.type }),
          ...(dto.coverPhotoUrl && { coverPhotoUrl: dto.coverPhotoUrl }),
        },
      });

      await tx.auditLog.create({
        data: {
          entityType: 'PROPERTY',
          entityId: id,
          action: 'UPDATED',
          actorId: user.id,
          metadata: dto as any,
        },
      });

      return res;
    });

    return updated;
  }
}
