import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateProviderDto } from './dto/update-provider.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class ProviderService {
  constructor(private prisma: PrismaService) {}

  async findAll(verifiedOnly = false) {
    return this.prisma.serviceProvider.findMany({
      where: {
        ...(verifiedOnly && { verified: true }),
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, phone: true },
        },
        _count: {
          select: { repairs: true },
        },
      },
      orderBy: { rating: 'desc' },
    });
  }

  async findOne(id: string) {
    const provider = await this.prisma.serviceProvider.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, name: true, email: true, phone: true },
        },
        repairs: {
          include: {
            issue: {
              include: { property: true },
            },
          },
        },
      },
    });

    if (!provider) {
      throw new NotFoundException('Service provider not found');
    }

    return provider;
  }

  async update(id: string, dto: UpdateProviderDto) {
    const provider = await this.prisma.serviceProvider.findUnique({
      where: { id },
    });

    if (!provider) {
      throw new NotFoundException('Service provider not found');
    }

    return this.prisma.serviceProvider.update({
      where: { id },
      data: {
        ...(dto.serviceTypes !== undefined && { serviceTypes: dto.serviceTypes }),
        ...(dto.locality !== undefined && { locality: dto.locality }),
        ...(dto.verified !== undefined && { verified: dto.verified }),
        ...(dto.rating !== undefined && { rating: new Prisma.Decimal(dto.rating) }),
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, phone: true },
        },
      },
    });
  }

  async getMyRepairs(userId: string) {
    const provider = await this.prisma.serviceProvider.findUnique({
      where: { userId },
    });

    if (!provider) {
      return [];
    }

    return this.prisma.repair.findMany({
      where: { providerId: provider.id },
      include: {
        issue: {
          include: {
            property: true,
            inspector: {
              select: { id: true, name: true, phone: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
