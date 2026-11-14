import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { GroundPulseException } from '../../common/exceptions/ground-pulse.exception';
import { providerInclude, toProviderProfile } from '../../common/views';

@Injectable()
export class ProviderService {
  constructor(private prisma: PrismaService) {}

  /** Admin: providers filtered by verification, locality and service type (US-009). */
  async list(f: { verified?: string; locality?: string; serviceType?: string }) {
    const where: Prisma.ServiceProviderWhereInput = {};
    if (f.verified === 'true') where.verified = true;
    if (f.locality) where.locality = { equals: f.locality, mode: 'insensitive' };
    if (f.serviceType) where.serviceTypes = { has: f.serviceType };
    const rows = await this.prisma.serviceProvider.findMany({
      where,
      include: providerInclude,
      orderBy: [{ verified: 'desc' }, { rating: { sort: 'desc', nulls: 'last' } }],
    });
    return rows.map(toProviderProfile);
  }

  async me(userId: string) {
    const sp = await this.prisma.serviceProvider.findUnique({ where: { userId }, include: providerInclude });
    if (!sp) throw GroundPulseException.forbidden('No provider profile for this account.');
    return toProviderProfile(sp);
  }
}
