# Sankalp

> **Sankalp** — Sanskrit/Hindi for "commitment" or "resolve".
> *"Study with people preparing for the same goal."*

Sankalp is an India-focused virtual study platform. It hosts **communities** for the exams
Indian aspirants actually care about — GATE, JEE, NEET, UPSC, CAT, SSC, Banking, MPSC,
Placements, DSA, and General Study — and inside each community, members can spin up
**live study rooms** (LiveKit video/audio), run a **shared server-authoritative
Pomodoro timer**, and study together. Study duration, XP, streaks, and badges are
**all computed server-side** — the client never submits them. Around the study loop
there are friends, leaderboards, badges, daily goals, referrals, subscriptions
(Razorpay), moderation, and an admin console.

The whole product is a single-page app on the `/` route with hash-based client
routing (`#/login`, `#/rooms/123`, `#/admin`, …). The API lives under `/api/*`. A
future native Android app will consume the **exact same** API, database, Supabase
project, auth, and LiveKit project — see `AGENTS.md` §1 and
`docs/mobile-contract.md`.

---

## Features

- **Communities** — 11 seeded communities for the major Indian exams; join, leave, browse
  live rooms inside each.
- **Live study rooms** — host creates a room (max 20 participants by default, max 50);
  LiveKit video/audio with mic & camera both OFF on join by default; adaptive streaming
  so the client never renders more than one high-res tile at a time.
- **Shared Pomodoro timer** — server-authoritative focus/break timer; broadcast via SSE.
- **Study engine** — start a session, study, stop it; server computes duration, awards
  XP (10 XP/min), bumps streaks in the user's local timezone, updates the daily goal,
  and grants badges.
- **Streaks** — daily study streaks with a 6-hour grace window after local midnight.
- **Daily goals** — minutes-studied target per user per day; "achieved" indicator.
- **Badges** — `first_session`, `streak_7`, `streak_30`, `streak_100`, `night_owl`,
  `early_bird`, `marathon`, `level_10`, `level_25`, etc., with tiers bronze→platinum.
- **Leaderboards** — global, community, and friends; daily/weekly/monthly/all-time.
- **Friends** — friend requests, accept/decline, friend-only leaderboards.
- **Blocks** — block a user; friendship is deleted and search results hide them.
- **Reports** — file a report (spam/harassment/cheating/nsfw/other) against a user,
  room, or message. Moderators review; admins resolve with a resolution enum.
- **Notifications** — friend requests, badge earned, goal completed, streak milestone,
  report updates.
- **Profiles** — public profile with stats, badges, streak; private edit endpoint for
  display name, bio, avatar, username, exam goal, target year, study goal, timezone.
- **Search** — find onboarding-completed users by username or display name.
- **Subscriptions** — `free`, `plus`, `pro`; sandbox simulates the payment, production
  uses Razorpay.
- **Referrals** — every user gets a referral code; the referred user's signup and first
  study session are tracked.
- **Admin console** — platform stats, user management (role/status), report resolution,
  force-close rooms, create/edit communities.
- **Audit logs** — admin actions are recorded with actor, action, target.
- **Analytics** — canonical event vocabulary (see `docs/analytics.md`) wired to PostHog
  in production.
- **Moderation tools** — host can mute, change role, or kick a participant; admin can
  force-close rooms; platform mods/admins see all reports.

---

## Tech stack

### Production target

| Layer        | Technology                                              |
| ------------ | ------------------------------------------------------- |
| Web SPA      | Next.js 16 + React 19 + Tailwind 4 + shadcn/ui          |
| API          | FastAPI (Python) on Railway / Render / AWS ECS          |
| Database     | Supabase Postgres (pgbouncer-pooled for app; direct for migrations) |
| Ephemeral    | Redis (Upstash) — presence, rate limits, leaderboard cache, pub/sub |
| Media SFU    | LiveKit Cloud (WebRTC, wss)                             |
| Auth         | Supabase Auth + Google OAuth (JWT bearer)               |
| File storage | Supabase Storage (avatars, room thumbnails, attachments) |
| Email        | Resend (transactional: welcome, friend requests, streak summary, password reset) |
| Payments     | Razorpay (INR, plans `plus` / `pro`)                    |
| Analytics    | PostHog Cloud (server-side capture + client-side JS/Android) |
| Errors/perf  | Sentry (Next.js, FastAPI, Android) with release tagging |
| Liveness     | UptimeRobot / BetterStack on `/api/health`              |
| CI/CD        | GitHub Actions — lint + typecheck + prisma migrate + Vercel + Railway |
| Hosting      | Vercel (web), Railway (API), Supabase (db), LiveKit Cloud (media) |

### Sandbox runtime (this repo)

| Layer        | Technology                                              |
| ------------ | ------------------------------------------------------- |
| Web + API    | Next.js 16 API routes (single process, port 3000)       |
| Database     | Prisma + SQLite (`db/custom.db`)                        |
| Ephemeral    | In-memory `Map` in `src/lib/presence.ts`                |
| Media SFU    | Simulated tokens signed with a placeholder secret       |
| Auth         | Email/password + a `google-demo` endpoint; signed session token (`src/lib/auth.ts`) |
| File storage | Local `/public` (read-only)                             |
| Email        | Disabled (logged to console)                            |
| Payments     | Sandbox simulates a successful `Payment` row            |
| Analytics    | No-op `trackEvent` helper                               |
| Errors/perf  | Disabled                                                |

The API surface, Prisma schema, enums, and flows are **identical** between the sandbox
and the production target — switching the runtime does not break the Android contract
(see `AGENTS.md` §4).

---

## Repo structure

```
.
├── AGENTS.md                 # permanent rules for all agents (READ FIRST)
├── README.md                 # this file
├── worklog.md                # running status log
├── docs/
│   ├── architecture.md        # system architecture
│   ├── database.md            # production PostgreSQL DDL + enum mapping
│   ├── api.md                 # REST reference (web)
│   ├── authentication.md      # Supabase Auth + sandbox session token
│   ├── security.md            # trust boundaries, RLS, secrets
│   ├── livekit.md             # media plane contract
│   ├── analytics.md           # event vocabulary + PostHog + Sentry
│   ├── deployment.md          # production deployment guide
│   └── mobile-contract.md     # binding contract for the future Android app
├── prisma/
│   ├── schema.prisma          # the single source of truth for data
│   └── seed.ts                # seeds 11 communities + 12 badges + 8 demo users
├── src/
│   ├── app/
│   │   ├── page.tsx           # the SPA (only user-visible route is `/`)
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   └── api/               # every endpoint under /api/*
│   │       ├── auth/{signup,login,me,google-demo}/route.ts
│   │       ├── onboarding/route.ts
│   │       ├── communities/[slug]/{route,join,leave}/route.ts
│   │       ├── rooms/route.ts
│   │       ├── rooms/[id]/{route,token,events,presence,messages,timer}/route.ts
│   │       ├── rooms/[id]/members/[userId]/route.ts
│   │       ├── study/{sessions,sessions/[id]/stop,goals,goals/today,streak,badges}/route.ts
│   │       ├── leaderboard/route.ts
│   │       ├── friends/{route,[id]/route}.ts
│   │       ├── blocks/route.ts
│   │       ├── reports/route.ts
│   │       ├── profile/{route,[username]/route}.ts
│   │       ├── search/users/route.ts
│   │       ├── notifications/{route,[id]/route}.ts
│   │       ├── subscriptions/route.ts
│   │       ├── referrals/route.ts
│   │       ├── admin/{stats,users,users/[id],reports/[id],rooms/[id],communities,communities/[slug]}/route.ts
│   │       └── health/route.ts
│   ├── lib/
│   │   ├── api.ts             # getAuth, ok, error helpers, role checks
│   │   ├── auth.ts            # signed session token + password hashing
│   │   ├── db.ts              # Prisma client
│   │   ├── me.ts              # loadMe() helper
│   │   ├── presence.ts        # in-memory presence + chat + timer (Redis stand-in)
│   │   ├── study.ts           # XP, streak, daily-goal, badge logic (server-authoritative)
│   │   ├── ratelimit.ts
│   │   ├── router.tsx         # hash-based SPA router
│   │   ├── auth-context.tsx
│   │   └── api-client.ts
│   └── components/ui/         # shadcn/ui primitives
├── public/
│   ├── logo.svg
│   └── robots.txt
├── tailwind.config.ts
├── postcss.config.mjs
├── next.config.ts
├── tsconfig.json
├── eslint.config.mjs
├── components.json            # shadcn/ui config
└── package.json
```

---

## Quick start

Requirements: **Node 20+** and **Bun** (used for installs and scripts).

```bash
# 1. Install deps
bun install

# 2. Create the SQLite database + apply the Prisma schema
bun run db:push

# 3. Seed the demo data (11 communities, 12 badges, 8 demo users)
npx tsx prisma/seed.ts

# 4. Start the dev server
bun run dev
```

The app is now at **http://localhost:3000**. The whole product lives on the `/`
route; hash routing takes you to `#/login`, `#/dashboard`, `#/communities/gate`,
`#/rooms/<id>`, `#/admin`, etc.

### Demo logins (seeded)

| Email                   | Password   | Role    | Exam goal       |
| ----------------------- | ---------- | ------- | --------------- |
| `admin@sankalp.in`      | `admin123` | admin   | General Study   |
| `aarav@sankalp.in`      | `demo1234` | user    | GATE            |
| `diya@sankalp.in`       | `demo1234` | user    | NEET            |
| `vihaan@sankalp.in`     | `demo1234` | user    | UPSC            |
| `ananya@sankalp.in`     | `demo1234` | user    | JEE             |
| `kabir@sankalp.in`      | `demo1234` | user    | CAT             |
| `ishita@sankalp.in`     | `demo1234` | user    | DSA             |
| `arjun@sankalp.in`      | `demo1234` | user    | SSC             |

The seven non-admin demo accounts each have one seeded study session so the
leaderboard looks alive.

### Useful scripts

```bash
bun run lint          # ESLint
bun run db:generate   # regenerate Prisma client after schema changes
bun run db:push       # apply schema to the SQLite file (sandbox only)
bun run db:migrate    # create + apply a migration (use in production)
bun run db:reset      # drop + recreate + migrate (destructive!)
bun run build         # production build → .next/standalone
bun run start         # run the production build
```

---

## Documentation index

| Document                          | What it covers                                                |
| --------------------------------- | ------------------------------------------------------------- |
| `AGENTS.md`                       | **Permanent rules for any agent.** Read first. The Android rule lives here. |
| `docs/architecture.md`            | System architecture, request flow, data flow, trust boundaries. |
| `docs/database.md`                | Production PostgreSQL DDL, enum mapping, RLS policies.       |
| `docs/api.md`                     | Web-facing REST reference (mirrors the mobile contract).      |
| `docs/authentication.md`           | Supabase Auth (production) + signed session token (sandbox).  |
| `docs/security.md`                | Threat model, trust boundaries, secrets, RLS, rate limits.    |
| `docs/livekit.md`                 | LiveKit media plane contract: token flow, mic/cam defaults, capacity, performance rules, reconnect. |
| `docs/analytics.md`               | Canonical event vocabulary, PostHog, Sentry, activation/retention/funnel. |
| `docs/deployment.md`              | Production deployment guide (Vercel + Railway + Supabase + Upstash + LiveKit + Resend + Sentry). |
| `docs/mobile-contract.md`         | **The binding contract for the future Android app.** Every endpoint, enum, error code, payload shape. |
| `worklog.md`                      | Running status log; append a new section each time you finish a task. |

---

## The Android rule

> **The future Android app MUST reuse this exact backend, database, Supabase project,
> auth, LiveKit project, and API.** It MUST NOT create a second database, duplicate
> tables, a forked API, a parallel auth system, or a second LiveKit project.
>
> See `AGENTS.md` §1 for the full rule and `docs/mobile-contract.md` for the binding
> API contract the Android developer must implement against.

This rule is permanent and overrides any conflicting instruction. Before touching the
codebase, every agent (including the future Android agent) must:

1. Read `AGENTS.md`.
2. Read `docs/mobile-contract.md` and `docs/architecture.md`.
3. Read the relevant Prisma models in `prisma/schema.prisma`.
4. Make changes that keep the API contract stable for Android.
5. Update `worklog.md` with what was done.
6. Run `bun run lint` and fix errors before finishing.

---

## Status / known limitations

This repository is a **sandbox** that demonstrates the product end-to-end. The
production target is FastAPI + Postgres/Supabase + Redis + LiveKit (see
`docs/deployment.md`). The API contract, Prisma schema, enums, and flows are identical
between the two so the swap is mechanical.

Current sandbox simulations (call out clearly when demoing):

- **LiveKit tokens** are signed with a placeholder secret
  (`sankalp-demo-secret-change-me`) so the JWT shape is byte-identical to what the
  real `livekit-server-sdk` produces. A token minted here will be rejected by LiveKit
  Cloud (different secret) but is the same shape. Production swaps in
  `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` / `LIVEKIT_URL` server-side; the API
  contract does not change. See `docs/livekit.md` §3.
- **Presence + chat + timer** are in an in-memory `Map` in `src/lib/presence.ts`.
  Restarting the dev server clears ephemeral state. Production uses Redis HASHes +
  pub/sub.
- **Database** is SQLite (`db/custom.db`) in the sandbox. Production uses Supabase
  Postgres. The Prisma schema is provider-agnostic; only the `datasource` block
  changes. Production uses native UUIDs and enums; the sandbox uses cuid + string-typed
  enums validated in the API layer.
- **Auth** uses a signed session token (`src/lib/auth.ts`) in the sandbox. Production
  uses Supabase Auth JWTs (Google OAuth or email/password). The `Authorization:
  Bearer` header shape is identical.
- **Payments** simulate a `Payment(status=paid)` row immediately. Production uses
  Razorpay (order creation → SDK checkout → webhook confirmation).
- **Email** is disabled (logged to console). Production uses Resend with a verified
  `sankalp.in` domain (DKIM/SPF).
- **Analytics** (`trackEvent` in `src/lib/study.ts`) is a no-op in the sandbox.
  Production wires it to PostHog server-side capture.
- **Errors / performance monitoring** (Sentry) is disabled in the sandbox.
- **Performance targets are architectural, not load-tested.** The scaling numbers in
  `docs/deployment.md` §11 are planning estimates, not verified by a load test.
- **Push notifications** (FCM) for Android are planned; the `POST /api/user-devices`
  endpoint is reserved in the contract (see `docs/mobile-contract.md` §5.17) but not
  yet implemented.

See `worklog.md` for the current status across all in-flight tasks.
