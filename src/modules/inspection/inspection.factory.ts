import { Prisma } from '@prisma/client';
import { DEFAULT_TEMPLATES } from '../../common/checklist-templates';

type TemplateItem = { roomArea: string; itemName: string };

/** Admin-edited template for the property type, falling back to the built-in default. */
export async function templateFor(db: Prisma.TransactionClient, propertyType: string): Promise<TemplateItem[]> {
  const t = await db.checklistTemplate.findUnique({ where: { propertyType } });
  const items = (t?.items as TemplateItem[] | undefined) ?? DEFAULT_TEMPLATES[propertyType] ?? DEFAULT_TEMPLATES.Apartment;
  return items;
}

/** Creates an Inspection row and copies the checklist template into checklist_items. */
export async function createInspectionWithChecklist(
  db: Prisma.TransactionClient,
  input: { propertyId: string; propertyType: string; scheduledDate: Date; recurrenceRule: string | null; inspectorId: string | null },
) {
  const inspection = await db.inspection.create({
    data: {
      propertyId: input.propertyId,
      scheduledDate: input.scheduledDate,
      recurrenceRule: input.recurrenceRule,
      inspectorId: input.inspectorId,
    },
  });
  const items = await templateFor(db, input.propertyType);
  await db.checklistItem.createMany({
    data: items.map((t, position) => ({ inspectionId: inspection.id, position, roomArea: t.roomArea, itemName: t.itemName })),
  });
  return inspection;
}

/** RRULE subset used by the scheduler: FREQ=WEEKLY|MONTHLY with optional INTERVAL. */
export function nextDateFromRule(rule: string, from: Date): Date | null {
  const d = new Date(from);
  const interval = Number(/INTERVAL=(\d+)/.exec(rule)?.[1] ?? 1);
  if (rule.includes('WEEKLY')) d.setDate(d.getDate() + 7 * interval);
  else if (rule.includes('MONTHLY')) d.setMonth(d.getMonth() + interval);
  else return null;
  return d;
}

export function scoreFromStatuses(statuses: (string | null)[]) {
  if (!statuses.length) return 0;
  const points = statuses.reduce((s, x) => s + (x === 'PASS' ? 1 : x === 'ATTENTION' ? 0.5 : 0), 0);
  return Math.round((points / statuses.length) * 100);
}

export const QUEUE_REPORTS = 'reports';
export const QUEUE_ASSIGNMENTS = 'assignments';
