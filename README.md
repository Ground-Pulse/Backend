# GroundPulse Backend API 🏢⚡

Production-ready backend for **GroundPulse** (Smart Remote Property Monitoring & Maintenance Platform), built with NestJS 10, TypeScript 5.4+, PostgreSQL 15, Prisma ORM, CASL RBAC, BullMQ background jobs, and real-time Socket.IO gateways.

---

## 🛠 Tech Stack

- **Framework**: [NestJS 10](https://nestjs.com/) (Modular architecture, DI, Validation Pipes, Interceptors)
- **Runtime & Language**: Node.js 20 LTS, TypeScript 5.4+ (Strict Mode)
- **Database & ORM**: PostgreSQL 15+ with [Prisma ORM](https://www.prisma.io/)
- **Authentication & Authorization**: Passport.js + JWT (Access + Refresh tokens) & [CASL](https://casl.js.org/) for entity-level permissions
- **Background Job Queue**: [BullMQ](https://docs.bullmq.io/) backed by Redis 7+ via `ioredis`
- **Real-Time Communication**: Socket.IO (`@nestjs/platform-socket.io`, `@nestjs/websockets`) with JWT auth & room-scoped channels (`user:{userId}`)
- **Object Storage / Media**: AWS S3 SDK (`@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`) for 15-minute direct pre-signed PUT URLs
- **Email Service**: Nodemailer (configured for Resend / SendGrid / SMTP)
- **Security & Headers**: Helmet.js, CORS allowlist for `http://localhost:3000`, `@nestjs/throttler` rate limiting
- **Logging & Error Handling**: Pino (`nestjs-pino`, `pino-pretty`) & standardized `GlobalExceptionFilter`
- **Containerization**: `docker-compose.yml` for local PostgreSQL & Redis

---

## 📁 Directory Structure

```text
backend/
├── docker-compose.yml
├── .env.example
├── package.json
├── tsconfig.json
├── nest-cli.json
├── prisma/
│   ├── schema.prisma                  # 10 core entities & indexes
│   └── seed.ts                        # Seed data mirroring frontend mock data
└── src/
    ├── main.ts                        # Application bootstrap, Helmet, CORS, Filters
    ├── app.module.ts                  # Root module with BullMQ, Pino, Throttler
    ├── common/
    │   ├── decorators/                # @CurrentUser, @Roles, @Public, @CheckPolicies
    │   ├── exceptions/                # GroundPulseException with standardized codes
    │   ├── filters/                   # GlobalExceptionFilter (GroundPulseError format)
    │   ├── guards/                    # JwtAuthGuard, RolesGuard
    │   └── interceptors/              # TransformInterceptor
    ├── modules/
    │   ├── auth/                      # Register, Login, Refresh, Me, CASL ability factory
    │   ├── property/                  # Scoped property CRUD, audit logs
    │   ├── inspection/                # Scheduling, checklist batch updates, submission
    │   ├── issue-repair/              # Flag issues, approve/decline, provider assignment
    │   ├── provider/                  # Verified provider directory, assignment checks
    │   ├── notification/              # Real-time Socket.IO gateway, email, persistence
    │   ├── admin/                     # Live dashboard counts, reassignments
    │   ├── media/                     # S3 pre-signed PUT upload URLs
    │   └── jobs/                      # BullMQ processors (reports & notifications)
    └── prisma/
        ├── prisma.service.ts
        └── prisma.module.ts
```

---

## 🚀 Getting Started

### 1. Prerequisites
- Node.js 20+
- Docker & Docker Compose (or local Postgres & Redis instances)

### 2. Environment Configuration
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```

### 3. Start Database & Redis via Docker
```bash
docker compose up -d
```
This spins up:
- **PostgreSQL**: `localhost:5432` (`groundpulse` database)
- **Redis**: `localhost:6379`

### 4. Database Migration & Seeding
```bash
# Push schema to database
npx prisma db push

# Or run migrations
npm run prisma:migrate

# Seed mock data
npm run prisma:seed
```

### 5. Run Backend
```bash
# Development mode with hot-reload
npm run start:dev

# Production build & start
npm run build
npm run start:prod
```
The API server will listen on `http://localhost:3001`.

---

## 🔑 Default Seed Credentials

| Role | Email | Password | Notes |
| :--- | :--- | :--- | :--- |
| **Owner** | `priya@example.com` | `password123` | Owns Prestige Lakeside, Brigade Meadows, Plot 44 |
| **Inspector** | `ravi@example.com` | `password123` | Assigned to active inspections |
| **Admin** | `admin@groundpulse.com` | `admin123` | Unrestricted console access |
| **Provider** | `plumber@express.com` | `password123` | Verified provider (`Express Plumbing & Repairs`) |

---

## 📡 API Endpoints Overview

### Authentication (`/auth`)
- `POST /auth/register` — Register User (`name`, `email`, `password`, `role`, `phone`)
- `POST /auth/login` — Validate credentials, returns `{ accessToken, refreshToken, user }`
- `POST /auth/refresh` — Issue fresh token pair
- `GET /auth/me` — Current logged-in user profile

### Properties (`/properties`)
- `GET /properties` — Scoped by `ownerId` (or all for Admin)
- `POST /properties` — Create property (`address`, `type`, `coverPhotoUrl`)
- `GET /properties/:id` — Property details, recent inspections, and active issues
- `PATCH /properties/:id` — Update property details (Owner / Admin)

### Inspections (`/inspections`)
- `POST /inspections` — Schedule inspection (`propertyId`, `scheduledDate`, `recurrenceRule`). Validates future date.
- `GET /inspections?role=owner|inspector` — Role-scoped inspections list
- `GET /inspections/:id` — Inspection details with checklist items
- `PATCH /inspections/:id/checklist` — Batch update checklist item drafts without locking
- `POST /inspections/:id/submit` — Validates all checklist items are non-null (`PASS`, `FAIL`, `ATTENTION`), marks `SUBMITTED`, enqueues BullMQ report generation

### Issues & Repairs (`/issues`, `/repairs`)
- `POST /issues` — Inspector flags an issue (`category`, `description`, `mediaUrls`). Emits `issue.flagged` and notifies owner.
- `GET /issues/:id` — Fetch issue details
- `POST /issues/:id/approve` — Owner approves issue; atomically creates `Repair` (`REQUESTED`)
- `POST /issues/:id/decline` — Owner declines issue with `decisionReason`
- `POST /repairs/:id/assign` — Admin assigns provider. **Enforces `service_providers.verified === true`**.
- `PATCH /repairs/:id/status` — State machine transition (`REQUESTED` → `ASSIGNED` → `IN_PROGRESS` → `COMPLETED`)
- `POST /repairs/:id/complete` — Provider marks complete with `completionNotes` and `completionPhotos`

### Admin Console (`/admin`)
- `GET /admin/dashboard` — Live counts (`activeProperties`, `pendingInspections`, `openIssues`, `inProgressRepairs`)
- `POST /admin/reassign` — Reassign inspector or verified provider

### Media Pre-Signed URLs (`/media`)
- `POST /media/presign-upload` — Generates 15-minute AWS S3 pre-signed PUT URL with MIME type validation

### Notifications (`/notifications`)
- `GET /notifications` — User notifications list sorted descending
- `PATCH /notifications/:id/read` — Mark notification as read

---

## ⚡ Real-Time Socket.IO Events

Connect to the Socket.IO server passing JWT in `auth.token`:
```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3001', {
  auth: { token: accessToken },
});

// Auto-joined to room `user:{userId}`
socket.on('notification.new', (data) => console.log('New notification:', data));
socket.on('repair.status.updated', (data) => console.log('Repair updated:', data));
socket.on('issue.flagged', (data) => console.log('Issue flagged:', data));
socket.on('report.ready', (data) => console.log('Report ready:', data));
```

---

## ⚠️ Standardized Error Format

All errors return the standardized `GroundPulseError` format:
```json
{
  "statusCode": 400,
  "code": "CHECKLIST_INCOMPLETE",
  "message": "All checklist items must have a status before submitting"
}
```

Standard Error Codes:
- `PROPERTY_NOT_FOUND`
- `FORBIDDEN_NOT_OWNER`
- `INSPECTION_NOT_FOUND`
- `PAST_DATE_NOT_ALLOWED`
- `CHECKLIST_INCOMPLETE`
- `INSPECTION_ALREADY_SUBMITTED`
- `ISSUE_MEDIA_REQUIRED`
- `ISSUE_ALREADY_DECIDED`
- `PROVIDER_NOT_VERIFIED`
- `REPAIR_INVALID_TRANSITION`
- `UNAUTHORIZED`
- `EMAIL_ALREADY_EXISTS`
- `INVALID_CREDENTIALS`
