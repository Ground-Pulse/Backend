import { PrismaClient, Role, InspectionStatus, CheckStatus, IssueCategory, IssueStatus, RepairStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting GroundPulse database seed...');

  // Clear existing data in reverse order of dependencies
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.repair.deleteMany();
  await prisma.issue.deleteMany();
  await prisma.inspectionReport.deleteMany();
  await prisma.checklistItem.deleteMany();
  await prisma.inspection.deleteMany();
  await prisma.property.deleteMany();
  await prisma.serviceProvider.deleteMany();
  await prisma.user.deleteMany();

  const saltRounds = 10;
  const ownerPasswordHash = await bcrypt.hash('password123', saltRounds);
  const inspectorPasswordHash = await bcrypt.hash('password123', saltRounds);
  const adminPasswordHash = await bcrypt.hash('admin123', saltRounds);
  const providerPasswordHash = await bcrypt.hash('password123', saltRounds);

  // 1. Create Users
  const owner = await prisma.user.create({
    data: {
      name: 'Priya Sharma',
      email: 'priya@example.com',
      passwordHash: ownerPasswordHash,
      role: Role.OWNER,
      phone: '+91 98765 43210',
    },
  });

  const inspector = await prisma.user.create({
    data: {
      name: 'Ravi Kumar',
      email: 'ravi@example.com',
      passwordHash: inspectorPasswordHash,
      role: Role.INSPECTOR,
      phone: '+91 98123 45678',
    },
  });

  const admin = await prisma.user.create({
    data: {
      name: 'GroundPulse Admin',
      email: 'admin@groundpulse.com',
      passwordHash: adminPasswordHash,
      role: Role.ADMIN,
      phone: '+91 99999 88888',
    },
  });

  const providerUser = await prisma.user.create({
    data: {
      name: 'Express Plumbing & Repairs',
      email: 'plumber@express.com',
      passwordHash: providerPasswordHash,
      role: Role.PROVIDER,
      phone: '+91 97777 66666',
    },
  });

  const serviceProvider = await prisma.serviceProvider.create({
    data: {
      userId: providerUser.id,
      serviceTypes: ['Plumbing', 'Waterproofing', 'General Maintenance'],
      locality: 'Whitefield, Bangalore',
      verified: true,
      rating: 4.85,
    },
  });

  console.log('✅ Created users and service provider');

  // 2. Create Properties
  const prop1 = await prisma.property.create({
    data: {
      ownerId: owner.id,
      address: 'Prestige Lakeside Habitat, Tower 4, Flat 1204, Whitefield, Bangalore',
      type: 'Apartment',
      coverPhotoUrl: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1000&q=80',
      healthScore: 78.5,
    },
  });

  const prop2 = await prisma.property.create({
    data: {
      ownerId: owner.id,
      address: 'Brigade Meadows, Villa 18, Kanakapura & Sarjapur Road, Bangalore',
      type: 'Villa',
      coverPhotoUrl: 'https://images.unsplash.com/photo-1613977257363-707ba9348227?auto=format&fit=crop&w=1000&q=80',
      healthScore: 92.0,
    },
  });

  const prop3 = await prisma.property.create({
    data: {
      ownerId: owner.id,
      address: 'Plot 44, Phase 2, Ozone Urbana, Devanahalli, Bangalore',
      type: 'Plot',
      coverPhotoUrl: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?auto=format&fit=crop&w=1000&q=80',
      healthScore: null,
    },
  });

  console.log('✅ Created properties');

  // 3. Create Inspections
  // Inspection 1: Prestige Lakeside (In Progress / Active)
  const scheduledDate1 = new Date();
  scheduledDate1.setDate(scheduledDate1.getDate() + 2);

  const inspection1 = await prisma.inspection.create({
    data: {
      propertyId: prop1.id,
      inspectorId: inspector.id,
      scheduledDate: scheduledDate1,
      recurrenceRule: 'MONTHLY',
      status: InspectionStatus.IN_PROGRESS,
      startedAt: new Date(),
    },
  });

  // Checklist items for inspection 1
  await prisma.checklistItem.createMany({
    data: [
      {
        inspectionId: inspection1.id,
        roomArea: 'Master Bedroom',
        itemName: 'Ceiling & Wall Paint Condition',
        status: CheckStatus.PASS,
        mediaUrls: ['https://images.unsplash.com/photo-1513694203232-719a280e022f?auto=format&fit=crop&w=800&q=80'],
        notes: 'No signs of peeling or dampness.',
      },
      {
        inspectionId: inspection1.id,
        roomArea: 'Kitchen',
        itemName: 'Sink Plumbing & Drainage',
        status: CheckStatus.FAIL,
        mediaUrls: ['https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=800&q=80'],
        notes: 'Active water seepage detected beneath the main basin pipe.',
      },
      {
        inspectionId: inspection1.id,
        roomArea: 'Balcony',
        itemName: 'Railing Safety & Floor Drainage',
        status: CheckStatus.ATTENTION,
        mediaUrls: ['https://images.unsplash.com/photo-1512917774080-9991f1c4c750?auto=format&fit=crop&w=800&q=80'],
        notes: 'Slight rust on corner bracket, drain grate partially clogged.',
      },
      {
        inspectionId: inspection1.id,
        roomArea: 'Living Room',
        itemName: 'Main Door Lock & Intercom',
        status: CheckStatus.PASS,
        mediaUrls: [],
        notes: 'Digital lock functioning normally.',
      },
    ],
  });

  // Flagged Issue for Inspection 1
  const issue1 = await prisma.issue.create({
    data: {
      inspectionId: inspection1.id,
      propertyId: prop1.id,
      category: IssueCategory.LEAK,
      description: 'Major seepage observed under kitchen sink cupboard, damaging base woodwork.',
      mediaUrls: [
        'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?auto=format&fit=crop&w=800&q=80',
      ],
      status: IssueStatus.FLAGGED,
      flaggedBy: inspector.id,
    },
  });

  // Inspection 2: Brigade Meadows (Completed & Submitted with Report)
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 14);

  const inspection2 = await prisma.inspection.create({
    data: {
      propertyId: prop2.id,
      inspectorId: inspector.id,
      scheduledDate: pastDate,
      recurrenceRule: 'QUARTERLY',
      status: InspectionStatus.SUBMITTED,
      startedAt: pastDate,
      submittedAt: pastDate,
    },
  });

  await prisma.checklistItem.createMany({
    data: [
      {
        inspectionId: inspection2.id,
        roomArea: 'Garden & Perimeter',
        itemName: 'Boundary Wall & Lighting',
        status: CheckStatus.PASS,
        mediaUrls: ['https://images.unsplash.com/photo-1580587771525-78b9dba3b914?auto=format&fit=crop&w=800&q=80'],
        notes: 'All landscape bollards operational.',
      },
      {
        inspectionId: inspection2.id,
        roomArea: 'Utility / Electrical',
        itemName: 'Main Inverter & Meter Panel',
        status: CheckStatus.PASS,
        mediaUrls: [],
        notes: 'Earthing checked, breakers stable.',
      },
    ],
  });

  await prisma.inspectionReport.create({
    data: {
      inspectionId: inspection2.id,
      summaryUrl: 'https://groundpulse-media-dev.s3.ap-south-1.amazonaws.com/reports/inspection-brigade-meadows-q1.pdf',
      generatedAt: pastDate,
    },
  });

  // Issue 2: Resolved / In progress repair
  const issue2 = await prisma.issue.create({
    data: {
      inspectionId: inspection2.id,
      propertyId: prop2.id,
      category: IssueCategory.ELECTRICAL,
      description: 'Faulty MCB trip switch in patio lights circuit.',
      mediaUrls: [
        'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=800&q=80',
      ],
      status: IssueStatus.APPROVED,
      flaggedBy: inspector.id,
      decisionReason: 'Approved by Priya Sharma for immediate technician dispatch.',
    },
  });

  await prisma.repair.create({
    data: {
      issueId: issue2.id,
      providerId: serviceProvider.id,
      status: RepairStatus.IN_PROGRESS,
      costEstimate: 2400.0,
      completionNotes: 'Replaced trip fuse, waiting on secondary load verification.',
      completionPhotos: [],
    },
  });

  // 4. Notifications
  await prisma.notification.createMany({
    data: [
      {
        userId: owner.id,
        type: 'ISSUE_FLAGGED',
        payload: {
          issueId: issue1.id,
          propertyId: prop1.id,
          propertyName: 'Prestige Lakeside Habitat',
          category: 'LEAK',
          message: 'Inspector Ravi Kumar flagged a Leak issue in the Kitchen.',
        },
        read: false,
      },
      {
        userId: owner.id,
        type: 'REPORT_READY',
        payload: {
          inspectionId: inspection2.id,
          propertyName: 'Brigade Meadows Villa',
          reportUrl: 'https://groundpulse-media-dev.s3.ap-south-1.amazonaws.com/reports/inspection-brigade-meadows-q1.pdf',
        },
        read: true,
      },
    ],
  });

  // 5. Audit Logs
  await prisma.auditLog.createMany({
    data: [
      {
        entityType: 'PROPERTY',
        entityId: prop1.id,
        action: 'CREATED',
        actorId: owner.id,
        metadata: { address: prop1.address },
      },
      {
        entityType: 'ISSUE',
        entityId: issue1.id,
        action: 'FLAGGED',
        actorId: inspector.id,
        metadata: { category: 'LEAK' },
      },
      {
        entityType: 'ISSUE',
        entityId: issue2.id,
        action: 'APPROVED',
        actorId: owner.id,
        metadata: { reason: 'Immediate repair approved' },
      },
    ],
  });

  console.log('✅ Seed completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
