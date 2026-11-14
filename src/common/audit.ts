import { Prisma } from '@prisma/client';

export type AuditEntity = 'Property' | 'Inspection' | 'Issue' | 'Repair' | 'User';

/**
 * Immutable audit row (TR-013). Pass the transaction client so the log is
 * written in the same transaction as the state change it records.
 * actorId null = system action (auto-assignment, scheduled job).
 */
export function writeAudit(
  db: Prisma.TransactionClient,
  entityType: AuditEntity,
  entityId: string,
  action: string,
  actorId: string | null,
  metadata: Record<string, unknown> = {},
) {
  return db.auditLog.create({
    data: { entityType, entityId, action, actorId, metadata: metadata as Prisma.InputJsonValue },
  });
}
