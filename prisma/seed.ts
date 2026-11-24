/**
 * Demo seed — mirrors the frontend's mock data so the UI looks the same on the
 * real API. Dates are relative to "now": there's always a job today, upcoming
 * inspections and six months of history.
 *
 * All demo accounts use the password: password123
 *   Owner      priya@example.com, arvind@example.com
 *   Inspector  ravi@example.com, meera@example.com (karan@example.com = pending verification)
 *   Admin      admin@groundpulse.in
 *   Provider   suresh@, imran@, deepa@, ganesh@example.com (joseph@example.com = pending)
 */
import { CheckStatus, InspectionStatus, IssueCategory, IssueStatus, Prisma, PrismaClient, RepairStatus, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { DEFAULT_TEMPLATES } from '../src/common/checklist-templates';

const prisma = new PrismaClient();

const DAY = 24 * 60 * 60 * 1000;
const at = (days: number, hour = 10) => {
  const d = new Date(Date.now() + days * DAY);
  d.setHours(hour, 0, 0, 0);
  return d;
};
const img = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&q=70`;
const PHOTOS = {
  apartment: img('photo-1545324418-cc1a3fa10c00'),
  villa: img('photo-1600585154340-be6161a56a0c'),
  house: img('photo-1568605114967-8130f3a36994'),
  studio: img('photo-1502672260266-1c1ef2d93688'),
  living: img('photo-1586023492125-27b2c045efd7'),
  leak: img('photo-1585704032915-c3400ca199e7'),
  electrical: img('photo-1621905251189-08b45d6a269e'),
  door: img('photo-1558002038-1055907df827'),
  kitchen: img('photo-1556911220-bff31c812dba'),
  bathroom: img('photo-1552321554-5fefe8c9ef14'),
  balcony: img('photo-1600566753086-00f18fb6b3ea'),
  repairDone: img('photo-1581578731548-c64695cc6952'),
};

/** Spread PASS/ATTENTION/FAIL so the computed score lands near the target. */
function statusesForScore(n: number, target: number): CheckStatus[] {
  const lostHalf = Math.round(2 * n * (1 - target / 100));
  const fail = Math.max(0, Math.floor(lostHalf / 3));
  let attention = lostHalf - 2 * fail;
  while (fail + attention > n) attention--;
  const out: CheckStatus[] = Array(n).fill(CheckStatus.PASS);
  const positions = Array.from({ length: n }, (_, i) => (i * 7 + 3) % n);
  let p = 0;
  for (let i = 0; i < fail; i++) out[positions[p++]] = CheckStatus.FAIL;
  for (let i = 0; i < attention; i++) out[positions[p++]] = CheckStatus.ATTENTION;
  return out;
}
const score = (s: CheckStatus[]) => Math.round((s.reduce((a, x) => a + (x === 'PASS' ? 1 : x === 'ATTENTION' ? 0.5 : 0), 0) / s.length) * 100);

async function main() {
  // Used on deploy: seed a fresh database once, never wipe a live one.
  if (process.env.SEED_ONLY_IF_EMPTY === 'true' && (await prisma.user.count()) > 0) {
    console.log('🌱 Database already has data — skipping seed.');
    return;
  }
  console.log('🌱 Seeding GroundPulse demo data…');

  // wipe in dependency order
  await prisma.$transaction([
    prisma.auditLog.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.issueMessage.deleteMany(),
    prisma.repair.deleteMany(),
    prisma.issue.deleteMany(),
    prisma.inspectionReport.deleteMany(),
    prisma.checklistItem.deleteMany(),
    prisma.inspection.deleteMany(),
    prisma.propertyDocument.deleteMany(),
    prisma.property.deleteMany(),
    prisma.serviceProvider.deleteMany(),
    prisma.userPreference.deleteMany(),
    prisma.user.deleteMany(),
    prisma.checklistTemplate.deleteMany(),
    prisma.mediaFile.deleteMany(),
  ]);

  await prisma.checklistTemplate.createMany({
    data: Object.entries(DEFAULT_TEMPLATES).map(([propertyType, items]) => ({ propertyType, items })),
  });

  const passwordHash = await bcrypt.hash('password123', 10);
  const U = async (key: string, name: string, email: string, role: Role, phone: string | null, verified: boolean, daysAgo: number) =>
    [key, await prisma.user.create({ data: { name, email, role, phone, verified, passwordHash, createdAt: at(-daysAgo) } })] as const;

  const users = Object.fromEntries(
    await Promise.all([
      U('priya', 'Priya Sharma', 'priya@example.com', Role.OWNER, '+971 50 123 4567', true, 200),
      U('arvind', 'Arvind Rao', 'arvind@example.com', Role.OWNER, '+91 98450 11223', true, 160),
      U('ravi', 'Ravi Kumar', 'ravi@example.com', Role.INSPECTOR, '+91 99000 22110', true, 300),
      U('meera', 'Meera Iyer', 'meera@example.com', Role.INSPECTOR, '+91 98201 33445', true, 250),
      U('karan', 'Karan Mehta', 'karan@example.com', Role.INSPECTOR, '+91 98111 77889', false, 2),
      U('admin', 'Anita Desai', 'admin@groundpulse.in', Role.ADMIN, null, true, 400),
      U('suresh', 'Suresh Plumbing Works', 'suresh@example.com', Role.PROVIDER, '+91 98860 44556', true, 280),
      U('imran', 'Volt Electricals (Imran)', 'imran@example.com', Role.PROVIDER, '+91 97400 66778', true, 260),
      U('deepa', 'SecureHome Locks (Deepa)', 'deepa@example.com', Role.PROVIDER, '+91 96320 99001', true, 240),
      U('ganesh', 'Ganesh Plumbing Mumbai', 'ganesh@example.com', Role.PROVIDER, '+91 98190 12121', true, 220),
      U('joseph', 'CleanPro Services (Joseph)', 'joseph@example.com', Role.PROVIDER, '+91 98670 34343', false, 1),
    ]),
  );

  const SP = async (key: string, serviceTypes: string[], locality: string, verified: boolean, rating: number | null) =>
    [key, await prisma.serviceProvider.create({ data: { userId: users[key].id, serviceTypes, locality, verified, rating } })] as const;
  const providers = Object.fromEntries(
    await Promise.all([
      SP('suresh', ['Plumbing', 'General Repairs'], 'Bengaluru', true, 4.6),
      SP('imran', ['Electrical'], 'Bengaluru', true, 4.8),
      SP('deepa', ['Security', 'General Repairs'], 'Mumbai', true, 4.3),
      SP('ganesh', ['Plumbing'], 'Mumbai', true, 4.0),
      SP('joseph', ['Cleaning', 'Pest Control'], 'Bengaluru', false, null),
    ]),
  );

  const P = async (key: string, owner: string, name: string, address: string, city: string, type: string, cover: string, daysAgo: number) =>
    [key, await prisma.property.create({ data: { ownerId: users[owner].id, name, address, city, type, coverPhotoUrl: cover, createdAt: at(-daysAgo) } })] as const;
  const props = Object.fromEntries(
    await Promise.all([
      P('lakeside', 'priya', 'Lakeside Apartment', 'Flat 1204, Prestige Lakeside Habitat, Whitefield', 'Bengaluru', 'Apartment', PHOTOS.apartment, 190),
      P('sarjapur', 'priya', 'Sarjapur Family Villa', 'Villa 22, Brigade Meadows, Sarjapur Road', 'Bengaluru', 'Villa', PHOTOS.villa, 185),
      P('andheri', 'arvind', 'Andheri 2BHK (Unit 3)', 'B-704, Oberoi Springs, Andheri West', 'Mumbai', 'Apartment', PHOTOS.living, 150),
      P('powai', 'arvind', 'Powai Studio (Unit 5)', '1102, Hiranandani Gardens, Powai', 'Mumbai', 'Apartment', PHOTOS.studio, 150),
      P('koramangala', 'arvind', 'Koramangala House', 'No. 14, 5th Block, Koramangala', 'Bengaluru', 'Independent House', PHOTOS.house, 140),
    ]),
  );

  const itemPhotos = [PHOTOS.kitchen, PHOTOS.bathroom, PHOTOS.living, PHOTOS.balcony, PHOTOS.door];

  async function inspection(propKey: string, inspector: string | null, day: number, status: InspectionStatus, recurrence: string | null, target = 85) {
    const prop = props[propKey];
    const template = DEFAULT_TEMPLATES[prop.type] ?? DEFAULT_TEMPLATES.Apartment;
    const statuses = status === InspectionStatus.SUBMITTED ? statusesForScore(template.length, target) : [];
    const ins = await prisma.inspection.create({
      data: {
        propertyId: prop.id,
        inspectorId: inspector ? users[inspector].id : null,
        scheduledDate: at(day),
        recurrenceRule: recurrence,
        status,
        startedAt: status !== InspectionStatus.SCHEDULED ? at(day, 11) : null,
        submittedAt: status === InspectionStatus.SUBMITTED ? at(day, 13) : null,
      },
    });
    await prisma.checklistItem.createMany({
      data: template.map((t, i) => ({
        inspectionId: ins.id,
        position: i,
        roomArea: t.roomArea,
        itemName: t.itemName,
        status: statuses[i] ?? null,
        mediaUrls: statuses.length && i % 3 === 0 ? [itemPhotos[i % itemPhotos.length]] : [],
        notes: statuses[i] && statuses[i] !== 'PASS' ? (statuses[i] === 'FAIL' ? 'Needs repair — see flagged issue.' : 'Minor wear, monitor next visit.') : null,
      })),
    });
    if (statuses.length) {
      const s = score(statuses);
      await prisma.inspectionReport.create({
        data: {
          inspectionId: ins.id,
          generatedAt: at(day, 15),
          summaryUrl: `${process.env.APP_URL || 'http://localhost:3000'}/report/${ins.id}`,
          healthScore: s,
          passCount: statuses.filter((x) => x === 'PASS').length,
          attentionCount: statuses.filter((x) => x === 'ATTENTION').length,
          failCount: statuses.filter((x) => x === 'FAIL').length,
        },
      });
      await prisma.property.update({ where: { id: prop.id }, data: { healthScore: s } });
    }
    return ins;
  }

  // ---- history (monthly, oldest first so the latest score wins)
  const history: Record<string, [number[], string]> = {
    lakeside: [[72, 75, 70, 79, 82, 86], 'ravi'],
    sarjapur: [[80, 76, 71, 68, 64, 62], 'ravi'],
    andheri: [[66, 70, 74, 78], 'meera'],
    powai: [[88, 85, 90, 92], 'meera'],
    koramangala: [[58, 63, 69], 'ravi'],
  };
  const latest: Record<string, string> = {};
  let powaiThird = '';
  for (const [key, [scores, inspector]] of Object.entries(history)) {
    for (let i = 0; i < scores.length; i++) {
      const ins = await inspection(key, inspector, -((scores.length - i) * 30) + 6, InspectionStatus.SUBMITTED, 'FREQ=MONTHLY', scores[i]);
      latest[key] = ins.id;
      if (key === 'powai' && i === 2) powaiThird = ins.id;
    }
  }

  // ---- upcoming / today
  await inspection('sarjapur', 'ravi', 0, InspectionStatus.SCHEDULED, 'FREQ=MONTHLY');
  await inspection('lakeside', 'ravi', 5, InspectionStatus.SCHEDULED, 'FREQ=MONTHLY');
  await inspection('koramangala', 'ravi', 9, InspectionStatus.SCHEDULED, null);
  await inspection('andheri', 'meera', 1, InspectionStatus.SCHEDULED, 'FREQ=MONTHLY;INTERVAL=3');
  await inspection('powai', null, 3, InspectionStatus.SCHEDULED, null);

  // ---- issues
  const I = (propKey: string, inspectionId: string, category: IssueCategory, description: string, mediaUrls: string[], status: IssueStatus, flaggedBy: string, day: number, decisionReason: string | null = null) =>
    prisma.issue.create({
      data: { inspectionId, propertyId: props[propKey].id, category, description, mediaUrls, status, flaggedBy: users[flaggedBy].id, decisionReason, createdAt: at(day, 13) },
    });

  const leak = await I('sarjapur', latest.sarjapur, 'LEAK', 'Water seepage spreading on the master bedroom ceiling, below the terrace drain. Patch is ~60cm wide and damp to touch.', [PHOTOS.leak, PHOTOS.bathroom], 'FLAGGED', 'ravi', -24);
  const elec = await I('sarjapur', latest.sarjapur, 'ELECTRICAL', 'Main MCB trips whenever the bathroom geyser is switched on. Likely a faulty geyser element or earth leakage.', [PHOTOS.electrical], 'APPROVED', 'ravi', -24);
  const drain = await I('lakeside', latest.lakeside, 'CLEANLINESS', 'Balcony drain blocked with leaves; standing water after rain could seep into the living room.', [PHOTOS.balcony], 'FLAGGED', 'ravi', -24);
  const lock = await I('andheri', latest.andheri, 'SECURITY', 'Main door deadbolt is loose and does not fully engage. Door can be pushed open when only the latch is used.', [PHOTOS.door], 'APPROVED', 'meera', -24);
  const sink = await I('powai', powaiThird, 'LEAK', 'Kitchen sink trap leaking slowly into the cabinet below.', [PHOTOS.kitchen], 'CLOSED', 'meera', -54);
  const paint = await I('koramangala', latest.koramangala, 'OTHER', 'Paint peeling on the north-facing compound wall. Cosmetic only.', [PHOTOS.house], 'DECLINED', 'ravi', -24, 'Cosmetic — will repaint when tenant changes next year.');

  // ---- repairs in every state
  const rElec = await prisma.repair.create({ data: { issueId: elec.id, providerId: providers.imran.id, status: RepairStatus.IN_PROGRESS, costEstimate: 2800, createdAt: at(-23), updatedAt: at(-2) } });
  const rLock = await prisma.repair.create({ data: { issueId: lock.id, status: RepairStatus.REQUESTED, createdAt: at(-1), updatedAt: at(-1) } });
  const rSink = await prisma.repair.create({
    data: {
      issueId: sink.id,
      providerId: providers.ganesh.id,
      status: RepairStatus.COMPLETED,
      costEstimate: 1200,
      completionNotes: 'Replaced the sink trap and the waste pipe washer. Ran water for 15 minutes — no leak.',
      completionPhotos: [PHOTOS.repairDone],
      ownerRating: 4,
      createdAt: at(-53),
      updatedAt: at(-48),
    },
  });

  // ---- audit trail
  const A = (entityType: string, entityId: string, action: string, actor: string | null, day: number, metadata: Prisma.InputJsonValue = {}) => ({
    entityType, entityId, action, actorId: actor ? users[actor].id : null, metadata, timestamp: at(day, 14),
  });
  await prisma.auditLog.createMany({
    data: [
      ...[leak, elec, drain, lock, paint].map((i) => A('Issue', i.id, 'FLAGGED', i.flaggedBy === users.meera.id ? 'meera' : 'ravi', -24, { category: i.category })),
      A('Issue', sink.id, 'FLAGGED', 'meera', -54, { category: 'LEAK' }),
      A('Issue', elec.id, 'APPROVED', 'priya', -23),
      A('Repair', rElec.id, 'CREATED', 'priya', -23, { status: 'REQUESTED' }),
      A('Repair', rElec.id, 'ASSIGNED', 'admin', -20, { providerId: providers.imran.id, from: 'REQUESTED', to: 'ASSIGNED' }),
      A('Repair', rElec.id, 'STATUS_CHANGED', 'imran', -2, { from: 'ASSIGNED', to: 'IN_PROGRESS', costEstimate: 2800 }),
      A('Issue', lock.id, 'APPROVED', 'arvind', -1),
      A('Repair', rLock.id, 'CREATED', 'arvind', -1, { status: 'REQUESTED' }),
      A('Issue', sink.id, 'APPROVED', 'arvind', -53),
      A('Repair', rSink.id, 'ASSIGNED', 'admin', -52, { providerId: providers.ganesh.id }),
      A('Repair', rSink.id, 'STATUS_CHANGED', 'ganesh', -50, { from: 'ASSIGNED', to: 'IN_PROGRESS' }),
      A('Repair', rSink.id, 'COMPLETED', 'ganesh', -48, { from: 'IN_PROGRESS', to: 'COMPLETED' }),
      A('Issue', paint.id, 'DECLINED', 'arvind', -22, { reason: 'Cosmetic — will repaint when tenant changes next year.' }),
    ],
  });

  // ---- messages, documents, notifications
  await prisma.issueMessage.createMany({
    data: [
      { issueId: elec.id, authorId: users.imran.id, body: 'Visited today. Geyser element has a short to earth — replacing it tomorrow. Estimate ₹2,800 incl. part.', createdAt: at(-2, 16) },
      { issueId: elec.id, authorId: users.priya.id, body: 'Thanks Imran, please go ahead. Share a photo once done.', createdAt: at(-2, 18) },
    ],
  });
  await prisma.propertyDocument.createMany({
    data: [
      { propertyId: props.lakeside.id, name: 'Sale deed.pdf', kind: 'DEED', url: '#', sizeBytes: 2_340_000, uploadedAt: at(-180) },
      { propertyId: props.lakeside.id, name: 'Home insurance 2026.pdf', kind: 'INSURANCE', url: '#', sizeBytes: 640_000, uploadedAt: at(-90) },
    ],
  });
  const todaySarjapur = await prisma.inspection.findFirstOrThrow({ where: { propertyId: props.sarjapur.id, status: 'SCHEDULED' }, orderBy: { scheduledDate: 'asc' } });
  const N = (user: string, type: string, title: string, body: string, href: string, day: number, read = false) => ({
    userId: users[user].id, type, payload: { title, body, href }, read, createdAt: at(day, 15),
  });
  await prisma.notification.createMany({
    data: [
      N('priya', 'REPORT_READY', 'Inspection report ready', 'Your Sarjapur Family Villa report is ready — health score 62.', `/report/${latest.sarjapur}`, -24, true),
      N('priya', 'ISSUE_FLAGGED', 'Issue flagged: water leak', 'Ravi flagged a leak at Sarjapur Family Villa. Review and approve or decline.', `/issue/${leak.id}`, -24),
      N('priya', 'ISSUE_FLAGGED', 'Issue flagged: cleanliness', 'Balcony drain blocked at Lakeside Apartment.', `/issue/${drain.id}`, -24),
      N('priya', 'REPAIR_STATUS_UPDATED', 'Repair in progress', 'Volt Electricals started work on the MCB tripping issue.', `/issue/${elec.id}`, -2),
      N('priya', 'INSPECTION_ASSIGNED', 'Inspector assigned', 'Ravi Kumar will inspect Sarjapur Family Villa today.', `/property/${props.sarjapur.id}`, -3, true),
      N('arvind', 'REPAIR_STATUS_UPDATED', 'Repair requested', 'Your approval was sent to the admin team to assign a verified locksmith.', `/issue/${lock.id}`, -1),
      N('ravi', 'INSPECTION_ASSIGNED', 'New job assigned', 'Sarjapur Family Villa — today.', `/inspection/${todaySarjapur.id}/checklist`, -3),
      N('admin', 'REPAIR_REQUESTED', 'Repair needs a provider', 'Owner approved a SECURITY repair at Andheri 2BHK.', '/admin/reassign', -1),
      N('admin', 'ACCOUNT_VERIFIED', 'New verification request', 'Karan Mehta signed up as an inspector.', '/admin/verification', -2),
      N('imran', 'JOB_ASSIGNED', 'New job assigned', 'MCB tripping at Sarjapur Family Villa, Bengaluru.', '/provider/jobs', -20, true),
    ],
  });

  console.log('✅ Seed complete. Demo password for every account: password123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
