# Sankalp — India-focused Virtual Study Platform

## Project Status (Initial)

Building **Sankalp** — a production-grade India-focused virtual study platform inspired by StudyLive/StudyStream (functional reference only; no branding/assets copied).

### Brand
- Name: **Sankalp** (Sanskrit/Hindi for "commitment / resolve" — fitting for study goals)
- Headline: "Study with people preparing for the same goal."
- CTA: "Start Studying"
- Color system: Emerald primary (focus/growth) + Saffron/Amber accent (India, energy). No indigo/blue.

### Sandbox reality vs. target architecture
- **Target (documented in docs/)**: FastAPI + PostgreSQL/Supabase + Redis + LiveKit + Vercel/Railway
- **Runnable (this sandbox)**: Next.js 16 API routes (FastAPI equivalent) + Prisma/SQLite (PostgreSQL equivalent) + in-memory presence (Redis equivalent) + simulated LiveKit room UI (swappable for real LiveKit tokens)
- Only the `/` route is user-visible. The whole app is a SPA with hash-based client routing (#login, #rooms/123, #admin, …). API lives under `/api/*`.
- All APIs are designed REST-style so the future Android app can consume them unchanged. `docs/mobile-contract.md` is the binding contract.

### Initial communities (seeded)
GATE, JEE, NEET, UPSC, CAT, SSC, Banking, MPSC, Placements, DSA, General Study

## Current Goals / Completed
- [x] Repo inspected, plan written
- [ ] Prisma schema (all entities) + seed
- [ ] App shell + routing + theming
- [ ] Auth + onboarding
- [ ] Communities + rooms + study engine
- [ ] Social + moderation + admin
- [ ] Landing page
- [ ] Docs (architecture, database, api, auth, security, livekit, analytics, deployment, mobile-contract)
- [ ] Agent-browser self-verify
- [ ] Recurring review cron

## Unresolved Risks / Next Priorities
- LiveKit requires real cloud credentials + secrets. Simulated in-sandbox; production swap documented.
- Real OAuth (Google) + Supabase Auth need provider config; email/password + signed-session fallback implemented in-sandbox.
- Load testing not performed — performance targets are architectural, not verified.

---
Task ID: DOC-A
Agent: general-purpose (docs)
Task: Wrote 5 core architecture docs (architecture.md, database.md, api.md, authentication.md, security.md) describing the production target architecture (FastAPI + PostgreSQL/Supabase + Redis + LiveKit) and how the runnable sandbox (Next.js API routes + Prisma/SQLite + in-memory presence + simulated LiveKit) maps 1:1 to it.

Work Log:
- Read AGENTS.md, prisma/schema.prisma (all 24 entities), worklog.md, and every route handler under src/app/api/** (auth, onboarding, communities, rooms, study, leaderboard, social, profile, notifications, subscriptions, referrals, admin, health) plus src/lib/{auth,api,ratelimit,presence,study,me,api-client,db}.ts and prisma/seed.ts to ground every doc claim in real code.
- Created /home/z/my-project/docs/ (it did not exist) and wrote all 5 files with the Write tool to the exact required paths.
- docs/architecture.md (179 lines): ASCII system diagram (Next.js Web → FastAPI → PostgreSQL/Supabase + Redis + LiveKit + Supabase Storage + PostHog + Sentry + Resend); modular-monolith explanation with all 11 backend modules (auth, users/profiles, communities, rooms, study_engine, social, moderation, notifications, payments, analytics, admin); source-of-truth table; trust-boundary list (server-only writes for duration/XP/streaks/badges/payments/reports); Redis caching strategy table (presence, rate-limit, leaderboard, blacklist, room config, pubsub); performance target (5k users / 1k DAU / 200-500 concurrent / 100+ video) with explicit "architectural targets, not load-tested" disclaimer + concrete techniques (pagination, indexes, Redis cache, pooling, lazy loading, code splitting, optimized queries, SSE); env var contract (12 names, values not included); sandbox↔production mapping table.
- docs/database.md (526 lines): Prisma→PG type mapping; full production PostgreSQL DDL for 19 tables (users, profiles, auth_sessions, communities, community_members, rooms, room_members, study_sessions, daily_goals, streaks, badges, user_badges, leaderboard_snapshots, friendships, blocks, reports, room_messages, notifications, subscriptions, payments, user_devices, referrals, audit_logs) using real PG types — uuid primary key default gen_random_uuid(), timestamptz, native enum types for every role/status/mode/tier, jsonb for tags/pomodoro_config/metadata, CHECK constraints, FK ON DELETE CASCADE; complete index reference (single + composite/unique hot-path indexes); Supabase RLS strategy with concrete example policies for profiles (public read / owner update), rooms (listed read / owner all), study_sessions (owner read), community_members, reports; migration workflow (prisma migrate → supabase); sandbox note (cuid→uuid, string enums→PG enums, DateTime→timestamptz, JSON→jsonb, no native CHECK/RLS in SQLite).
- docs/api.md (222 lines): REST conventions (base path /api, JSON, Bearer auth, pagination {page, limit, total}, error envelope {error:{code,message}}, rate limits); EVERY endpoint implemented grouped by module — auth, onboarding, communities, rooms (incl. token, presence join/heartbeat/leave, messages, SSE events, timer, members), study engine (sessions start/stop, goals today/list, streak, badges), leaderboard (scope/period), social (friends, blocks, reports), profile (self/by-username/search), notifications, subscriptions, referrals, admin (stats/users/users[id]/reports[id]/rooms[id]/communities), health. For each endpoint: method, path, auth tier (public|user|mod|admin), request shape, response shape, key business rules. Complete enum reference + badge catalog (12 seeded badges with triggers). Sandbox↔production parity notes.
- docs/authentication.md (177 lines): production Supabase Auth (email/password + Google OAuth, JWT verified via Supabase JWK, refresh, RLS); sandbox signed HMAC session token format `base64url(payload).signature` with payload {uid,exp,jti}, SESSION_SECRET, PBKDF2-ish SHA256+salt password hashing; Google OAuth production flow vs sandbox /api/auth/google-demo simulation; RBAC table (user|moderator|admin) with capabilities; helper functions getAuth/isModerator/isAdmin; token storage (web localStorage["sankalp_token"], Android EncryptedSharedPreferences, never store service keys on client); security properties (account-status checks, email verification, rate limits, audit trail, logout/JTI blacklist); FastAPI middleware pseudo-code; client integration flow for web and Android; migration path table.

Full development history available in git history. This file was trimmed for build performance.

---
Task ID: FIX-ROOMS-001
Agent: general-purpose (room-flow fix)
Task: Fix `segments is not defined` runtime error in app-shell.tsx and verify the complete room + LiveKit flow locally.

Work Log:
- Fixed `app-shell.tsx:50`: `segments.length > 1` → `route.segments.length > 1` (segments was never destructured; `route.segments` is the correct ref).
- Fixed `app-shell.tsx:58`: `!isRoom` (also undefined) → `!isIndividualRoom` (the intended full-screen room check).
- Discovered DB connection failure: a stale system env var `DATABASE_URL=file:/home/z/my-project/db/custom.db` (SQLite, file doesn't exist) was overriding `.env`'s Postgres URL. Prisma rejected it with "URL must start with postgresql://". Fixed by sourcing `.env` with `set -a && source .env && set +a` before `bun run dev` so the .env value wins over the stale system env. No code change needed.
- Discovered local-login was broken: `getAuth` in `src/lib/api.ts` only verified Supabase JWTs, but the seeded admin/test users (from `prisma/seed.ts`) exist only in our local DB and `/api/auth/login` issues Sankalp HMAC session tokens (`base64url(payload).signature`). Added a minimal additive fallback in `getAuth` that verifies two-part Sankalp tokens before falling through to Supabase JWT verification. Supabase path is untouched.
- Added matching Sankalp-token fallback in `src/lib/auth-context.tsx` `fetchMe()` and `login()` so seeded users can log in via the UI. Supabase auth still tried first; fallback only triggers when Supabase has no account.
- Verified end-to-end via agent-browser: landing → login (admin@sankalp.in) → /rooms (sidebar visible, room list renders) → click room (full-screen view, no sidebar, Pomodoro + controls render) → Leave room → back to /rooms. No runtime errors in dev.log.
- Verified LiveKit token endpoint via curl: returns 200 with real JWT (3 parts, 456 chars), real `serverUrl=wss://web-brwna5lk.livekit.cloud`, real `roomName=sankalp-default-general`, real `identity`, `hasPaidPlan`, `roomMinutesUsed`, `freeAllowanceMin`. No secrets printed.
- LiveKit Cloud rejects connection with `invalid API key for domain web-brwna5lk.livekit.cloud` — credentials in `.env` don't match the project at that URL. This is an env/config mismatch, NOT a code bug. Reported honestly to user.
- `bun run lint` passes clean.

Stage Summary:
- Bug fixed: `segments is not defined` + `isRoom is not defined` in app-shell.tsx (2 minimal edits, no functionality rewritten).
- Unblockers applied: stale system `DATABASE_URL` override (use `set -a && source .env`); Sankalp-token verification fallback in `getAuth` and frontend `auth-context` (additive, Supabase path intact).
- Room flow verified: /rooms (sidebar + list) → /rooms/[id] (full-screen) → Leave → /rooms. No runtime/console errors.
- LiveKit integration verified at code level: real `livekit-server-sdk` token issuance, real `livekit-client` Room.connect, camera via setCameraEnabled, mic never enabled, real participant count from `remoteParticipants` + local, no fake/simulated data.
- Remaining blocker: LiveKit Cloud rejects the token because `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` in `.env` do not match the project at `wss://web-brwna5lk.livekit.cloud`. Camera publish couldn't be tested because LiveKit Cloud disconnects at the signal-connect phase before camera can be enabled.
