# 🚀 ReachInbox Email Scheduler

A **production-grade email job scheduler + dashboard** built for the ReachInbox hiring assignment.

Schedules emails at scale using **BullMQ + Redis** (no cron), sends via **Ethereal Email SMTP**, persists state in **PostgreSQL**, makes emails **searchable via Elasticsearch**, and exposes a clean **Next.js dashboard** with Google login and Slack notifications.

---

## 📦 Features At A Glance

### Backend
| Feature | Details |
|---|---|
| **Scheduler** | BullMQ delayed jobs (no cron) backed by Redis |
| **Persistence** | PostgreSQL via Prisma; jobs survive restarts |
| **Idempotency** | Unique idempotency keys + DB status checks prevent duplicate sends |
| **Rate Limiting** | Redis-backed counters per sender + global, configurable via env |
| **Concurrency** | Configurable BullMQ worker concurrency |
| **Email Sending** | Nodemailer + Ethereal (fake SMTP with preview URLs) |
| **Search** | Elasticsearch ingestion + full-text search API |
| **Slack Alerts** | Real OAuth connect flow + instant `.postMessage` on rate-limit hit |
| **Queue Dashboard** | Live BullMQ stats endpoint (waiting/active/delayed/completed/failed) |

### Frontend
| Feature | Details |
|---|---|
| **Google Login** | Real Google OAuth (Google Identity Services), avatar + name in header, logout |
| **Dashboard** | Stats cards (total/scheduled/sent/failed) + live queue status + Slack panel |
| **Compose Modal** | Subject, body, CSV/TXT upload with email detection count, start time, delay, hourly limit |
| **Scheduled Table** | Recipient, subject, scheduled time, status, cancel action, loading + empty states |
| **Sent Table** | Recipient, subject, sent time, status (sent/failed), loading + empty states |
| **Search** | Elasticsearch-backed search box on scheduled & sent pages |
| **Design** | Clean dark UI, reusable components, TypeScript throughout |

---

## 🏗 Architecture

```
┌──────────────────┐       ┌──────────────────────────────────────┐
│  Next.js App     │  API  │  Express.js Backend                 │
│  (Google OAuth,  │──────▶│  ┌──────────────────────────────┐   │
│   dashboard)     │       │  │  /api/emails/schedule        │   │
└──────────────────┘       │  │  /api/emails/scheduled|sent  │   │
                           │  │  /api/emails/search          │   │
                           │  │  /api/slack/*                │   │
                           │  │  /api/queue/stats            │   │
                           │  └──────────────┬───────────────┘   │
                           │                 │                   │
                           │        ┌────────▼────────┐          │
                           │        │    PostgreSQL    │          │
                           │        │   (Prisma ORM)   │          │
                           │        └────────┬────────┘          │
                           │                 │                   │
┌──────────────────┐       │        ┌────────▼────────┐          │
│  Elasticsearch   │◀──────│────────│   BullMQ Queue  │          │
│  (index + search)│       │        │     + Redis     │          │
└──────────────────┘       │        └────────┬────────┘          │
                           │                 │                   │
                           │        ┌────────▼────────┐          │
                           │        │     Worker       │          │
                           │        │  (concurrency=5)│          │
                           │        └────────┬────────┘          │
                           │                 │                   │
                           │        ┌────────▼────────┐          │
                           │        │   Ethereal SMTP  │          │
                           │        │   (Nodemailer)   │          │
                           │        └──────────────────┘          │
                           │                 │                   │
                           │        ┌────────▼────────┐          │
                           │        │  Slack Notify   │          │
                           │        │  (on rate limit)│          │
                           │        └─────────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

### How Scheduling Works
1. **`POST /api/emails/schedule`** receives subject, body, recipients, start time, delay, and sender.
2. Each recipient becomes an `EmailJob` row in **PostgreSQL** (status `scheduled`, unique `idempotencyKey`).
3. Each row is enqueued as a **BullMQ delayed job** with `delay = scheduledAt - now`. The delay is computed server-side so the exact send time is stored in the DB row `scheduledAt`.
4. The **BullMQ QueueScheduler** promotes delayed jobs to the waiting queue at the right instant.
5. The **Worker** picks the job → checks rate limits (Redis counters) → sends via Ethereal → updates DB + Elasticsearch.
6. No cron anywhere — scheduling is purely BullMQ delayed jobs driven by the `scheduledAt` timestamp persisted in Postgres.

### How Persistence On Restart Works
- Every job's target send time lives in **PostgreSQL** (`EmailJob.scheduledAt`), not only in Redis.
- On startup, the `recoverOrphanedJobs()` function queries all `scheduled`/`rate_limited` jobs from PostgreSQL. For each one, it checks whether the corresponding BullMQ job still exists in Redis. If not (e.g. Redis flushed or container restarted), the job is re-enqueued as a new BullMQ delayed job and the new `bullmqJobId` is saved back to the DB. Elasticsearch is also re-indexed.
- The **worker checks DB state before sending**: if a job is already `sent` it is skipped, making restarts non-duplicating and non-restarting.
- BullMQ delayed jobs are themselves persisted in Redis, which uses a persistent Docker volume (`redis_data`).

### How Rate Limiting & Concurrency Are Implemented

**Concurrency** — `WORKER_CONCURRENCY` env controls how many jobs the BullMQ worker processes in parallel. Default `5`. Logged at startup.

**Minimum delay between emails** — `MIN_DELAY_BETWEEN_EMAILS_MS` (default **2000 ms / 2 seconds**). The worker enforces it by sleeping the configured delay after each successful send. Additionally the scheduling layer spaces out `scheduledAt` per recipient by the user-provided delay seconds.

**Email per hour (Rate limiting)** — enforced with **Redis counters keyed by `hour_window + sender`** (and a global bucket too), both configurable:
- `MAX_EMAILS_PER_HOUR` (global, default 200)
- `MAX_EMAILS_PER_HOUR_PER_SENDER` (per sender, default 50)
- The per-request `hourlyLimit` from the compose modal is passed through the BullMQ job data and overrides the per-sender default for that campaign.
- key format: `ratelimit:sender:<sender>:<utc-hour-window>` and `ratelimit:global:<utc-hour-window>`, with 1h TTL.

**When the hourly limit is reached**:
- **Never dropped, never permanently failed.** The job is marked `rate_limited` in DB, its BullMQ job is re-scheduled into the next hour window (`delay = seconds until next UTC hour + jitter`), preserving original order as much as possible.
- A **live Slack message** is posted to the connected Slack workspace via `chat.postMessage` (requires real Slack app + OAuth).
- If Slack isn't connected, notification is skipped gracefully (no crash); connecting later starts notifications without redeploy.

**Trade-offs** (documented honestly):
- Redis counters are atomic (`INCR` / `EXPIRE`) so they're correct across multiple worker instances. A small race window exists between the check and a concurrent worker's increment, which is acceptable for email throttling but we note it could be tightened with `INCR`-now-check.
- The per-worker BullMQ `limiter` is also enabled as a secondary in-memory cap; the Redis counter is the source of truth for the "next window" reschedule.

---

## 🛠 Setup

### Prerequisites
- Node.js 18+ and npm
- Docker (for Postgres, Redis, Elasticsearch) — or run them natively

### 1. Infrastructure (Docker)
```bash
docker compose up -d
```
This starts:
- **PostgreSQL** on `localhost:5432` (postgres/postgres, db `email_scheduler`)
- **Redis** on `localhost:6379`
- **Elasticsearch** on `localhost:9200`

### 2. Backend

```bash
cd backend
npm install
cp .env.example .env
npx prisma db push        # creates tables
npx prisma generate       # generates client
npm run dev               # starts API + scheduler + worker (single process)
```

> ℹ️ Ethereal Email auto-creates a fresh SMTP account on first run if you leave `ETHEREAL_USER=PASS` as `auto_generated`. The credentials + preview URLs are printed to the console.

> ⚙️ To also test the worker in a **separate process**, omit it from the API by using `npm run worker` in another terminal (the API starts the worker for simplicity; see Notes).

### 3. Frontend

```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev               # http://localhost:3000
```

### 4. Google OAuth
1. Create a project at https://console.cloud.google.com → **APIs & Services → Credentials**.
2. Create an **OAuth client ID (Web)** → authorized JS origin `http://localhost:3000`.
3. Put the client ID in **both** `backend/.env` (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`) and `frontend/.env.local` (`NEXT_PUBLIC_GOOGLE_CLIENT_ID`).
4. If you don't configure Google, the frontend shows a **Developer Login** fallback.

### 5. Slack (for rate-limit notifications)
1. Create a Slack app at https://api.slack.com/apps.
2. Add scopes: **`chat:write`**, redirect to `http://localhost:3000/api/slack/callback`.
3. Put client ID/secret in `backend/.env` (`SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`).
4. In the dashboard, click **Connect Slack** → authorize → done.

---

## 🔌 API Reference

### Auth
| Method | Route | Body | Description |
|---|---|---|---|
| POST | `/api/auth/google` | `{ idToken }` | Verify Google ID token, create/find user, return JWT |
| POST | `/api/auth/dev-login` | `{ email?, name? }` | Dev-only login (disabled in production) |
| GET | `/api/auth/me` | – | Current user profile |

### Emails (JWT required)
| Method | Route | Body / Query | Description |
|---|---|---|---|
| POST | `/api/emails/schedule` | `{ subject, body, recipients[], startTime, delayBetweenEmails, hourlyLimit, senderEmail? }` | Schedule N emails |
| GET | `/api/emails/scheduled` | `?page&limit` | List scheduled/rate-limited emails |
| GET | `/api/emails/sent` | `?page&limit` | List sent/failed emails |
| GET | `/api/emails/search` | `?q` | Elasticsearch full-text search |
| GET | `/api/emails/stats` | – | Counts (total, scheduled, sent, failed) |
| DELETE | `/api/emails/:id` | – | Cancel a scheduled email |

### Slack (JWT required)
| Method | Route | Description |
|---|---|---|
| GET | `/api/slack/connect` | Returns Slack authorize URL |
| POST | `/api/slack/callback` | `{ code }` → store token |
| GET | `/api/slack/status` | Whether Slack is connected |
| DELETE | `/api/slack/disconnect` | Remove connection |

### Queue (JWT required)
| Method | Route | Description |
|---|---|---|
| GET | `/api/queue/stats` | BullMQ live counts |

---

## 🧪 Behavior Under Load (1000+ emails)
- 1000 emails → 1000 Postgres rows + 1000 BullMQ delayed jobs, spaced by the user-configured delay so they won't all fire at once.
- The worker drains them at `concurrency` per run and honors `MIN_DELAY_BETWEEN_EMAILS_MS` between sends.
- If the combined rate would exceed the hourly cap, the surplus jobs are **auto-rescheduled into the next hour window** instead of failing — so a 1000-email burst across an hour boundary completes without loss.
- Full blast is safe against Ethereal (no real volume), but the logic and Redis counters are scale-ready.

---

## 🔄 Restart Demo Scenario
1. Schedule 3 emails at `+2 minutes`.
2. Kill the server (`Ctrl+C`).
3. `npm run dev` again.
4. Watch the worker process the jobs 2 minutes later → they are **not** resent, **not** restarted from day 1; each fires exactly once at its `scheduledAt`.

---

## ✅ Requirements Checklist

**Backend**
- [x] TS + Express API
- [x] BullMQ + Redis scheduler (no cron — no `node-cron`, `agenda`, crontab)
- [x] PostgreSQL persistence (Prisma)
- [x] Ethereal SMTP sending (Nodemailer) with preview URLs
- [x] Survives restart — future emails still fire, none resent
- [x] Idempotency (unique keys + DB guards → no duplicate sends)
- [x] Configurable worker concurrency
- [x] Minimum delay between sends (default 2s)
- [x] Per-sender + global hourly rate limit via Redis counters (configurable)
- [x] Rate-limited jobs rescheduled to next window (never dropped)
- [x] Slack OAuth connect/disconnect + live notification on rate-limit hit
- [x] Elasticsearch indexing + search API

**Frontend**
- [x] Next.js + TypeScript + Tailwind
- [x] Real Google OAuth login, name/email/avatar in header, logout
- [x] Dashboard with stats + queue status
- [x] Compose modal: subject, body, sender email, CSV/TXT upload + email count, start time, delay, hourly limit
- [x] Scheduled table (loading + empty states, cancel)
- [x] Sent table (loading + empty states)
- [x] Search box backed by Elasticsearch
- [x] Reusable components, DRY, typed props/responses
- [x] Toast notifications, error handling

---

## 📄 Environment Variables (Backend `.env`)

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5432/email_scheduler` | Postgres DSN |
| `REDIS_HOST` / `REDIS_PORT` | `localhost` / `6379` | Redis connection |
| `ELASTICSEARCH_URL` | `http://localhost:9200` | Elasticsearch node |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | empty | Google OAuth |
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` | empty | Slack OAuth |
| `ETHEREAL_HOST/PORT/USER/PASS` | auto-generated | SMTP credentials |
| `MAX_EMAILS_PER_HOUR` | `200` | Global hourly cap |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | `50` | Per-sender hourly cap |
| `MIN_DELAY_BETWEEN_EMAILS_MS` | `2000` | Min delay between sends |
| `WORKER_CONCURRENCY` | `5` | Parallel jobs per worker |
| `PORT` | `4000` | API port |
| `FRONTEND_URL` | `http://localhost:3000` | Allowed CORS + OAuth redirect |
| `JWT_SECRET` | dev default | Token signing secret |

---

## 👥 Submission

- **Repository**: private GitHub repo (monorepo: `backend/`, `frontend/`, `docker-compose.yml`)
- **Access**: granted to `Mitrajit` and `Yadav036`
- **Demo video**: `docs/demo-video.mp4` (or placeholder note) — shows compose, scheduled/sent tables, restart scenario, and rate-limit behavior
- **Assumptions / shortcuts / trade-offs**: see *Architecture → Trade-offs* above

---

## 🐛 Troubleshooting

- **"Redis connection error"** → is `docker compose up -d` running Redis?
- **"Table X does not exist"** → run `npx prisma db push` in `backend/`.
- **Elasticsearch down** → emails still work; only search + indexing are degraded (errors logged, not fatal).
- **Google button not rendering** → set `NEXT_PUBLIC_GOOGLE_CLIENT_ID` in `frontend/.env.local` or use Developer Login.
- **Slack notification not sending** → create the Slack app + grant `chat:write`, then reconnect in dashboard.