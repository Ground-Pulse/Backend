# GroundPulse Backend API 🏢⚡

Production-ready backend for **GroundPulse** (Smart Remote Property Monitoring & Maintenance Platform), built with NestJS 10, TypeScript 5.4+, PostgreSQL 15, Prisma ORM, CASL RBAC, BullMQ background jobs, and real-time Socket.IO gateways.

## 🌐 Live Demo

| | |
|---|---|
| **API** | https://groundpulse-api.onrender.com (health check: [`/health`](https://groundpulse-api.onrender.com/health)) |
| **Website** | https://groundpulse-web.vercel.app ([source](https://github.com/Ground-Pulse/Frontend)) |

Hosted on Render's free plan (API + PostgreSQL + Redis from `render.yaml`): it sleeps after 15 minutes idle, so the first request can take ~50 seconds.

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

Frontend and backend live in **separate repos** and run side by side:
backend on `http://localhost:3001`, frontend on `http://localhost:3000`.

### 1. Prerequisites
- Node.js 20+, Docker Desktop (running)

### 2. Environment
```bash
cp .env.example .env
```
Defaults work for local dev. `MEDIA_DRIVER=local` stores uploads in `./uploads`
(no AWS account needed); set it to `s3` with real credentials for S3/R2.

### 3. Database & Redis
```bash
docker compose up -d
```

### 4. Migrate & seed
```bash
npx prisma migrate deploy
npm run prisma:seed
```
`npm run db:reset` drops everything, re-applies migrations and re-seeds.

### 5. Run
```bash
npm run start:dev
```

### 6. Point the frontend at it
In the frontend repo's `.env.local`:
```
NEXT_PUBLIC_USE_MOCK_API=false
NEXT_PUBLIC_API_BASE_URL=http://localhost:3001
NEXT_PUBLIC_WS_URL=http://localhost:3001
```
then `npm run dev` in the frontend.

---

## 🔑 Seed accounts (password `password123` for all)

| Role | Email |
|---|---|
| Owner | priya@example.com, arvind@example.com |
| Inspector | ravi@example.com (job today), meera@example.com, karan@example.com (pending verification) |
| Admin | admin@groundpulse.in |
| Provider | imran@example.com (job in progress), suresh@, deepa@, ganesh@example.com, joseph@example.com (pending) |

---

## 📡 API

The response shapes are exactly what the frontend's `src/lib/types.ts` expects;
all mapping lives in `src/common/views.ts`. Errors are `{ statusCode, code, message }`.

| Area | Endpoints |
|---|---|
| Auth | `POST /auth/register` `POST /auth/login` `POST /auth/refresh` `GET /auth/me` `POST /auth/logout` |
| Account | `PATCH /users/me` `GET\|PATCH /users/me/preferences` |
| Properties | `GET\|POST /properties` `GET\|PATCH /properties/:id` `POST /properties/:id/archive` `GET /properties/:id/health-history` `GET\|POST /properties/:id/documents` `DELETE /documents/:id` |
| Inspections | `GET\|POST /inspections` (`?propertyId&status&unassigned`) `GET /inspections/:id` `POST /inspections/:id/start` `PATCH /inspections/:id/checklist` `POST /inspections/:id/submit` `POST /inspections/:id/cancel` |
| Issues | `GET\|POST /issues` `GET /issues/:id` `POST /issues/:id/approve` `POST /issues/:id/decline` `GET\|POST /issues/:id/messages` |
| Repairs | `GET /repairs?status=` `POST /repairs/:id/assign` `PATCH /repairs/:id/status` `POST /repairs/:id/decline` `POST /repairs/:id/complete` `POST /repairs/:id/rate` |
| Providers | `GET /providers?verified&locality&serviceType` `GET /providers/me` |
| Admin | `GET /admin/dashboard` `POST /admin/reassign` `GET /admin/verification` `POST /admin/verification/:userId/approve\|reject` `GET /admin/audit-logs` `GET /inspectors` `GET /templates` `PUT /templates/:id` |
| Notifications | `GET /notifications` `PATCH /notifications/:id/read` `POST /notifications/read-all` |
| Media | `POST /media/presign` → `{ uploadUrl, publicUrl }` (`PUT /media/upload/:key` + `/uploads/*` with the local driver) |

Business rules enforced server-side: role scoping on every query, verified-only
assignment (`PROVIDER_NOT_VERIFIED`, `INSPECTOR_NOT_VERIFIED`), repair state
machine (`REPAIR_INVALID_TRANSITION`), future dates only, complete checklist
before submit, ≥1 photo per issue, an audit row in the same transaction as every
state change, report generation + inspector auto-assignment as BullMQ jobs, and
recurring inspections spawning the next one.

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
socket.on('inspection.updated', (data) => console.log('Inspection updated:', data));
socket.on('dashboard.changed', () => console.log('Admin counts changed'));
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
