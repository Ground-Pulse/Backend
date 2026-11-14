import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ReportGenerationProcessor } from './report-generation.processor';
import { InspectorAssignmentProcessor } from './inspector-assignment.processor';
import { QUEUE_ASSIGNMENTS, QUEUE_REPORTS } from '../inspection/inspection.factory';

/**
 * Async job boundary (BullMQ on Redis). This is also the extension point for
 * the v2 ML damage-detection service: enqueue a job per uploaded issue photo.
 */
@Module({
  imports: [BullModule.registerQueue({ name: QUEUE_REPORTS }, { name: QUEUE_ASSIGNMENTS })],
  providers: [ReportGenerationProcessor, InspectorAssignmentProcessor],
  exports: [BullModule],
})
export class JobsModule {}
