import { Injectable } from '@nestjs/common';
import { InspectionStatus, IssueStatus, Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { GroundPulseException } from '../../common/exceptions/ground-pulse.exception';
import { AuthUser } from '../../common/access';
import { writeAudit } from '../../common/audit';
import { propertyInclude, toProperty } from '../../common/views';
import { NotificationService } from '../notification/notification.service';
import { CreateDocumentDto, CreatePropertyDto, UpdatePropertyDto } from './dto/property.dto';

@Injectable()
export class PropertyService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationService,
  ) {}

  /** Owner: own properties. Admin: all. */
  async findAll(user: AuthUser) {
    if (user.role !== Role.OWNER && user.role !== Role.ADMIN) throw GroundPulseException.forbidden();
    const rows = await this.prisma.property.findMany({
      where: { archived: false, ...(user.role === Role.OWNER ? { ownerId: user.id } : {}) },
      include: propertyInclude,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toProperty);
  }

  async getRow(id: string) {
    const p = await this.prisma.property.findUnique({ where: { id }, include: propertyInclude });
    if (!p) throw GroundPulseException.propertyNotFound();
    return p;
  }

  /** Owner of the property, admins, or an inspector assigned to one of its inspections. */
  async assertCanView(user: AuthUser, p: { id: string; ownerId: string }) {
    if (user.role === Role.ADMIN || (user.role === Role.OWNER && p.ownerId === user.id)) return;
    if (user.role === Role.INSPECTOR) {
      const assigned = await this.prisma.inspection.count({ where: { propertyId: p.id, inspectorId: user.id } });
      if (assigned) return;
    }
    throw GroundPulseException.forbiddenNotOwner("You don't have access to this property.");
  }

  assertCanEdit(user: AuthUser, p: { ownerId: string }) {
    if (user.role !== Role.ADMIN && p.ownerId !== user.id) throw GroundPulseException.forbiddenNotOwner("You don't own this property.");
  }

  async findOne(id: string, user: AuthUser) {
    const p = await this.getRow(id);
    await this.assertCanView(user, p);
    return toProperty(p);
  }

  async create(user: AuthUser, dto: CreatePropertyDto) {
    const p = await this.prisma.$transaction(async (tx) => {
      const created = await tx.property.create({
        data: {
          ownerId: user.id,
          name: dto.name.trim(),
          address: dto.address.trim(),
          city: dto.city.trim(),
          type: dto.type,
          coverPhotoUrl: dto.coverPhotoUrl,
        },
        include: propertyInclude,
      });
      await writeAudit(tx, 'Property', created.id, 'CREATED', user.id, { address: created.address, type: created.type });
      return created;
    });
    await this.notifications.dashboardChanged();
    return toProperty(p);
  }

  async update(id: string, user: AuthUser, dto: UpdatePropertyDto) {
    const existing = await this.getRow(id);
    this.assertCanEdit(user, existing);
    const data: Prisma.PropertyUpdateInput = {};
    for (const key of ['name', 'address', 'city', 'type', 'coverPhotoUrl'] as const) {
      if (dto[key] !== undefined) data[key] = typeof dto[key] === 'string' ? dto[key]!.trim() : dto[key];
    }
    const p = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.property.update({ where: { id }, data, include: propertyInclude });
      await writeAudit(tx, 'Property', id, 'UPDATED', user.id, {
        before: { name: existing.name, address: existing.address, city: existing.city, type: existing.type },
        after: dto as Record<string, unknown>,
      });
      return updated;
    });
    return toProperty(p);
  }

  /** Archive only — never hard-delete while inspections/issues are open (DB lifecycle rules). */
  async archive(id: string, user: AuthUser) {
    const p = await this.getRow(id);
    this.assertCanEdit(user, p);
    const [openInspections, openIssues] = await Promise.all([
      this.prisma.inspection.count({ where: { propertyId: id, status: { not: InspectionStatus.SUBMITTED } } }),
      this.prisma.issue.count({ where: { propertyId: id, status: { in: [IssueStatus.FLAGGED, IssueStatus.APPROVED] } } }),
    ]);
    if (openInspections || openIssues) {
      throw GroundPulseException.conflict('VALIDATION_ERROR', 'This property has open inspections or issues. Close them before archiving.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.property.update({ where: { id }, data: { archived: true } });
      await writeAudit(tx, 'Property', id, 'ARCHIVED', user.id);
    });
    return { ok: true };
  }

  async healthHistory(id: string, user: AuthUser) {
    const p = await this.getRow(id);
    await this.assertCanView(user, p);
    const rows = await this.prisma.inspection.findMany({
      where: { propertyId: id, status: InspectionStatus.SUBMITTED, report: { isNot: null } },
      include: { report: { select: { healthScore: true } } },
      orderBy: { scheduledDate: 'asc' },
    });
    return rows.map((r) => ({ date: r.scheduledDate.toISOString(), score: r.report!.healthScore }));
  }

  async listDocuments(id: string, user: AuthUser) {
    const p = await this.getRow(id);
    await this.assertCanView(user, p);
    const docs = await this.prisma.propertyDocument.findMany({ where: { propertyId: id }, orderBy: { uploadedAt: 'desc' } });
    return docs.map((d) => ({ ...d, uploadedAt: d.uploadedAt.toISOString() }));
  }

  async addDocument(id: string, user: AuthUser, dto: CreateDocumentDto) {
    const p = await this.getRow(id);
    if (p.ownerId !== user.id) throw GroundPulseException.forbiddenNotOwner("You don't own this property.");
    const d = await this.prisma.propertyDocument.create({
      data: { propertyId: id, name: dto.name.trim(), kind: dto.kind ?? 'OTHER', url: dto.url, sizeBytes: dto.sizeBytes ?? 0 },
    });
    return { ...d, uploadedAt: d.uploadedAt.toISOString() };
  }

  async deleteDocument(docId: string, user: AuthUser) {
    const d = await this.prisma.propertyDocument.findUnique({ where: { id: docId }, include: { property: { select: { ownerId: true } } } });
    if (!d) throw GroundPulseException.notFound('Document not found.');
    if (d.property.ownerId !== user.id) throw GroundPulseException.forbiddenNotOwner("You don't own this property.");
    await this.prisma.propertyDocument.delete({ where: { id: docId } });
    return { ok: true };
  }
}
