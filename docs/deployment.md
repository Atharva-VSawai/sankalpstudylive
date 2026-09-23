# Deployment

This document describes how Sankalp is deployed in production. The production target is
**FastAPI + PostgreSQL/Supabase + Redis + LiveKit + Vercel/Railway**. The repository in
this sandbox runs on **Next.js 16 API routes + Prisma/SQLite** so the product is
demonstrable end-to-end without external services; the API contract and Prisma schema are
identical between the two runtimes (see `AGENTS.md` §4).

Related: `docs/architecture.md`, `docs/database.md`, `docs/security.md`,
`docs/mobile-contract.md`.

---

## 1. Components

| Component    | Production target                   | Sandbox runtime                          |
| ------------ | ---------------------------------- | ---------------------------------------- |
| Web SPA      | Vercel (Next.js 16)                | `bun run dev` (Next.js, port 3000)       |
| API          | Railway / Render / AWS ECS-Fargate (FastAPI) | Next.js API routes in the same process |
| Database     | Supabase Postgres (pooled via pgbouncer) | SQLite file `db/custom.db`           |
| Presence / cache | Upstash Redis or Redis Cloud     | In-memory `Map` in `src/lib/presence.ts` |
| Media SFU    | LiveKit Cloud                       | Simulated tokens (placeholder secret)   |
| File storage | Supabase Storage (avatars, room thumbnails) | Local `/public` (read-only)         |
| Email        | Resend (transactional)              | Disabled / logged to console            |
| Push (mobile) | FCM via Supabase (planned)           | Not yet                                  |
| Analytics    | PostHog Cloud                       | No-op in `trackEvent` helper             |
| Errors / perf | Sentry                              | Disabled in sandbox                      |
| CI/CD        | GitHub Actions                      | Manual                                   |
| Liveness     | UptimeRobot / BetterStack           | Manual                                   |

---

## 2. Frontend (Next.js 16 on Vercel)

### 2.1 Build

- `next build` produces `.next/standalone` (already enabled — see `package.json`
  `"build": "next build && cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/"`).
- Output is the standalone server, suitable for Vercel's Node.js runtime or a
  containerized deployment.
- The SPA lives on `/` only. The Next.js app exposes no SSG pages other than the
  landing route; everything else is a hash-based client route.

### 2.2 Environment variables

Set these in the Vercel project settings (Project → Settings → Environment Variables).
Mark the server-only ones as "Server-only" so they are not inlined into the browser
bundle.

Public (exposed to the browser):

| Variable                          | Purpose                                            |
| --------------------------------- | -------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`        | Supabase project URL                                |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY`   | Supabase anon key (safe to ship to client)         |
| `NEXT_PUBLIC_POSTHOG_KEY`         | PostHog project public key                         |
| `NEXT_PUBLIC_POSTHOG_HOST`        | PostHog host (Cloud or self-hosted)                |
| `NEXT_PUBLIC_LIVEKIT_URL`         | LiveKit Cloud wss URL, e.g. `wss://sankalp.livekit.cloud` |
| `NEXT_PUBLIC_SENTRY_DSN`          | Sentry DSN for web errors                          |
| `NEXT_PUBLIC_RELEASE_TAG`        | Git SHA, set by CI for release tagging              |

Server-only (Vercel → "Server-only"):

| Variable                  | Purpose                                                       |
| ------------------------- | ------------------------------------------------------------- |
| `DATABASE_URL`            | Postgres pooled connection string (Supabase pgbouncer, port 6543) |
| `DIRECT_URL`              | Postgres direct connection (Supabase, port 5432) — used by Prisma migrations only |
| `REDIS_URL`               | Redis connection string                                        |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only; used to write Storage objects, manage users     |
| `LIVEKIT_API_KEY`         | LiveKit Cloud API key                                          |
| `LIVEKIT_API_SECRET`      | LiveKit Cloud secret (server-only, never shipped to client)    |
| `LIVEKIT_URL`             | Same as `NEXT_PUBLIC_LIVEKIT_URL`; used by the token route     |
| `POSTHOG_KEY`             | PostHog project secret key (server-side capture)              |
| `SENTRY_DSN`              | API-side Sentry DSN                                            |
| `RESEND_API_KEY`           | Resend API key for transactional email                         |
| `SESSION_SECRET`          | 32+ byte random secret for signing session tokens (sandbox only — production uses Supabase Auth JWT) |
| `REVALIDATE_SECRET`        | Optional; protects on-demand ISR endpoints                      |

### 2.3 Vercel settings

- Framework preset: Next.js.
- Node version: 20 (Next.js 16 minimum).
- Build command: `bun run build`.
- Output directory: `.next/standalone` (handled by the Vercel Next.js preset).
- Region: `bom1` (Mumbai) — closest to the India user base.
- Function timeout: 60s (the SSE stream route `/api/rooms/[id]/events` needs the max).
- Edge functions are NOT used because the SSE stream relies on a long-lived Node runtime.

---

## 3. Backend (FastAPI)

The FastAPI service is the production equivalent of the Next.js API routes in this
sandbox. Deploy on Railway, Render, or AWS ECS/Fargate. Railway is the recommended path
for the first 6 months because it handles autoscaling, TLS, and preview environments.

### 3.1 Runtime

- `uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4 --proxy-headers --forwarded-allow-ips='*'`
- Behind a load balancer (Railway does this automatically; ECS uses an ALB).
- 4 workers per container is the starting point; scale horizontally as concurrency grows.
- Python 3.12.

### 3.2 Environment

| Variable                  | Purpose                                                       |
| ------------------------- | ------------------------------------------------------------- |
| `DATABASE_URL`            | Postgres pooled connection string (pgbouncer, port 6543)     |
| `REDIS_URL`               | Redis connection string                                        |
| `SUPABASE_URL`            | Supabase project URL                                           |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only; Storage, user management                        |
| `SUPABASE_JWT_SECRET`     | Supabase JWT secret; used to verify the Bearer tokens issued by the Supabase Auth SDK on Android/web |
| `LIVEKIT_API_KEY`         | LiveKit Cloud API key                                          |
| `LIVEKIT_API_SECRET`      | LiveKit Cloud secret                                           |
| `LIVEKIT_URL`             | `wss://sankalp.livekit.cloud`                                  |
| `POSTHOG_KEY`             | PostHog server secret key                                      |
| `POSTHOG_HOST`            | PostHog host                                                   |
| `SENTRY_DSN`              | Sentry DSN                                                     |
| `RESEND_API_KEY`           | Resend API key                                                 |
| `SESSION_SECRET`          | Used only by the sandbox fallback session signer — production uses Supabase JWTs |
| `RELEASE_TAG`             | Git SHA (set by CI)                                            |
| `RATELIMIT_REDIS_URL`     | Optional; if absent, in-process rate limiting falls back to a per-worker counter (works for single-container only) |

### 3.3 Health and readiness

- `GET /api/health` returns `{ status: "ok", service: "sankalp-api", time: ... }`.
- Railway / ALB probe `/api/health` every 30s; the container is considered healthy on
  3 consecutive 200s.
- A `/api/ready` route (planned) will additionally ping Postgres and Redis before
  returning 200; this is what the LB should probe for readiness so a freshly-deployed
  container does not receive traffic until its deps are up.

### 3.4 Connection pooling

- The app uses Supabase's pooled connection (pgbouncer on port 6543) for runtime queries
  with a pool size of 10–20 per worker.
- Migrations and `prisma db push` use the **direct** connection on port 5432 (pgbouncer
  does not support `ALTER TYPE` / `CREATE SCHEMA` etc. needed by Prisma migrate).
- Set `?pgbouncer=true&connection_limit=1` on `DATABASE_URL` when using Prisma against
  pgbouncer.

---

## 4. Database — Supabase Postgres

### 4.1 Provisioning

- Create a Supabase project in the Mumbai (`ap-south-1`) region.
- Use the same project for both web and Android (per `AGENTS.md` — never a second
  Supabase project).
- Note the pooled connection string (port 6543) and the direct connection string
  (port 5432).

### 4.2 Schema management

- The Prisma schema (`prisma/schema.prisma`) is the single source of truth.
- In production, the `datasource` block is swapped from `sqlite` to `postgresql` and
  the `cuid()` defaults are kept (Prisma will generate cuids in Postgres too —
  optionally switch to `uuid()` for native UUIDs, which is recommended). See
  `docs/database.md` for the production DDL and the enum mapping.
- Run `bun run db:generate && bun run db:migrate deploy` in CI (see §8).
- Sandbox uses `bun run db:push --accept-data-loss` for fast iteration; this is NOT
  used in production.
- Use `supabase db push` only for non-destructive changes; destructive migrations go
  through `prisma migrate dev` → reviewed PR → `prisma migrate deploy`.

### 4.3 Row Level Security

- Enable RLS on every table. The FastAPI service-role key bypasses RLS; clients
  (web SPA, Android) use the anon key + the user's JWT and therefore hit RLS
  policies.
- Base RLS policies:
  - `Users` can `SELECT`/`UPDATE` their own row.
  - `Profiles` are `SELECT`-able by anyone; `UPDATE` only by owner.
  - `StudySession`, `DailyGoal`, `Streak`, `Notification`, `UserBadge` — owner-only
    `SELECT`/`UPDATE`.
  - `RoomMessage`, `RoomMember`, `Friendship`, `Block`, `Report` — row-level
    policies written per the access patterns documented in
    `docs/security.md`.
- The API server (FastAPI) uses the service role and therefore performs authorization
  itself, mirroring the same rules in code. RLS is a defense-in-depth backstop.

### 4.4 Backups

- Supabase daily backups + PITR (point-in-time recovery) for 7 days. Upgrade to 30-day
  PITR once on a paid plan.
- Export weekly logical backups to S3 as a tertiary copy.

---

## 5. Redis — Upstash or Redis Cloud

### 5.1 Usage

- **Presence**: a HASH per room (`room:{id}:presence`) keyed by `userId` with the
  presence participant as JSON value. TTL 60s on each key; refreshed by the 20s
  heartbeat POST.
- **Pub/sub**: channel `room:{id}:events` for `presence`, `message`, `timer`
  broadcasts. API workers subscribe on demand for SSE clients.
- **Rate limits**: token-bucket counters in `ratelimit:{ip}:{action}` with a TTL.
- **Leaderboard cache**: a sorted set `leaderboard:{scope}:{period}` updated by a
  background job every 60s.
- **Session→user lookup** (sandbox only): in production this is replaced by Supabase
  JWT verification, so Redis is not used for sessions.

### 5.2 Sizing

- Start with Upstash Pay-as-you-go (1 GB, 10k commands/day free tier covers the
  first few hundred users).
- Migrate to a dedicated instance once >100 concurrent rooms; presence + pubsub
  dominates the load.
- Eviction policy: `noeviction` — presence keys have a TTL but the data is critical
  while live; never evict arbitrarily.

---

## 6. LiveKit Cloud

### 6.1 Project setup

- Create a LiveKit Cloud project in the same region as the API (Mumbai if available;
  Singapore otherwise).
- Copy the API key and secret into `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` server-side.
- Set `LIVEKIT_URL` and `NEXT_PUBLIC_LIVEKIT_URL` to the project's wss URL.

### 6.2 CORS and origins

- Whitelist `https://sankalp.in` (and `https://*.sankalp.in` preview domains) in the
  LiveKit project's "Allowed origins".
- The Android app does not need CORS (it is not a browser client).

### 6.3 TLS

- LiveKit Cloud terminates WebRTC over TLS — there is nothing to configure. The wss
  signaling URL is already HTTPS. Media (SRTP/DTLS) is encrypted end-to-end between
  client and SFU.

### 6.4 Egress (planned)

- Recording (room-wide VOD) and streaming (RTMP to YouTube) use LiveKit's Egress
  service. Enable when product needs it; budget ~$0.10/min for recordings stored in
  Supabase Storage.

---

## 7. Storage — Supabase Storage

### 7.1 Buckets

| Bucket             | Visibility | Auth policy                                           |
| ------------------ | ---------- | ---------------------------------------------------- |
| `avatars`          | Public read | Authenticated write. Up to 1 MB; PNG/JPG/WebP.       |
| `room-thumbnails`  | Public read | Authenticated write. Up to 2 MB.                      |
| `attachments`      | Public read | Authenticated write. Up to 10 MB.                    |
| `exports`          | Private    | Server-only write; signed-URL read.                    |

### 7.2 Upload flow (production)

- The client requests a short-lived upload URL from the API:
  `POST /api/uploads/sign { bucket, path, contentType }` (planned).
- The API returns a Supabase Storage signed URL (1 minute TTL).
- The client PUTs the file directly to Supabase Storage — the bytes never traverse
  the FastAPI worker.

The sandbox does not implement this; the web SPA uses a placeholder avatar URL.

---

## 8. CI/CD — GitHub Actions

Two workflows live in `.github/workflows/`:

### 8.1 `ci.yml` — runs on every push and PR

```yaml
jobs:
  lint-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install --frozen-lockfile
      - run: bun run lint
      - run: bun run db:generate
      - run: bun x tsc --noEmit

  web-deploy:
    if: github.ref == 'refs/heads/main'
    needs: lint-typecheck
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-args: '--prod'
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
```

### 8.2 `migrate.yml` — gated migration

```yaml
jobs:
  migrate:
    runs-on: ubuntu-latest
    environment: production-migrations   # required reviewer: dev-lead
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install --frozen-lockfile
      - run: bunx prisma migrate deploy
        env:
          DATABASE_URL: ${{ secrets.DIRECT_DATABASE_URL }}   # direct, not pooled
```

- Migrations require a manual approval from the `dev-lead` team in the
  `production-migrations` GitHub environment.
- API deploys to Railway happen on a `railway up` after the migration job succeeds.
- Vercel preview deployments are created automatically for PRs; each PR has its
  own preview URL with its own Postgres branch (Supabase branching).

---

## 9. Email — Resend

### 9.1 Transactional emails

- Welcome email on `signup_completed` (idempotent: only on the first verified login).
- Friend request received → email to the recipient if they have email notifications on.
- Friend request accepted → email to the sender.
- Weekly streak summary (Mondays 9 AM IST) → users with `streak.current >= 3` in the
  past week.
- Password reset / OTP emails (Supabase Auth handles the OTP; Resend handles the
  template).
- Subscription receipt (Razorpay webhook → `payment_succeeded` → email).

### 9.2 Setup

- Verify the `sankalp.in` domain in Resend. Add the DKIM and SPF records to DNS.
- Use Resend's React email templates (`@react-email/components`).
- API sends via `resend.emails.send({ from: "Sankalp <no-reply@sankalp.in>", to, subject, react })`.
- Emails are never sent to unverified addresses; the welcome email waits for
  `User.emailVerifiedAt`.

---

## 10. Monitoring

### 10.1 Sentry

- Errors and performance (traces sample rate 10%).
- Release tagging: every deploy sets the Sentry release to the git SHA. Source maps
  are uploaded by CI (`sentry-cli sourcemaps upload`).
- Alert routing:
  - `P0` (5xx spike) → PagerDuty → on-call.
  - `P1` (new error in latest release) → Slack `#sankalp-alerts`.

### 10.2 PostHog

- Product analytics dashboards (see `docs/analytics.md` §9).
- Alerting on the funnel breakage and payment success rate.

### 10.3 Uptime / liveness

- UptimeRobot or BetterStack pings `GET /api/health` every 60s from a Mumbai probe
  and a Singapore probe.
- Alerts Slack `#sankalp-alerts` on the first failure.
- Status page at `https://status.sankalp.in` (BetterStack-hosted).

### 10.4 App metrics

- API exposes Prometheus metrics at `GET /metrics` (planned): request count, latency
  histogram, in-flight requests, DB pool wait time, Redis round-trip time, LiveKit
  token mint count.
- Scraped by a Grafana Cloud agent or self-hosted Prometheus.

---

## 11. Scaling notes (architectural, not load-tested)

The numbers below are planning estimates, not verified. They have not been load-tested.

- **API**: horizontal scale behind the ALB; 4 workers per 1 vCPU / 1 GB container.
  Expect ~200 RPS per container at the median payload size; scale on `CPU > 70%` or
  `p95 latency > 500ms`. The expensive paths are the leaderboard aggregation and
  `/api/rooms/{id}/events` (one long-lived connection per participant — budget one
  connection per active SSE client; a 1 GB container holds ~2k idle SSE
  connections).
- **Database**: a single Supabase Postgres instance (4 vCPU / 16 GB) covers up to ~10k
  monthly active users. Add a read replica for the leaderboard queries once the
  `StudySession` table crosses ~10M rows.
- **Redis**: presence is the hot path. A single Upstash instance handles ~1k
  presence writes/s. Add a Redis Cluster when concurrent live rooms cross ~500.
- **LiveKit Cloud**: handles media fan-out autonomously. Pick a plan that supports
  the target concurrent participant count (Pro tier covers 200 concurrent
  participants; scale plan as DAU grows).
- **Connection pooling is mandatory.** Each API worker must use pgbouncer, not
  open one connection per request. Prisma's connection pool size should be ≤
  `(worker_count * 10)`.
- **Statelessness.** All API workers are interchangeable. Presence and chat are in
  Redis, so any worker can serve any SSE client — the LB uses least-connections
  routing.
- **WebRTC media does NOT pass through Sankalp infrastructure.** It goes client →
  LiveKit Cloud → client. The Sankalp API only mints tokens and records metadata.

---

## 12. Sandbox note

This repository runs **Next.js API routes + Prisma/SQLite** so the demo is
self-contained:

- The whole app is a SPA on the `/` route, served by `bun run dev` (or `bun run
  build` + `bun run start`).
- All APIs under `/api/*` are implemented as Next.js route handlers and behave
  identically to the documented FastAPI production contract.
- The Prisma schema is configured for `sqlite` in the sandbox; the same schema
  deploys to Postgres in production by changing the `datasource` provider and
  re-running `prisma migrate`.
- Presence and the in-room chat / timer live in `src/lib/presence.ts`, an
  in-memory `Map`. Restarting the dev server clears ephemeral state (which is
  acceptable for the demo). In production this is Redis.

Deploying to production swaps the runtime per the above, keeping the same API
contract (see `docs/mobile-contract.md`) and the same Prisma schema (pointed at
Supabase Postgres). The Android app is unaffected by the swap — it consumes the
documented REST + LiveKit contract.

---

## 13. Mobile (future Android app)

The Android app reuses **this exact backend + database + LiveKit + Supabase Auth**.
It is built by a separate agent. The binding contract is in
`docs/mobile-contract.md`. The Android rule is restated in `AGENTS.md` §1 — never
duplicate the backend.

Operational concerns that affect Android:

- Android uses the **same** `POSTHOG_KEY` and `SENTRY_DSN` (the public ones) — keep
  these stable across releases.
- Android uses the **same** `LIVEKIT_URL` (wss). It is safe to ship in the APK.
- Android does **not** use `LIVEKIT_API_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`,
  `POSTHOG_KEY` (server one), or `SESSION_SECRET`. These remain server-only.
- Android release builds are tagged with the same git SHA as the API/web
  release so Sentry/PostHog correlations work across stacks.
