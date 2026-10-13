import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { NotificationGateway } from '../notification/notification.gateway';
import { CheckStatus, Prisma } from '@prisma/client';

export interface ReportGenerationJobData {
  inspectionId: string;
}

@Processor('reports')
export class ReportGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(ReportGenerationProcessor.name);

  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
    private gateway: NotificationGateway,
  ) {
    super();
  }

  async process(job: Job<ReportGenerationJobData>): Promise<any> {
    const { inspectionId } = job.data;
    this.logger.log(`[BullMQ] Processing generate-report for inspection: ${inspectionId}`);

    const inspection = await this.prisma.inspection.findUnique({
      where: { id: inspectionId },
      include: {
        property: true,
        checklistItems: true,
      },
    });

    if (!inspection) {
      this.logger.error(`Inspection ${inspectionId} not found during report generation`);
      return;
    }

    const items = inspection.checklistItems;
    const total = items.length;

    let healthScore: number | null = null;

    if (total > 0) {
      const passCount = items.filter((i) => i.status === CheckStatus.PASS).length;
      const attentionCount = items.filter((i) => i.status === CheckStatus.ATTENTION).length;
      // Formula: ((pass * 1.0 + attention * 0.5) / total) * 100
      const calculated = ((passCount * 1.0 + attentionCount * 0.5) / total) * 100;
      healthScore = Math.round(calculated * 100) / 100;
    }

    // Upsert or create InspectionReport
    const summaryUrl = `https://groundpulse-media-dev.s3.ap-south-1.amazonaws.com/reports/report-${inspectionId}.pdf`;

    const report = await this.prisma.$transaction(async (tx) => {
      const rep = await tx.inspectionReport.upsert({
        where: { inspectionId },
        update: {
          summaryUrl,
          generatedAt: new Date(),
        },
        create: {
          inspectionId,
          summaryUrl,
          generatedAt: new Date(),
        },
      });

      if (healthScore !== null) {
        await tx.property.update({
          where: { id: inspection.propertyId },
          data: { healthScore: new Prisma.Decimal(healthScore) },
        });
      }

      await tx.auditLog.create({
        data: {
          entityType: 'INSPECTION_REPORT',
          entityId: rep.id,
          action: 'GENERATED',
          actorId: inspection.inspectorId || inspection.property.ownerId,
          metadata: {
            inspectionId,
            healthScore,
            summaryUrl,
          },
        },
      });

      return rep;
    });

    // Notify Owner
    const ownerId = inspection.property.ownerId;
    const notificationPayload = {
      inspectionId,
      propertyId: inspection.propertyId,
      propertyName: inspection.property.address,
      reportUrl: summaryUrl,
      healthScore,
      message: `Inspection report generated for ${inspection.property.address}. Calculated health score: ${healthScore !== null ? `${healthScore}%` : 'N/A'}.`,
    };

    await this.notificationService.createNotification(
      ownerId,
      'REPORT_READY',
      notificationPayload,
      true,
    );

    this.gateway.emitReportReady(inspectionId, summaryUrl, ownerId);

    this.logger.log(
      `[BullMQ] Successfully completed report generation for inspection ${inspectionId}. Health score: ${healthScore}`,
    );

    return {
      reportId: report.id,
      healthScore,
      summaryUrl,
    };
  }
}
