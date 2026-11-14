import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { InspectionStatus, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { writeAudit } from '../../common/audit';
import { QUEUE_ASSIGNMENTS } from '../inspection/inspection.factory';

/**
 * Auto-assigns a newly scheduled inspection to the verified inspector with the
 * fewest open jobs. Only verified inspectors are ever considered (BR-009).
 * If nobody is available the inspection stays unassigned for an admin.
 */
@Processor(QUEUE_ASSIGNMENTS)
export class InspectorAssignmentProcessor extends WorkerHost {
  private readonly logger = new Logger(InspectorAssignmentProcessor.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationService,
  ) {
    super();
  }

  async process(job: Job<{ inspectionId: string }>) {
    const ins = await this.prisma.inspection.findUnique({ where: { id: job.data.inspectionId }, include: { property: true } });
    if (!ins || ins.inspectorId) return;

    const inspectors = await this.prisma.user.findMany({
      where: { role: Role.INSPECTOR, verified: true },
      select: {
        id: true,
        name: true,
        _count: { select: { inspections: { where: { status: { not: InspectionStatus.SUBMITTED } } } } },
      },
    });
    if (!inspectors.length) {
      this.logger.warn(`No verified inspector available for ${ins.id}; leaving for admin`);
      await this.notifications.notifyAdmins('INSPECTION_SCHEDULED', 'Inspection needs an inspector', `${ins.property.name} has no verified inspector available.`, '/admin/reassign');
      return;
    }
    const pick = inspectors.sort((a, b) => a._count.inspections - b._count.inspections)[0];

    await this.prisma.$transaction(async (tx) => {
      await tx.inspection.update({ where: { id: ins.id }, data: { inspectorId: pick.id } });
      await writeAudit(tx, 'Inspection', ins.id, 'ASSIGNED', null, { inspectorId: pick.id, actorName: 'Auto-assignment' });
    });

    const when = ins.scheduledDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    await this.notifications.notify(ins.property.ownerId, 'INSPECTION_ASSIGNED', 'Inspector assigned', `${pick.name} (verified) will inspect ${ins.property.name} on ${when}.`, `/property/${ins.propertyId}`);
    await this.notifications.notify(pick.id, 'INSPECTION_ASSIGNED', 'New job assigned', `${ins.property.name}, ${ins.property.city} — ${when}.`, `/inspection/${ins.id}/checklist`);
    await this.notifications.emitWithAdmins([ins.property.ownerId, pick.id], 'inspection.updated', { inspectionId: ins.id, status: ins.status });
    return { inspectorId: pick.id };
  }
}
