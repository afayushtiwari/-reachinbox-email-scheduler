# ReachInbox Email Scheduler

A production-grade **email job scheduler + dashboard** built as a full-stack TypeScript monorepo. Schedule emails at scale with BullMQ + Redis (no cron), send through your choice of provider (SMTP, Mailtrap, SendGrid, Resend), persist all state in PostgreSQL, make emails searchable via Elasticsearch, and manage everything from a clean Next.js dashboard with real Google login and Slack notifications.

---

## Table of Contents

- [What it does](#what-it-does)
- [What has been built](#what-has-been-built)
- [Recent security hardening](#recent-security-hardening)
- [Feature roadmap](#feature-roadmap)
- [Technologies used](#technologies-used)
- [Architecture](#architecture)
- [Quick start](#quick-start)
- [Environment variables](#environment-variables)
- [Mail providers](#mail-providers)
- [API reference](#api-reference)
- [How it helps](#how-it-helps)

---

## What it does

1. **Schedule** campaign emails (arbitrary recipients, subject, body, start time, per-recipient delay, hourly cap) from a compose modal, CSV/TXT upload, or the REST API.
2. **Queue** each recipient as a BullMQ delayed job (no cron anywhere) so emails fire exactly at their stored `scheduledAt`.
3. **Send** them through your configured provider with rate limiting per sender + globally, min-gap between sends, and infinite auto-reschedule across hour windows instead of hard failures.
4. **Persist** every job in PostgreSQL; on restart, jobs are recovered and re-enqueued — nothing is lost and nothing is double-sent (idempotency keys + DB state guards).
5. **Search and monitor** sent/scheduled emails via Elasticsearch and a live BullMQ queue dashboard.

---

## What has been built

### Backend (`backend/`)
- Express + TypeScript REST API (auth, emails, Slack, queue stats, search).
- **BullMQ + Redis scheduler** — delayed jobs, QueueScheduler, worker with configurable concurrency.
- **PostgreSQL via Prisma** — `EmailJob` persistence, restart recovery (`recoverOrphanedJobs`), idempotency.
- **Redis-backed rate limiting** — global + per-sender hourly counters, min-delay enforcement.
- **Mail provider abstraction** — pluggable senders: SMTP/Ethereal, Mailtrap HTTP API, SendGrid HTTP API, Resend HTTP API (auto-detect or explicit `MAIL_PROVIDER`).
- **Elasticsearch ingestion + full-text search** for scheduled/sent emails.
- **Slack OAuth + notifications** on rate-limit events.
- **Google OAuth (server-side)** — ID token verification via `google-auth-library`, JWT issuance.
- **Outbound connectivity probe** at boot for hosted-deploy debugging.

### Frontend (`frontend/`)
- Next.js 14 + Tailwind + TypeScript.
- **Google Login** (Google Identity Services) with name/avatar/logout; Developer Login fallback for dev.
- **Dashboard** — stats cards, live queue status, Slack connect panel.
- **Compose modal** — CSV/TXT upload with email detection + count, start time, per-recipient delay, hourly limit.
- **Scheduled & Sent tables** — pagination, cancel scheduled jobs, loading/empty states.
- **Search box** — Elasticsearch-backed, works on both tables.
- Error handling via toasts, reusable typed components.

---

## Recent security hardening

> Applied during the Google Cloud Trust & Safety alert (exposed OAuth client secret).

- **Rotated the Google OAuth client** — old client deleted, fresh client (ID `6590...-5799lqskf...`) created; the leaked `GOOGLE_CLIENT_SECRET` is inactive.
- **Scrubbed the secret from git history** — rewrote the full git history with `filter-branch` + force-pushed, then purged reflogs/GC so the secret value no longer exists in any reachable commit.
- **`render.yaml` hardened** — real values never live in the repo; `sync: false` env vars with empty values are set in the Render dashboard instead. `NEXT_PUBLIC_GOOGLE_CLIENT_ID` added so builds always bake the correct client ID.
- **Credentials policy enforced** —
  - Committed: `render.yaml` (public config + public client ID), `.env.example` (placeholders only), Dockerfile, infra config.
  - Never committed: `backend/.env`, secrets (`GOCSPX-*`, API keys) — Render dashboard + local `.env` only.
- **`.gitignore`** excludes `.env` / `.env.local` / `.env.production`.

### Why this matters
An OAuth client secret found in a public repo lets anyone impersonate your app's Google login. The client ID, by design, is public (it is sent to the browser on every OAuth request) — it is safe to commit. Secrets are not.

---

## Feature roadmap

Suggested order of attack to take this from assignment to product:

1. **Mail provider abstraction** — done. SendGrid/Resend/SMTP/Mailtrap behind one interface.
2. **Sender authentication & deliverability** — currently sending from a free address without domain auth, so recipients may get mail in Spam. Fix: authenticate a real domain in SendGrid (add SPF/DKIM/CNAME at the registrar), send from `noreply@yourdomain.com`, and warm up sender reputation before scaling volume.
3. **Templates + variables** (`{{firstName}}`, `{{link}}`) with react-email/MJML editor — makes it usable for marketing sends.
4. **Webhooks + REST API keys** — external eventing (scheduled/sent/failed) and programmatic scheduling.
5. **Workspaces/orgs with roles** — multi-tenant, sellable.
6. **Recurring schedules** — daily/weekly digests via repeatable BullMQ jobs (still no cron).
7. **Analytics** — open/click tracking pixel, best-time-to-send, deliverability reports.
8. **Auto-sequences / drips** and audience segments/tags.

---

## Technologies used

| Layer | Tech |
|---|---|
| Language | TypeScript throughout |
| Backend | Node.js, Express |
| Scheduler | BullMQ 4 + Redis (QueueScheduler, delayed jobs, workers) |
| Database | PostgreSQL 15, Prisma 5 ORM |
| Search | Elasticsearch 8 (official client) |
| Sending | Nodemailer (SMTP/Ethereal), HTTP adapters for Mailtrap / SendGrid / Resend |
| Auth | Google Auth Platform (OAuth client + ID token verify), JWT (jsonwebtoken) |
| Integrations | Slack OAuth, Slack `chat.postMessage` |
| Frontend | Next.js 14 (App Router), React 18, Tailwind CSS, react-hot-toast |
| Queue dashboards | Internal `/api/queue/stats` (BullMQ live counts) |
| Deploy | Render (web service, static frontend export served by Express), Docker Compose for local infra |

---

## Architecture

```
┌──────────────────┐       ┌──────────────────────────────────────┐
│  Next.js App     │  API  │  Express.js Backend                 │
│  (Google OAuth,  │──────▶│  /api/auth/*   /api/emails/*         │
│   dashboard,     │       │  /api/slack/*  /api/queue/stats      │
│   compose)       │       │  ┌────────────▼─────────────────┐    │
└──────────────────┘       │  │ mail provider abstraction     │    │
                           │  │ smtp | mailtrap | sendgrid |  │    │
                           │  │ resend                       │    │
                           │  └────────────┬──────────────────┘    │
                           │        ┌──────▼──────┐   ┌─────────┐  │
                           │        │  PostgreSQL │   │ Elastic │  │
                           │        │  (Prisma)   │   │ search  │  │
                           │        └──────┬──────┘   └────┬────┘  │
                           │        ┌──────▼──────────┐    │       │
                           │        │ BullMQ + Redis  │────┘       │
                           │        │ (delayed queue) │            │
                           │        └──────┬──────────┘            │
                           │        ┌──────▼──────┐   ┌─────────┐  │
                           │        │   Worker    │──▶│  Slack  │  │
                           │        └─────────────┘   └─────────┘  │
└────────────────────────────────────────────────────────────────────┘
```

**How scheduling works**
1. `POST /api/emails/schedule` receives subject, body, recipients, start time, delay, hourly limit.
2. Each recipient becomes an `EmailJob` row in Postgres (status `scheduled`, unique `idempotencyKey`).
3. Each row is enqueued as a BullMQ **delayed job** with `delay = scheduledAt - now`.
4. The **QueueScheduler** promotes delayed jobs to the waiting queue at the right instant.
5. The **Worker** picks the job → checks rate limits (Redis counters) → sends via the selected provider → updates DB + Elasticsearch.
6. **Restart-safe**: `recoverOrphanedJobs()` re-enqueues `scheduled`/`rate_limited` jobs that lost their Redis presence; worker checks DB state so nothing is sent twice.

---

## Quick start

### Prerequisites
- Node.js 18+ and npm
- Docker Desktop (for Postgres, Redis, Elasticsearch)

### 1. Infrastructure
```bash
docker compose up -d
```

### 2. Backend
```bash
cd backend
npm install
cp .env.example .env     # then fill in real values (Google OAuth, provider keys)
npx prisma db push       # creates tables
npx prisma generate
npm run dev              # API + scheduler + worker in one process
```

### 3. Frontend
```bash
cd frontend
npm install
cp .env.local.example .env.local
npm run dev              # http://localhost:3000
```

Then open http://localhost:3000 and sign in with Google.

### Deploying on Render
`render.yaml` at the repo root defines the web service (build: frontend static export + backend build; start: `node dist/index.js`). Sensitive env vars are `sync: false` with empty values — set them in the Render dashboard (**Environment** tab) and deploy:

| Dashboard variable | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | your `.apps.googleusercontent.com` client ID |
| `GOOGLE_CLIENT_SECRET` | your OAuth secret |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | same client ID (baked at build — after changing, "Clear build cache & deploy") |
| `JWT_SECRET` | long random string |
| `DATABASE_URL` | managed Postgres DSN |
| `REDIS_URL` | managed/TLS Redis URL |
| `MAIL_PROVIDER` + provider key | e.g. `sendgrid` + `SENDGRID_API_KEY` |

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `4000` | API port |
| `FRONTEND_URL` | `http://localhost:3000` | CORS + OAuth origin |
| `JWT_SECRET` | dev default | Token signing secret |
| `DATABASE_URL` | local postgres | Prisma DSN |
| `REDIS_HOST` / `REDIS_PORT` | `localhost` / `6379` | Redis (or `REDIS_URL` for TLS) |
| `ELASTICSEARCH_URL` | `http://localhost:9200` | ES node |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | empty | Google OAuth (backend) |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | — | Google OAuth (frontend, baked at build) |
| `SLACK_CLIENT_ID` / `SLACK_CLIENT_SECRET` | empty | Slack OAuth |
| `MAIL_PROVIDER` | auto | `smtp | mailtrap | sendgrid | resend` |
| `DEFAULT_FROM_EMAIL` | empty | From address used when scheduling omits a sender (use an authenticated domain) |
| `ETHEREAL_HOST/PORT/USER/PASS` | auto-generated | SMTP/Ethereal credentials |
| `MAILTRAP_API_TOKEN` / `MAILTRAP_SANDBOX_ID` | empty | Mailtrap HTTP API |
| `SENDGRID_API_KEY` | empty | SendGrid HTTP API |
| `RESEND_API_KEY` | empty | Resend HTTP API |
| `MAX_EMAILS_PER_HOUR` | `200` | Global hourly cap |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | `50` | Per-sender hourly cap |
| `MIN_DELAY_BETWEEN_EMAILS_MS` | `2000` | Min gap between sends |
| `WORKER_CONCURRENCY` | `5` | Parallel jobs per worker |

---

## Mail providers

Out of the box the service can send through four providers behind one `sendEmail()` facade:

| Provider | Config | Why use it |
|---|---|---|
| **smtp** (Ethereal) | `ETHEREAL_*` or any SMTP | Dev/testing; Ethereal auto-creates a preview account |
| **mailtrap** | `MAILTRAP_API_TOKEN` + `MAILTRAP_SANDBOX_ID` | Safe inbox testing in a hosted env (HTTP, no outbound SMTP needed) |
| **sendgrid** | `SENDGRID_API_KEY` | Real transactional delivery |
| **resend** | `RESEND_API_KEY` | Real transactional delivery (simple API) |

**Provider selection** — set `MAIL_PROVIDER` explicitly, otherwise auto-detect in order: SendGrid → Resend → Mailtrap → SMTP. Add a new provider by implementing one function:

```ts
type ProviderFn = (msg: EmailMessage) => Promise<SendResult>;
```

and registering it in the `providers` map in `backend/src/services/email.ts`.

---

## Sender authentication & deliverability

Emails sent through a real provider (SendGrid/Resend) only reach the **Inbox** if the "From" address is authenticated. Sending from a free address (`@gmail.com`) with no domain proof gets flagged as spam. To fix:

1. **Own a domain** (e.g. `yourdomain.com`) — any registrar works.
2. **Authenticate it** in SendGrid: **Settings → Sender Authentication → Authenticate Domain** and follow the DNS step. SendGrid will ask for 2–3 records — typically:
   - a **CNAME** record for link branding (e.g. `send. → u12345.wl.sendgrid.net`)
   - a **CNAME** for DKIM (e.g. `s1._domainkey → s1.domainkey.u12345.wl.sendgrid.net`)
   - (SPF is auto-managed once the CNAMEs resolve)
   Add these at your DNS provider, then click "Verify" in SendGrid (records can take up to 48h).
3. **Create a sender on that domain** in SendGrid and set it as the app default:
   ```
   DEFAULT_FROM_EMAIL=noreply@yourdomain.com
   MAIL_PROVIDER=sendgrid
   ```
   `DEFAULT_FROM_EMAIL` is used whenever the compose flow doesn't specify a sender (`backend/src/routes/emails.ts`).
4. **Re-send** from that address — mail lands in the Inbox with SPF/DKIM passed.

Warm-up: start with a handful of sends to your own addresses, open/reply/star them, and scale volume slowly over ~2 weeks to build sender reputation. Typical causes of continued spam-folder placement are an unauthenticated domain, a cold/new sender, or spammy content (links, "free", all-caps subject).

---

## API reference

### Auth
| Method | Route | Description |
|---|---|---|
| POST | `/api/auth/google` | Verify Google ID token, create/find user, return JWT |
| POST | `/api/auth/dev-login` | Dev-only login (disabled in production) |
| GET | `/api/auth/me` | Current user profile |

### Emails (JWT required)
| Method | Route | Description |
|---|---|---|
| POST | `/api/emails/schedule` | `{ subject, body, recipients[], startTime, delayBetweenEmails, hourlyLimit, senderEmail? }` |
| GET | `/api/emails/scheduled` | `?page&limit` |
| GET | `/api/emails/sent` | `?page&limit` |
| GET | `/api/emails/search` | `?q` (Elasticsearch) |
| GET | `/api/emails/stats` | total/scheduled/sent/failed counts |
| DELETE | `/api/emails/:id` | Cancel a scheduled email |

### Slack (JWT required)
| Method | Route | Description |
|---|---|---|
| GET | `/api/slack/connect` | Slack authorize URL |
| POST | `/api/slack/callback` | `{ code }` → store token |
| GET | `/api/slack/status` | Connected? |
| DELETE | `/api/slack/disconnect` | Remove connection |

### Queue (JWT required)
| Method | Route | Description |
|---|---|---|
| GET | `/api/queue/stats` | BullMQ live counts |

---

## How it helps

- **Shows production-grade engineering**: persistence + idempotency + queue-based scheduling (no cron), rate limiting, search, notifications.
- **Is deployable**: single-service Render config, static frontend export, health check, connectivity probe.
- **Is extensible**: the provider interface makes adding real transactional email (SendGrid/Resend/SES) a one-function change; auth/scoping and webhooks prepare it for multi-tenancy.
- **Is secure**: credentials policy is enforced (no secrets in git, dashboard-managed env vars), and the OAuth exposure was fully remediated.
- **Is verified**: unit + integration tests cover provider selection, rate limiting and the send facade, and GitHub Actions CI runs tests + builds on every push.

---

## Testing

Backend tests use [Vitest](https://vitest.dev) (no infrastructure required — Redis is mocked):

```bash
cd backend
npm test          # run once
npm run test:watch
```

What's covered:

| File | Covers |
|---|---|
| `tests/provider-selection.test.ts` | `selectProvider()` auto-detect + explicit override, priority order, smtp fallback |
| `tests/rate-limiter.test.ts` | global + per-sender hourly caps enforced with mocked Redis, counter rollback, window math |
| `tests/send-email.test.ts` | SendGrid/Resend adapters (success + error responses) and `sendEmail()` facade dispatch |

CI runs these plus both production builds on every push/PR (`.github/workflows/ci.yml`).

---

## Troubleshooting

- **"Redis connection error"** → is `docker compose up -d` running Redis?
- **"Table X does not exist"** → run `npx prisma db push` in `backend/`.
- **Elasticsearch down** → emails still work; only search + indexing degrade (logged, non-fatal).
- **Google button not rendering / `deleted_client`** → confirm `NEXT_PUBLIC_GOOGLE_CLIENT_ID` matches a live OAuth client, then rebuild the frontend (`next build` / "Clear build cache & deploy" on Render).
- **HTTP mail provider chosen but no key set** → set `MAIL_PROVIDER=smtp` or the provider's API key.