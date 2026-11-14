/**
 * Response shapes (API-WEB-01 + frontend `src/lib/types.ts`).
 *
 * Controllers never return raw Prisma rows: every entity goes through one of
 * these mappers so the JSON is flat, typed and stable (e.g. `propertyName`,
 * `openIssueCount`, numbers instead of Decimal strings).
 */
import { Prisma, RepairStatus, User } from '@prisma/client';

const num = (d: Prisma.Decimal | number | null | undefined) => (d == null ? null : Number(d));
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

// ---------------------------------------------------------------- users

export function publicUser(u: Pick<User, 'id' | 'name' | 'email' | 'role' | 'phone' | 'verified' | 'createdAt'>) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
    phone: u.phone,
    verified: u.verified,
    createdAt: u.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------- property

export const propertyInclude = {
  owner: { select: { name: true } },
  inspections: { select: { status: true, scheduledDate: true, submittedAt: true } },
  issues: { where: { status: 'FLAGGED' }, select: { id: true } },
} satisfies Prisma.PropertyInclude;

export type PropertyRow = Prisma.PropertyGetPayload<{ include: typeof propertyInclude }>;

export function toProperty(p: PropertyRow) {
  const submitted = p.inspections
    .filter((i) => i.status === 'SUBMITTED')
    .sort((a, b) => b.scheduledDate.getTime() - a.scheduledDate.getTime())[0];
  const next = p.inspections
    .filter((i) => i.status !== 'SUBMITTED')
    .sort((a, b) => a.scheduledDate.getTime() - b.scheduledDate.getTime())[0];
  return {
    id: p.id,
    ownerId: p.ownerId,
    name: p.name,
    address: p.address,
    city: p.city,
    type: p.type,
    coverPhotoUrl: p.coverPhotoUrl,
    healthScore: p.healthScore == null ? null : Math.round(Number(p.healthScore)),
    createdAt: p.createdAt.toISOString(),
    lastInspectionDate: submitted ? iso(submitted.submittedAt ?? submitted.scheduledDate) : null,
    nextInspectionDate: next ? iso(next.scheduledDate) : null,
    openIssueCount: p.issues.length,
    ownerName: p.owner.name,
  };
}

// ---------------------------------------------------------------- inspection

export const inspectionInclude = {
  property: { select: { name: true, address: true, city: true, ownerId: true } },
  inspector: { select: { name: true } },
  checklistItems: { select: { status: true } },
  report: { select: { id: true } },
  _count: { select: { issues: true } },
} satisfies Prisma.InspectionInclude;

export type InspectionRow = Prisma.InspectionGetPayload<{ include: typeof inspectionInclude }>;

export function toInspection(i: InspectionRow) {
  return {
    id: i.id,
    propertyId: i.propertyId,
    inspectorId: i.inspectorId,
    scheduledDate: i.scheduledDate.toISOString(),
    recurrenceRule: i.recurrenceRule,
    status: i.status,
    startedAt: iso(i.startedAt),
    submittedAt: iso(i.submittedAt),
    propertyName: i.property.name,
    propertyAddress: `${i.property.address}, ${i.property.city}`,
    inspectorName: i.inspector?.name ?? null,
    itemsTotal: i.checklistItems.length,
    itemsDone: i.checklistItems.filter((c) => c.status !== null).length,
    issueCount: i._count.issues,
    reportId: i.report?.id ?? null,
  };
}

export function toReport(r: Prisma.InspectionReportGetPayload<object>) {
  return {
    id: r.id,
    inspectionId: r.inspectionId,
    generatedAt: r.generatedAt.toISOString(),
    summaryUrl: r.summaryUrl,
    healthScore: r.healthScore,
    passCount: r.passCount,
    attentionCount: r.attentionCount,
    failCount: r.failCount,
  };
}

export function toChecklistItem(c: Prisma.ChecklistItemGetPayload<object>) {
  return {
    id: c.id,
    inspectionId: c.inspectionId,
    roomArea: c.roomArea,
    itemName: c.itemName,
    status: c.status,
    mediaUrls: c.mediaUrls,
    notes: c.notes,
  };
}

// ---------------------------------------------------------------- issue

export const issueInclude = {
  property: { select: { name: true, address: true, city: true, ownerId: true } },
  inspector: { select: { name: true } },
  repair: { select: { id: true, providerId: true, provider: { select: { userId: true } } } },
} satisfies Prisma.IssueInclude;

export type IssueRow = Prisma.IssueGetPayload<{ include: typeof issueInclude }>;

export function toIssue(i: IssueRow) {
  return {
    id: i.id,
    inspectionId: i.inspectionId,
    propertyId: i.propertyId,
    category: i.category,
    description: i.description,
    mediaUrls: i.mediaUrls,
    status: i.status,
    flaggedBy: i.flaggedBy,
    decisionReason: i.decisionReason,
    createdAt: i.createdAt.toISOString(),
    propertyName: i.property.name,
    propertyAddress: `${i.property.address}, ${i.property.city}`,
    flaggedByName: i.inspector.name,
    repairId: i.repair?.id ?? null,
  };
}

// ---------------------------------------------------------------- provider

export const providerInclude = {
  user: { select: { name: true, email: true, phone: true } },
  _count: { select: { repairs: { where: { status: RepairStatus.COMPLETED } } } },
} satisfies Prisma.ServiceProviderInclude;

export type ProviderRow = Prisma.ServiceProviderGetPayload<{ include: typeof providerInclude }>;

export function toProviderProfile(sp: ProviderRow) {
  return {
    id: sp.id,
    userId: sp.userId,
    serviceTypes: sp.serviceTypes,
    locality: sp.locality,
    verified: sp.verified,
    rating: num(sp.rating),
    name: sp.user.name,
    email: sp.user.email,
    phone: sp.user.phone,
    completedJobs: sp._count.repairs,
  };
}

// ---------------------------------------------------------------- repair

export const repairInclude = {
  issue: { include: { property: { select: { id: true, name: true, address: true, city: true, ownerId: true } } } },
  provider: { include: providerInclude },
} satisfies Prisma.RepairInclude;

export type RepairRow = Prisma.RepairGetPayload<{ include: typeof repairInclude }>;

export function toRepair(r: RepairRow) {
  return {
    id: r.id,
    issueId: r.issueId,
    providerId: r.providerId,
    status: r.status,
    costEstimate: num(r.costEstimate),
    completionNotes: r.completionNotes,
    completionPhotos: r.completionPhotos,
    ownerRating: r.ownerRating,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    issueCategory: r.issue.category,
    issueDescription: r.issue.description,
    issueMediaUrls: r.issue.mediaUrls,
    propertyId: r.issue.property.id,
    propertyName: r.issue.property.name,
    propertyAddress: r.issue.property.address,
    propertyCity: r.issue.property.city,
    provider: r.provider ? toProviderProfile(r.provider) : null,
  };
}

// ---------------------------------------------------------------- audit

export const auditInclude = { actor: { select: { name: true } } } satisfies Prisma.AuditLogInclude;
export type AuditRow = Prisma.AuditLogGetPayload<{ include: typeof auditInclude }>;

export function toAudit(a: AuditRow) {
  return {
    id: a.id,
    entityType: a.entityType,
    entityId: a.entityId,
    action: a.action,
    actorId: a.actorId ?? 'system',
    actorName: a.actor?.name ?? (a.metadata as Record<string, unknown> | null)?.actorName ?? 'System',
    metadata: (a.metadata as Record<string, unknown> | null) ?? {},
    timestamp: a.timestamp.toISOString(),
  };
}

export function toNotification(n: Prisma.NotificationGetPayload<object>) {
  return { ...n, createdAt: n.createdAt.toISOString() };
}
