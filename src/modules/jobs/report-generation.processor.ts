import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { writeAudit } from '../../common/audit';
import {
  createInspectionWithChecklist,
  nextDateFromRule,
  QUEUE_REPORTS,
  scoreFromStatuses,
} from '../inspection/inspection.factory';

export interface ReportGenerationJobData {
  inspectionId: string;
}

/**
 * Report job (TR-007): runs off the request path after a checklist is
 * submitted. Compiles the report, recomputes the property's health score
 * (TR-014), spawns the next recurring inspection and notifies the owner.
 */
@Processor(QUEUE_REPORTS)
export class ReportGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(ReportGenerationProcessor.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationService,
  ) {
    super();
  }

  async process(job: Job<ReportGenerationJobData>) {
    const { inspectionId } = job.data;
    const ins = await this.prisma.inspection.findUnique({
      where: { id: inspectionId },
      include: { property: true, checklistItems: { select: { status: true } }, report: true, _count: { select: { issues: true } } },
    });
    if (!ins) {
      this.logger.warn(`Inspection ${inspectionId} vanished before report generation`);
      return;
    }
    if (ins.report) return { reportId: ins.report.id, skipped: true }; // idempotent on retries

    const statuses = ins.checklistItems.map((c) => c.status);
    const score = scoreFromStatuses(statuses);
    const appUrl = process.env.APP_URL || 'http://localhost:3000';

    const report = await this.prisma.$transaction(async (tx) => {
      const rep = await tx.inspectionReport.create({
        data: {
          inspectionId,
          summaryUrl: `${appUrl}/report/${inspectionId}`,
          healthScore: score,
          passCount: statuses.filter((s) => s === 'PASS').length,
          attentionCount: statuses.filter((s) => s === 'ATTENTION').length,
          failCount: statuses.filter((s) => s === 'FAIL').length,
        },
      });
      await tx.property.update({ where: { id: ins.propertyId }, data: { healthScore: new Prisma.Decimal(score) } });
      await writeAudit(tx, 'Inspection', inspectionId, 'REPORT_GENERATED', null, { healthScore: score, actorName: 'Report job' });

      if (ins.recurrenceRule) {
        const next = nextDateFromRule(ins.recurrenceRule, ins.scheduledDate);
        if (next) {
          await createInspectionWithChecklist(tx, {
            propertyId: ins.propertyId,
            propertyType: ins.property.type,
            scheduledDate: next,
            recurrenceRule: ins.recurrenceRule,
            inspectorId: ins.inspectorId,
          });
        }
      }
      return rep;
    });

    const issues = ins._count.issues;
    await this.notifications.notify(
      ins.property.ownerId,
      'REPORT_READY',
      'Inspection report ready',
      `${ins.property.name}: health score ${score}/100${issues ? `, ${issues} issue${issues > 1 ? 's' : ''} flagged` : ', no issues found'}.`,
      `/report/${inspectionId}`,
    );
    await this.notifications.emitWithAdmins([ins.property.ownerId, ins.inspectorId], 'report.ready', {
      inspectionId,
      reportUrl: `/report/${inspectionId}`,
      propertyId: ins.propertyId,
    });
    await this.notifications.dashboardChanged();

    this.logger.log(`Report ${report.id} generated for inspection ${inspectionId} (score ${score})`);
    return { reportId: report.id, healthScore: score };
  }
}
