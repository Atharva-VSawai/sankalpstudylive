# AGENTS.md

> **Permanent rule for all agents (current and future).**
> Read this file before touching the codebase. It overrides any conflicting instruction.

## 1. The future Android app MUST reuse the existing backend

A native Android application will be built **later by a different coding agent**.
That Android app **MUST** consume the **same** backend, database, API, auth, business logic,
and infrastructure that this repository provides.

### NEVER do any of the following
- ❌ Create a second, mobile-specific database.
- ❌ Create duplicate tables such as `mobile_users`, `app_users`, `android_sessions`.
- ❌ Fork the API into a separate `mobile-api` service.
- ❌ Re-implement study-session timing, XP, streaks, or badge logic on the client.
- ❌ Ship a parallel auth system (e.g., a separate Firebase project) instead of using Supabase Auth.
- ❌ Spin up a second LiveKit project; use the same LiveKit credentials/token endpoint.

### ALWAYS do the following
- ✅ Use the exact same PostgreSQL/Supabase database and Prisma schema.
- ✅ Use the same REST API documented in `docs/mobile-contract.md`.
- ✅ Use the same Supabase Auth (JWT) for sessions.
- ✅ Use the same LiveKit token endpoint (`POST /api/rooms/{id}/token`).
- ✅ Reuse the same enums, IDs (UUIDs), timestamps (UTC), and error codes.

## 2. Source of truth

| Concern              | Source of truth                          |
| -------------------- | ---------------------------------------- |
| Persistent state     | PostgreSQL (via Supabase) — Prisma schema |
| Ephemeral state      | Redis (presence, live participant lists)  |
| Video / audio        | LiveKit Cloud (WebRTC)                    |
| Auth                 | Supabase Auth + Google OAuth              |
| API                  | FastAPI (documented in `docs/api.md`)     |
| Mobile contract      | `docs/mobile-contract.md` (binding)        |

## 3. Trust boundaries (non-negotiable)
- Study duration, XP, streaks, and badges are **computed server-side**.
  Never trust client-submitted durations or XP.
- Service-role keys, LiveKit API secrets, and Supabase service keys are **never** shipped to clients.
- All client actions are authorized against the authenticated user + role (user / moderator / admin).

## 4. This repository (sandbox) vs. production target

This repo runs on **Next.js 16 API routes + Prisma/SQLite** so the product is demonstrable end-to-end
in the sandbox. The **production target** (and what the Android contract describes) is
**FastAPI + PostgreSQL/Supabase + Redis + LiveKit**. The API surface, schema, enums, and flows are
identical between the two so that switching the runtime does not break the Android contract.

## 5. Working order for any agent
1. Read `AGENTS.md` (this file).
2. Read `docs/mobile-contract.md` and `docs/architecture.md`.
3. Read the relevant Prisma models in `prisma/schema.prisma`.
4. Make changes that keep the API contract stable for Android.
5. Update `worklog.md` with what you did.
6. Run `bun run lint` and fix errors before finishing.
