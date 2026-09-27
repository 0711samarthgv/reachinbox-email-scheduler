# ReachInbox Full-stack Email Job Scheduler

Production-oriented assignment implementation using TypeScript, Express, PostgreSQL/Prisma, BullMQ/Redis, Ethereal SMTP, Elasticsearch, React and Tailwind CSS.

## Architecture

```text
React/Vite
   │ REST + cookie auth
   ▼
Express API ───────────────► PostgreSQL (source of truth)
   │                              │
   ├──────────────► Elasticsearch │
   │                              │
   └──────────────► Redis ◄───────┘
                     │
                     ▼
                 BullMQ Queue
                     │
                     ▼
                Email Worker
                ├─ distributed sender pacing
                ├─ distributed hourly rate limit
                ├─ idempotency/state checks
                └─ Ethereal SMTP
                     │
                     └── Slack notification on limit hit
```

## Features

- Google OAuth login with signed HTTP-only session cookie.
- Dashboard matching the supplied Figma style: Scheduled, Sent, search, compose and message detail.
- CSV/TXT recipient upload and client-side email extraction.
- BullMQ delayed jobs; no cron or cron-like library.
- PostgreSQL persistence before queue creation.
- Separate worker process with configurable concurrency.
- Distributed minimum-send-delay slot using Redis/Lua.
- Distributed hourly sender rate limit using Redis/Lua.
- Jobs are delayed into the next hour rather than dropped when the limit is reached.
- Idempotent DB state transition prevents re-processing a job after it is already marked SENT.
- Elasticsearch indexing/search for scheduled and sent messages.
- Bull Board at `/admin/queues` (basic auth).
- Slack OAuth connection and live Slack notification on rate-limit hit.
- Ethereal SMTP support.
- Docker Compose for PostgreSQL, Redis and Elasticsearch.
- Health endpoint and graceful worker shutdown.

## Important delivery note about SMTP idempotency

A process can crash in the tiny window after an SMTP server accepts a message but before PostgreSQL records `SENT`. No application-level database transaction can make an external SMTP call exactly-once. This implementation uses a durable idempotency key, conditional processing state, BullMQ retries and a sent-state check. For true exactly-once provider semantics, a provider with idempotency-key support would be required.

## Local setup

1. Copy `.env.example` to `.env`.
2. Start infrastructure:

```bash
docker compose up -d
```

3. Install dependencies:

```bash
npm install
```

4. Generate Prisma client and migrate:

```bash
npm run db:generate
npm run db:migrate
```

5. Create an Ethereal account at https://ethereal.email and set `ETHEREAL_USER` and `ETHEREAL_PASSWORD`. The application can also create an Ethereal test account automatically if those are empty, but using fixed credentials is better for a repeatable demo.

6. Configure Google OAuth. The callback is:

`http://localhost:4000/api/auth/google/callback`

Production callback must use the deployed HTTPS API URL.

7. Configure Slack OAuth. The callback is:

`http://localhost:4000/api/slack/oauth/callback`

8. Start all apps:

```bash
npm run dev
```

Frontend: http://localhost:5173
API: http://localhost:4000
Bull Board: http://localhost:4000/admin/queues

## Demo flow

1. Login with Google.
2. Open Compose.
3. Enter subject/body and upload a CSV containing an `email` column or raw email addresses.
4. Choose start time, delay and hourly limit.
5. Schedule.
6. Open Scheduled and verify rows are persisted.
7. Open Bull Board and show delayed/waiting jobs.
8. Stop the worker/API, wait, then start again. Redis retains delayed jobs and the worker continues them.
9. Open Ethereal's message preview and show the delivered message.
10. Verify the row becomes Sent.
11. Search by recipient/subject/body; search is served through Elasticsearch.
12. Connect Slack and demonstrate a deliberately small hourly limit.

## Rate limiting implementation

`MAX_EMAILS_PER_HOUR` is the default global limit. The actual counter is keyed by sender and UTC hour window. Redis Lua scripts make the check-and-increment atomic across worker processes. When a window is full, the worker throws a typed reschedule error; BullMQ moves the job into the next available hour. A Redis sender-slot key also serializes the minimum spacing between actual sends across workers.

## Scaling 1000+ jobs

Each recipient is an independent durable BullMQ job. The API writes all email records first and then enqueues delayed jobs. Redis stores delayed jobs. Multiple workers can run concurrently because rate-limit and pacing state live in Redis rather than process memory. PostgreSQL remains the source of truth and Elasticsearch is a search projection.

## Production deployment

Recommended topology:

- Frontend: Vercel.
- API: Render/Railway/Fly.io web service.
- Worker: separate Render/Railway background worker using `npm --workspace apps/backend run start:worker`.
- PostgreSQL: managed Postgres/Neon/Render.
- Redis: Upstash Redis or managed Redis.
- Elasticsearch: Elastic Cloud.

Set production OAuth callbacks to the deployed API URL and add the frontend URL to CORS and Google OAuth origins. Never commit `.env` or provider secrets.
