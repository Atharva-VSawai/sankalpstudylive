# Sankalp — Architecture

> Production target architecture and how the runnable sandbox maps to it.
> This document is binding for any future agent (including the Android agent — see `AGENTS.md`).

## 1. System diagram

```
                          ┌────────────────────────────────────────────┐
                          │              Clients                        │
                          │   Next.js Web SPA (Vercel)  •  Android (later)│
                          └───────────────┬────────────────────────────┘
                                          │ HTTPS  (Bearer JWT in header)
                                          ▼
                          ┌────────────────────────────────────────────┐
                          │         FastAPI  (Railway / Fly.io)          │
                          │   Modular monolith — single deployable       │
                          │   ┌──────┬──────┬──────┬──────┬──────┐       │
                          │   │ auth │ users│ comm │ rooms│study │ ...  │
                          │   └──────┴──────┴──────┴──────┴──────┘       │
                          │   Pydantic models • Zod-equivalent validation│
                          └────┬───────────────┬────────────────┬──────┘
                               │               │                │
                               │ persist       │ ephemeral       │ mint JWT
                               ▼               ▼                ▼
                  ┌──────────────────┐  ┌────────────────┐  ┌────────────────┐
                  │ PostgreSQL       │  │   Redis         │  │   LiveKit Cloud │
                  │ (Supabase)       │  │ presence, RL,   │  │  WebRTC SFU     │
                  │ + RLS + Storage  │  │ pub/sub, cache  │  │  audio/video    │
                  └──────────────────┘  └────────────────┘  └────────────────┘
                               │                                   ▲
                               │                                   │ token (6h TTL)
                               └───── Supabase Auth (JWT) ──────────┘
                                         ▲
                                         │
                  ┌──────────────────────┴───────────────────────┐
                  │  External services                            │
                  │  PostHog (product analytics)                  │
                  │  Sentry (error tracking)                      │
                  │  Resend (transactional email)                  │
                  │  Razorpay (INR payments, server-side webhook) │
                  └──────────────────────────────────────────────┘
```

Data flow at a glance:
- A client obtains a **Supabase Auth JWT** (email/password or Google OAuth) and sends it as `Authorization: Bearer <jwt>` on every request.
- **FastAPI** verifies the JWT against Supabase's published JWKs, loads the user, and runs the request through module routers.
- Persistent state is written to **PostgreSQL** (Supabase) with Row-Level Security policies; ephemeral state (presence, rate-limit buckets, hot leaderboards, pub/sub) lives in **Redis**.
- For real-time audio/video, the client asks FastAPI for a LiveKit token, then connects directly to **LiveKit Cloud** over WebRTC.

## 2. Modular monolith (not microservices)

Sankalp is intentionally a **modular monolith**. Each module is a Python package (or, in the sandbox, a Next.js route subtree) with its own router, schemas, and persistence boundary, but they share one process, one database, and one deployable. This keeps operational complexity low at our scale (see §6) while preserving seams along which we can extract a service later if a module needs independent scaling.

Modules:

| Module             | Responsibility                                                              | Sandbox route prefix        |
| ------------------ | --------------------------------------------------------------------------- | --------------------------- |
| `auth`             | Signup, login, Google OAuth, session minting, role checks                  | `/api/auth/*`               |
| `users/profiles`   | Profile CRUD, search, avatars (Supabase Storage), timezone                  | `/api/profile`, `/api/onboarding`, `/api/search/users` |
| `communities`      | Exam communities (GATE, JEE, NEET, …), join/leave, member counts            | `/api/communities/*`        |
| `rooms`            | Room lifecycle, LiveKit token minting, presence, chat, shared timer        | `/api/rooms/*`              |
| `study_engine`     | Session start/stop, server-computed duration/XP, streaks, daily goals, badges | `/api/study/*`              |
| `social`           | Friends, blocks, reports                                                    | `/api/friends`, `/api/blocks`, `/api/reports` |
| `moderation`       | Mod/admin queue, resolutions, audit log                                     | `/api/admin/*`              |
| `notifications`    | In-app notification feed + unread count                                     | `/api/notifications/*`      |
| `payments`         | Razorpay checkout + webhook → Subscription/Payment rows                     | `/api/subscriptions`        |
| `analytics`        | PostHog capture helpers (server-side)                                        | internal                    |
| `admin`            | Platform stats, user/role management, room/community admin                 | `/api/admin/*`              |

Modules communicate **only** via their public router functions and the database — never by reaching into another module's internals. The `study_engine` module is the sole writer of `StudySession.durationMin`, `Profile.totalXp`, `Streak.current`, and `UserBadge` rows.

## 3. Source-of-truth table

| Concern                          | Source of truth                                  | Notes                                                                                          |
| -------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| Persistent state                 | **PostgreSQL** (Supabase) — Prisma schema        | All entities in `prisma/schema.prisma` map 1:1 to PG tables.                                   |
| Ephemeral state                  | **Redis**                                         | Room presence, rate-limit buckets, session-token blacklist (revoked JWTs), pub/sub channels.    |
| Live media                       | **LiveKit Cloud** (WebRTC SFU)                   | Audio/video/screen share. Room name is `Room.livekitRoom`; tokens minted server-side.           |
| File storage (avatars, icons)    | **Supabase Storage**                              | Public-read bucket for avatars; signed URLs for any private assets.                            |
| Auth                             | **Supabase Auth** + Google OAuth                   | JWTs signed by Supabase; verified by FastAPI middleware.                                       |
| Product analytics                | **PostHog**                                        | Server-side capture for study events (anti-tampering).                                        |
| Error tracking                   | **Sentry**                                         | Both server (FastAPI) and client (web/Android SDKs).                                           |
| Transactional email              | **Resend**                                         | Welcome, password-reset, subscription receipts.                                              |
| Payments                         | **Razorpay** (INR)                                | Server-side checkout + webhook; never trust client-reported payment success.                  |

The sandbox replaces Redis with an in-memory store (`src/lib/presence.ts`, `src/lib/ratelimit.ts`), LiveKit Cloud with a JWT-format-compatible mock (`src/app/api/rooms/[id]/token/route.ts`), and Supabase Auth with a signed HMAC session token (`src/lib/auth.ts`). The contracts are identical so swapping the runtime does not affect the Android client.

## 4. Trust boundaries (non-negotiable)

Per `AGENTS.md §3`, the server is the **sole authority** for the following values:

- `StudySession.durationMin` — computed as `now() - startedAt` on `/api/study/sessions/[id]/stop`, capped at `MAX_SESSION_MIN = 8h`.
- `StudySession.xpEarned` — `durationMin * XP_PER_MINUTE` (= 10 XP/min).
- `Profile.totalXp`, `Profile.totalMinutes`, `Profile.level` — updated only by `awardXp()`.
- `Streak.current`, `Streak.longest`, `Streak.lastStudyDate` — updated only by `bumpStreak()` using the user's timezone.
- `DailyGoal.achievedMin`, `DailyGoal.completed` — updated only by `bumpDailyGoal()`.
- `UserBadge` rows — granted only by `evaluateBadges()`.
- `Payment.status` — set only by the Razorpay webhook handler, never by the client.
- `Report.status`, `Report.resolution` — set only by admins via `/api/admin/reports/[id]`.

A client that sends `durationMin`, `xp`, `streak`, or `level` in a request body is ignored — those fields are not on any incoming Pydantic / Zod schema. Any session that would yield `< 1` minute is **discarded** (no XP, no streak bump) to defeat "start + immediately stop" abuse.

Service-role keys (`SUPABASE_SERVICE_ROLE_KEY`), LiveKit API secrets (`LIVEKIT_API_SECRET`), and the session-signing secret (`SESSION_SECRET`) are **never** shipped to a client. They live in server environment variables only.

## 5. Caching strategy (Redis)

| Key pattern                             | Type       | TTL      | Writer                    | Reader                       | Invalidated by                |
| -------------------------------------- | ---------- | -------- | ------------------------- | ---------------------------- | ----------------------------- |
| `presence:room:{roomId}`               | HASH       | 45s      | heartbeat/join/leave      | presence GET, SSE broadcast  | reaper job / explicit leave   |
| `rl:{ip}:{action}`                     | sorted set | 60s      | rate-limit middleware     | same                         | natural expiry                 |
| `leaderboard:{scope}:{period}`          | string     | 60s      | leaderboard cron          | `/api/leaderboard` GET       | recompute on snapshot          |
| `session-blacklist:{jti}`              | string     | JWT exp  | logout / admin revoke     | auth middleware             | expiry (matches JWT lifetime) |
| `room:config:{roomId}`                 | string     | 5 min    | room update               | rooms GET                    | write-through on PATCH         |
| `pubsub:room:{roomId}`                | pub/sub    | n/a      | presence/timer/message    | SSE fan-out                  | n/a                            |

In the sandbox these are simulated by an in-memory `Map` (`src/lib/presence.ts`) and a `Set` of SSE listeners (`subscribe()` / `emit()`). The reaper runs lazily on every presence read (`reapStale(roomId, 45_000)`).

## 6. Performance target

These are **architectural targets**, not load-tested claims (no load test has been run — see `worklog.md` "Unresolved Risks"):

- 5,000 registered users
- ~1,000 DAU
- 200–500 concurrent app users
- 100+ concurrent video participants across all live rooms

Concrete techniques used to hit these targets:

- **Pagination everywhere**: list endpoints accept `page` + `limit` (capped, e.g. rooms ≤ 40, leaderboard ≤ 100) and return `{ page, limit, total }`. See `/api/rooms`, `/api/admin/users`, `/api/leaderboard`.
- **Indexes on hot paths**: see `docs/database.md` §3 — composite indexes on `room_members(room_id,user_id)`, `study_sessions(user_id, started_at)`, `room_messages(room_id, created_at)`, `notifications(user_id, read)`, `leaderboard_snapshots(scope, period, captured_at)`.
- **Redis caching**: leaderboard snapshots and room config are cached with short TTLs (see §5). The leaderboard endpoint aggregates `study_sessions` in SQL — production snapshots precompute this every minute so the API just reads the snapshot table.
- **Connection pooling**: FastAPI uses an async SQLAlchemy pool (or Prisma's pool in the sandbox) sized for the worker count; Supabase's PgBouncer is enabled in transaction mode.
- **Lazy loading + code splitting**: the SPA route-splits on hash change (`#/login`, `#/rooms/123`, `#/admin`, …) so the landing bundle stays small.
- **Optimized queries**: every list query uses `select` (not `include *`) and batches secondary lookups (e.g. leaderboard batches a single `findMany` for all profile rows by `userId IN (...)` rather than N+1).
- **SSE, not polling**: room events stream over a single `GET /api/rooms/[id]/events` connection instead of long-polling presence.
- **Capped history**: in-memory message buffer holds the last 200 messages per room; persisted `RoomMessage` rows are trimmed by a background job in production.

## 7. Environment variables contract

Names only — values are provisioned in the deployment environment, never committed.

| Name                          | Used by          | Notes                                                                                  |
| ----------------------------- | ---------------- | -------------------------------------------------------------------------------------- |
| `DATABASE_URL`                | Prisma / SQLAlchemy | PG connection string `postgresql://...`. Sandbox: `file:./db/custom.db` (SQLite).    |
| `SUPABASE_URL`                | server            | Supabase project base URL.                                                              |
| `SUPABASE_ANON_KEY`           | client + server   | Public-safe key; subject to RLS. May be shipped to the web/Android client.             |
| `SUPABASE_SERVICE_ROLE_KEY`   | server only       | Bypasses RLS. **Never** shipped to a client.                                             |
| `LIVEKIT_URL`                 | server + client   | `wss://<project>.livekit.cloud` — handed to the LiveKit client SDK.                    |
| `LIVEKIT_API_KEY`             | server only       | Used as the JWT `iss` when minting room tokens.                                         |
| `LIVEKIT_API_SECRET`          | server only       | HS256 signing key for room tokens.                                                      |
| `REDIS_URL`                   | server            | `redis://...` for presence, rate limits, blacklist.                                     |
| `POSTHOG_KEY`                 | server            | Server-side project key for analytics capture.                                          |
| `SENTRY_DSN`                  | server + client   | Per-environment DSN. Client DSN is public-safe (rate-limited by Sentry).                |
| `RESEND_API_KEY`              | server            | For transactional email.                                                                |
| `SESSION_SECRET`              | server only       | Sandbox HMAC signing secret for the signed session token (see `docs/authentication.md`). |

## 8. Sandbox ↔ production mapping

| Concern                  | Sandbox                                            | Production                                          |
| ------------------------ | -------------------------------------------------- | --------------------------------------------------- |
| HTTP API                 | Next.js 16 API routes (`src/app/api/**`)           | FastAPI routers                                     |
| ORM / DB                 | Prisma + SQLite (`db/custom.db`)                   | Prisma (or SQLAlchemy) + PostgreSQL/Supabase        |
| IDs                      | `cuid()`                                           | UUID `gen_random_uuid()`                            |
| Enums                    | `String` columns + API validation                  | Native PG `enum` types                              |
| Timestamps               | `DateTime` (SQLite TEXT, stored ISO)               | `timestamptz`                                       |
| Arrays / JSON            | `String` holding JSON, parsed in code             | `jsonb` / native arrays                             |
| Presence                 | in-memory `Map` in `src/lib/presence.ts`           | Redis HASH + pub/sub                                |
| Rate limiting            | in-memory sliding window `src/lib/ratelimit.ts`    | Redis token bucket                                  |
| Auth                     | signed HMAC session token (`src/lib/auth.ts`)      | Supabase Auth JWT (verified via JWK)                |
| Google OAuth             | `POST /api/auth/google-demo` (issues same token)   | Supabase Google provider → JWT after redirect       |
| LiveKit                  | mock JWT-format token signed with placeholder secret | `livekit-server-sdk` with real `LIVEKIT_API_KEY/SECRET` |
| Email                    | no-op (welcome only)                               | Resend                                              |
| Payments                 | `POST /api/subscriptions` writes a "paid" row directly | Razorpay checkout → server webhook → `Payment` row  |
| Analytics                | `trackEvent()` is a no-op                          | `posthog.capture()` server-side                     |
| File storage             | inline data URLs                                   | Supabase Storage public-read bucket                 |
| Audit log                | `AuditLog` table (sandbox writes it)               | `AuditLog` table + Sentry breadcrumb                |

The API surface, schema, enums, and request/response shapes are **identical** between the two columns. The Android client (built later by a different agent) targets the production column and consumes the same routes documented in `docs/api.md`.
