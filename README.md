# ReachInbox Full-stack Email Job Scheduler

Production-oriented full-stack email scheduling platform built with **TypeScript, Express.js, PostgreSQL, Prisma, Redis, BullMQ, Ethereal SMTP, Elasticsearch, React, Vite and Tailwind CSS**.

The application provides persistent email scheduling, distributed rate limiting, configurable worker concurrency, idempotency, Elasticsearch search, Slack notifications, Google OAuth and a Figma-style dashboard.

## Live Deployment

- **Frontend:** Vercel — https://reachinbox-brown-five.vercel.app/app
- **Backend API:** Render
- **Background Worker:** Voroa Background Worker running BullMQ
- **Email delivery:** Ethereal SMTP through the Voroa-hosted worker

**Microsoft Edge is recommended for the best application demonstration experience.**

## Architecture

```text
                           USER
                            │
                            ▼
                 ┌─────────────────────┐
                 │   Microsoft Edge    │
                 │    Recommended      │
                 └──────────┬──────────┘
                            │ HTTPS
                            ▼
                 ┌─────────────────────┐
                 │       Vercel        │
                 │ React + Vite        │
                 │ Tailwind CSS        │
                 └──────────┬──────────┘
                            │ REST + Cookie Auth
                            ▼
                 ┌─────────────────────┐
                 │       Render        │
                 │ Express + TypeScript│
                 │       API           │
                 └──────┬──────┬───────┘
                        │      │
                        ▼      ▼
              ┌────────────┐ ┌──────────────┐
              │ PostgreSQL │ │    Redis     │
              │ Source of  │ │ BullMQ Queue │
              │ Truth      │ │ Rate Limits  │
              │            │ │ Pacing       │
              └────────────┘ └──────┬───────┘
                                    │ BullMQ
                                    ▼
                         ┌─────────────────────┐
                         │      Voroa          │
                         │ Background Worker   │
                         │ Concurrency         │
                         │ Retry / Backoff     │
                         │ Idempotency         │
                         │ Rate Limiting       │
                         │ Sender Pacing       │
                         └──────────┬──────────┘
                                    │ SMTP
                                    ▼
                         ┌─────────────────────┐
                         │   Ethereal SMTP     │
                         │ smtp.ethereal.email │
                         │ Port 587            │
                         └─────────────────────┘

Additional integrations:
Express API → Elasticsearch → Email Search
Express API → Slack OAuth → Rate-limit Notifications
Express API → Google OAuth → Authentication
```

## How It Works

```text
User
 ↓
React/Vite frontend
 ↓
Express API
 ↓
Validate request
 ↓
Persist campaign + emails in PostgreSQL
 ↓
Create BullMQ delayed jobs
 ↓
Redis
 ↓
Email Worker
 ↓
Check SENT/idempotency state
 ↓
Reserve hourly rate-limit slot
 ↓
Reserve sender pacing slot
 ↓
Wait if required
 ↓
Ethereal SMTP
 ↓
Mark email SENT in PostgreSQL
 ↓
Index in Elasticsearch
 ↓
Dashboard shows Sent
```

## Features

### Authentication
- Google OAuth login
- Email/password registration and login
- Signed HTTP-only session cookie
- Logout
- User profile/avatar

### Dashboard
- Scheduled
- Sent
- Compose
- Search
- Message details
- Scheduled/sent counts
- Slack connection
- Logout

### Email Campaigns
- Subject and HTML body
- Multiple recipients
- Manual recipient entry
- CSV/TXT upload
- Client-side email extraction
- Duplicate removal
- Send Now
- Schedule Later
- Multiple senders
- Configurable delay
- Configurable hourly limit

### Queueing
- BullMQ delayed jobs
- Redis-backed queue
- No cron or cron-like library
- PostgreSQL persistence before queue creation
- Separate worker
- Configurable concurrency
- Exponential retry/backoff
- Delayed jobs survive restarts

### Rate Limiting
- Redis/Lua distributed sender pacing
- Redis/Lua hourly sender rate limit
- Multiple-worker safe coordination
- Jobs rescheduled into the next available hour
- Slack notification when the limit is reached

### Idempotency
- Durable unique idempotency key
- Conditional processing state transition
- SENT-state check
- Prevents re-processing of an already-sent email

### Search
- Elasticsearch indexing
- Elasticsearch-backed email search

### Slack
- Slack OAuth
- Token persistence
- Connect/reconnect
- Rate-limit notification
- Duplicate notification protection
- Slack failure does not crash worker

### Monitoring
- Bull Board
- Waiting/active/delayed/completed/failed jobs
- Worker health endpoint

## PostgreSQL

PostgreSQL is the persistent source of truth.

Main entities:

```text
User
EmailAccount
Campaign
Email
SlackConnection
```

The `Email` model stores:

```text
id
campaignId
userId
senderId
recipient
subject
body
scheduledAt
sentAt
status
bullJobId
idempotencyKey
attempts
errorMessage
createdAt
updatedAt
```

The database is written before queue creation so scheduled requests remain durable even if the worker is unavailable.

## Redis + BullMQ

Redis provides:

- BullMQ queue state
- Delayed jobs
- Sender pacing
- Hourly rate limiting
- Distributed coordination
- Slack notification deduplication

Queue configuration:

```text
Queue: email-send-queue
Attempts: 5
Backoff: Exponential
Initial delay: 2000 ms
```

## Minimum Send Delay

The worker reserves a Redis sender slot using:

```text
max(campaign.delayMs, MIN_EMAIL_DELAY_MS)
```

Example:

```text
Email 1
  ↓ 2 seconds
Email 2
  ↓ 2 seconds
Email 3
```

Because the slot is Redis-backed, multiple workers coordinate the delay.

## Hourly Rate Limit

`MAX_EMAILS_PER_HOUR` provides the default limit. The actual counter is keyed by sender and UTC hour.

Redis/Lua makes check-and-increment atomic.

```text
Hourly limit = 100

Emails 1–100 → current hour
Email 101+   → next available hour
```

When the limit is reached, the email is returned to `SCHEDULED` and its BullMQ job is delayed instead of being dropped.

## Multiple Senders

Each sender is represented by an `EmailAccount`, and campaigns reference `senderId`.

Sender pacing and hourly limits are maintained per sender.

## Idempotency and SMTP Delivery

Each email has a unique durable `idempotencyKey`.

Before processing:

```text
SCHEDULED / FAILED
        ↓
PROCESSING
```

If an email is already `SENT`, the worker does not send it again.

Exactly-once delivery to an external SMTP server cannot be absolutely guaranteed across every crash window. For example, SMTP could accept a message immediately before the application crashes and records `SENT`.

This implementation therefore uses durable idempotency keys, conditional state transitions, PostgreSQL state checks, BullMQ retries and SENT-state checks.

True exactly-once provider semantics would require an external provider with native idempotency-key support.

## Elasticsearch

After successful sending:

```text
PostgreSQL
 ↓
SENT
 ↓
Elasticsearch index
 ↓
Search API
 ↓
Dashboard
```

Elasticsearch is therefore an active search component.

## Slack Integration

OAuth flow:

```text
Dashboard
 ↓
Slack OAuth
 ↓
User authorization
 ↓
Callback
 ↓
Access token stored
 ↓
SlackConnection
```

When a sender reaches its hourly limit, the worker sends a Slack notification.

A Redis notification key prevents duplicate notifications during the same sender/hour.

Slack failures do not terminate email processing.

## Google OAuth

```text
Login
 ↓
Google OAuth
 ↓
Google authentication
 ↓
Backend callback
 ↓
User created/retrieved
 ↓
HTTP-only session cookie
 ↓
Dashboard
```

## CSV/TXT Upload

The Compose page supports CSV/TXT files.

Example:

```csv
email
user1@example.com
user2@example.com
user3@example.com
```

Recipients are extracted and deduplicated before scheduling.

## Bull Board

Bull Board endpoint:

```text
/admin/queues
```

It provides live inspection of:

- Waiting jobs
- Active jobs
- Delayed jobs
- Completed jobs
- Failed jobs

It is protected using basic authentication.

## Worker Architecture

### API

Responsible for:

```text
Authentication
Campaign creation
Email creation
Dashboard APIs
Search
Slack OAuth
User APIs
```

### Worker

Responsible for:

```text
BullMQ jobs
Delayed execution
Retries
Rate limiting
Sender pacing
SMTP sending
Email state updates
Elasticsearch indexing
Slack notifications
```

Separating the worker from the API prevents long-running email operations from blocking HTTP requests.

## Scaling 1000+ Jobs

Each recipient becomes an independent durable BullMQ job.

```text
1000 recipients
 ↓
1000 PostgreSQL email records
 ↓
1000 BullMQ jobs
 ↓
Redis
 ↓
Worker concurrency
 ↓
Rate limiting + sender pacing
 ↓
Controlled sending
```

Each email has independent scheduling, status, retries, attempts, errors and idempotency.

Multiple workers can run concurrently because pacing and rate-limit state live in Redis.

## Deployment

### Frontend — Vercel

React/Vite frontend:

**https://reachinbox-brown-five.vercel.app/app**

### Backend API — Render

Express + TypeScript REST API.

### Background Worker — Voroa

The production BullMQ worker runs as a **Voroa Background Worker**.

Voroa is connected to the same GitHub repository and runs:

```bash
npm --workspace apps/backend run start:worker
```

The worker is deployed independently from the Render API and does not require a public HTTP port.

The Voroa worker uses the same PostgreSQL and Redis infrastructure as the Render API through their **external connection URLs**.

Production flow:

```text
Vercel Frontend
      │
      ▼
Render API
      │
      ├──────────────► PostgreSQL
      │
      └──────────────► Redis / BullMQ
                              │
                              ▼
                       Voroa Worker
                              │
                              ▼
                       Ethereal SMTP
```

### Voroa Worker Configuration

```text
Service type: Background Worker
Repository: 0711samarthgv/reachinbox-email-scheduler
Branch: main
Root directory: /reachinbox-assignment/reachinbox-assignment

Start command:
npm --workspace apps/backend run start:worker
```

The current assignment deployment uses Voroa's free background-worker instance.

Runtime environment variables include the production PostgreSQL, Redis, Elasticsearch, Ethereal and worker configuration values. Secrets are injected at runtime and are not committed to GitHub.

Because Voroa runs outside Render's private network, the worker uses the **external Render PostgreSQL and Redis connection URLs**. Render Redis external access must allow the worker's external connection.

### Verified Production Email Flow

The deployed worker has been verified to process BullMQ jobs and successfully connect to Ethereal SMTP.

Example production worker logs:

```text
Sent <job-id> -> <recipient> (https://ethereal.email/message/...)
Job completed <job-id>
```

Multiple test jobs were successfully sent and completed through the Voroa worker.

This confirms the production path:

```text
Vercel
  ↓
Render API
  ↓
PostgreSQL + Redis
  ↓
BullMQ
  ↓
Voroa Background Worker
  ↓
Nodemailer
  ↓
Ethereal SMTP :587
```

Ethereal provides a preview URL for each captured message. It is a test/sandbox SMTP service and does not deliver messages to real recipient inboxes.

## Ethereal SMTP

Configuration:

```env
ETHEREAL_HOST=smtp.ethereal.email
ETHEREAL_PORT=587
ETHEREAL_USER=your_ethereal_user
ETHEREAL_PASSWORD=your_ethereal_password
```

Ethereal is a testing/sandbox service and does not deliver messages to real recipient inboxes.

Flow:

```text
Application
 ↓
Nodemailer
 ↓
Ethereal SMTP
 ↓
Captured message
 ↓
Preview URL
```

The Nodemailer preview URL can be opened to inspect the generated message.

## Browser Recommendation

For the best application and assignment demonstration experience, **Microsoft Edge is recommended**.

The login page displays:

```text
Recommended:
Please use Microsoft Edge for the best experience.
```

This does not block users from using other browsers.

# Local Setup

## Prerequisites

```text
Node.js
npm
PostgreSQL
Redis
```

Optional:

```text
Elasticsearch
```

## 1. Clone

```bash
git clone <repository-url>
cd reachinbox-assignment
```

## 2. Environment

Copy:

```bash
cp .env.example .env
```

Configure the required values.

## 3. Start infrastructure

```bash
docker compose up -d
```

This starts the local infrastructure configured in Docker Compose.

## 4. Install

```bash
npm install
```

## 5. Prisma

```bash
npm run db:generate
npm run db:migrate
```

## 6. Ethereal

Create an Ethereal account:

**https://ethereal.email**

Set:

```env
ETHEREAL_USER=your_ethereal_user
ETHEREAL_PASSWORD=your_ethereal_password
```

The application can create a test account automatically when credentials are empty, but fixed credentials are recommended for a repeatable demo.

## 7. Google OAuth

Local callback:

```text
http://localhost:4000/api/auth/google/callback
```

Production:

```text
<DEPLOYED_API_URL>/api/auth/google/callback
```

## 8. Slack OAuth

Local callback:

```text
http://localhost:4000/api/slack/oauth/callback
```

Production:

```text
<DEPLOYED_API_URL>/api/slack/oauth/callback
```

## 9. Start all applications

```bash
npm run dev
```

Frontend:

```text
http://localhost:5173
```

API:

```text
http://localhost:4000
```

Bull Board:

```text
http://localhost:4000/admin/queues
```

## Run Individually

API:

```bash
npm run dev:api
```

Worker:

```bash
npm run dev:worker
```

Frontend:

```bash
npm run dev:web
```

## Production Build

```bash
npm run build
```

Backend:

```bash
npm run build:backend
```

Frontend:

```bash
npm run build:frontend
```

# Environment Variables

Example:

```env
NODE_ENV=development

DATABASE_URL=your_postgresql_connection_string
REDIS_URL=your_redis_connection_string

JWT_SECRET=your_secret
COOKIE_NAME=reachinbox_session

FRONTEND_URL=http://localhost:5173
API_URL=http://localhost:4000

ELASTICSEARCH_URL=can't be disposed
ELASTICSEARCH_API_KEY=can't be disposed
ELASTICSEARCH_INDEX=emails

ETHEREAL_HOST=smtp.ethereal.email
ETHEREAL_PORT=587
ETHEREAL_USER=your_ethereal_user
ETHEREAL_PASSWORD=your_ethereal_password

GOOGLE_CLIENT_ID=can't be disposed
GOOGLE_CLIENT_SECRET=can't be disposed
GOOGLE_CALLBACK_URL=http://localhost:4000/api/auth/google/callback

SLACK_CLIENT_ID=your_slack_client_id
SLACK_CLIENT_SECRET=your_slack_client_secret
SLACK_REDIRECT_URI=http://localhost:4000/api/slack/oauth/callback
SLACK_SCOPES=chat:write,chat:write.customize,channels:read,groups:read

WORKER_CONCURRENCY=5
MAX_EMAILS_PER_HOUR=200
MIN_EMAIL_DELAY_MS=2000

BULL_BOARD_USER=admin
BULL_BOARD_PASSWORD=your_password
```

> Never commit `.env`, OAuth secrets, passwords, API keys, database URLs, Redis credentials, Ethereal credentials or JWT secrets.

# Demo Flow

1. Open the deployed frontend.
2. Use Microsoft Edge for the recommended demonstration experience.
3. Login with Google.
4. Open **Compose**.
5. Enter subject and body.
6. Add recipients manually or upload CSV/TXT.
7. Choose sender.
8. Configure start time, delay and hourly limit.
9. Schedule the campaign.
10. Open **Scheduled** and verify persisted rows.
11. Open **Bull Board** and show delayed/waiting jobs.
12. Demonstrate persisted scheduling and background processing.
13. Open the Ethereal preview URL from the Voroa worker log and show the generated message.
14. Verify the email becomes **Sent**.
15. Search by recipient, subject or body and demonstrate Elasticsearch.
16. Connect Slack.
17. Configure a deliberately small hourly limit.
18. Demonstrate rescheduling and Slack notification.
19. Show BullMQ retry/failure handling if required.

# Assignment Requirement Mapping

| Requirement | Implementation |
|---|---|
| TypeScript backend | Express + TypeScript |
| Express.js | Backend REST API |
| BullMQ | Background email jobs |
| Redis | BullMQ + distributed rate limiting |
| PostgreSQL/MySQL | PostgreSQL + Prisma |
| Ethereal SMTP | Nodemailer + Ethereal |
| Persist scheduled requests | PostgreSQL |
| Delayed jobs survive restart | BullMQ + Redis |
| No cron | BullMQ delayed jobs |
| Idempotency | Unique idempotency key + state checks |
| Multiple senders | EmailAccount + senderId |
| Elasticsearch | Email indexing and search |
| Live queue dashboard | Bull Board |
| Configurable concurrency | WORKER_CONCURRENCY |
| Minimum send delay | Redis-backed sender pacing |
| Hourly rate limit | Redis/Lua sender rate limiter |
| Reschedule after limit | BullMQ delayed rescheduling |
| Preserve order as much as possible | Sender slots + delayed scheduling |
| Slack OAuth | Slack OAuth flow |
| Slack token persistence | SlackConnection |
| Slack notification | Rate-limit notification |
| Slack reconnect | Slack connection management |
| Slack failure handling | Non-blocking Slack notification |
| 1000+ jobs | Individual durable BullMQ jobs |
| React frontend | React + TypeScript |
| Modern UI | Tailwind CSS |
| Google OAuth | Google OAuth |
| Dashboard | Scheduled / Sent / Compose |
| CSV/TXT upload | Recipient upload |
| Send Now | Compose |
| Schedule Later | Compose |
| Configurable delay | Compose |
| Hourly limit | Compose |
| Scheduled table | Dashboard |
| Sent table | Dashboard |
| Search | Elasticsearch |
| Loading states | Frontend |
| Empty states | Frontend |
| Error states | Frontend |
| Private GitHub repository | GitHub |
| Docker | Docker Compose |
| Deployment | Vercel + Render + Voroa |
| Persistent database | PostgreSQL |
| Background worker | Voroa Background Worker |

# Project Structure

```text
reachinbox-assignment/
│
├── apps/
│   ├── backend/
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   └── migrations/
│   │   └── src/
│   │       ├── config/
│   │       │   └── env.ts
│   │       ├── lib/
│   │       │   ├── prisma.ts
│   │       │   ├── redis.ts
│   │       │   └── auth.ts
│   │       ├── middleware/
│   │       ├── queue/
│   │       │   └── emailQueue.ts
│   │       ├── routes/
│   │       │   ├── auth.ts
│   │       │   ├── emails.ts
│   │       │   ├── slack.ts
│   │       │   └── users.ts
│   │       ├── services/
│   │       │   ├── email.ts
│   │       │   ├── elasticsearch.ts
│   │       │   ├── rateLimiter.ts
│   │       │   └── slack.ts
│   │       ├── worker/
│   │       │   └── emailWorker.ts
│   │       ├── app.ts
│   │       ├── server.ts
│   │       ├── worker.ts
│   │       └── workerWeb.ts
│   │
│   └── frontend/
│       ├── src/
│       │   ├── components/
│       │   ├── pages/
│       │   ├── lib/
│       │   └── main.tsx
│       ├── vercel.json
│       └── package.json
│
├── docker-compose.yml
├── package.json
├── package-lock.json
├── render.yaml
└── README.md
```

# API Overview

## Authentication

```text
POST /api/auth/login
POST /api/auth/register
POST /api/auth/logout
GET  /api/auth/google
```

## Users

```text
GET /api/users/me
```

## Emails

```text
POST /api/emails/schedule
GET  /api/emails/scheduled
GET  /api/emails/sent
GET  /api/emails/search
GET  /api/emails/stats/counts
GET  /api/emails/:id
```

## Slack

```text
GET /api/slack/status
GET /api/slack/oauth/start
GET /api/slack/oauth/callback
```

# Security

The application includes:

- HTTP-only authentication cookies.
- Google OAuth.
- Password authentication.
- Helmet security headers.
- Zod input validation.
- Environment-based secrets.
- Protected Bull Board.
- Unique database constraints.
- Conditional email state transitions.
- No secrets committed to GitHub.

# Health and Graceful Shutdown

The production worker runs as a Voroa Background Worker and does not require a public HTTP health endpoint.

The worker is designed to shut down gracefully so active processing can complete before exit.

For the alternative Render Web Service worker implementation, `workerWeb.ts` exposes:

```text
GET /health
```

That implementation is retained in the repository but is not used by the current production deployment.

# Cost

The current assignment deployment is designed to use free tiers where possible.

```text
Frontend       → Vercel Free
Backend API    → Render Free
Redis          → Render Free tier
Database       → Render Free tier where available
Email Worker   → Voroa Free Background Worker
Ethereal       → Free
```

The hosted Voroa worker allows the production deployment to connect to Ethereal SMTP on port 587 without relying on Render Free's outbound SMTP connectivity.

A paid worker/compute service can alternatively be used for higher production capacity.

# Production Recommendations

For a production deployment, consider:

- Dedicated email API/SMTP provider.
- Provider-level delivery tracking.
- Native provider idempotency keys.
- Dead-letter queue.
- Advanced observability.
- Distributed tracing.
- Metrics dashboards.
- Dedicated Redis with `noeviction`.
- Production Elasticsearch deployment.
- Secret manager.
- Automated integration tests.
- Horizontal worker scaling.
- Email provider webhooks.
- Bounce and complaint processing.
- Attachment storage.
- Advanced campaign analytics.

# Conclusion

ReachInbox is implemented as a distributed email scheduling system using:

```text
React
+
TypeScript
+
Express
+
PostgreSQL
+
Prisma
+
Redis
+
BullMQ
+
Elasticsearch
+
Slack OAuth
+
Google OAuth
+
Ethereal SMTP
```

The architecture separates the frontend, API, persistent database, Redis queue, Voroa-hosted background worker and external integrations.

The system supports:

- Persistent email scheduling.
- BullMQ delayed jobs.
- Redis-backed queueing.
- Configurable worker concurrency.
- Retry and exponential backoff.
- Minimum sender delay.
- Distributed hourly rate limiting.
- Automatic rate-limit rescheduling.
- Multiple senders.
- Idempotency.
- Elasticsearch search.
- Slack OAuth and notifications.
- Google OAuth.
- CSV/TXT recipient upload.
- Scheduled and Sent dashboards.
- Bull Board queue monitoring.
- 1000+ independent email jobs.
- Graceful worker shutdown.

The current production deployment uses a Voroa Background Worker for BullMQ processing and Ethereal SMTP delivery. Render remains the API/database/Redis platform, while Voroa runs the long-lived worker outside Render's private network.

**Microsoft Edge is recommended for the best application demonstration experience.**
