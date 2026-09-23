# Sankalp — Security

> Threat model, trust boundaries, and concrete controls for Sankalp.
> Read alongside `docs/authentication.md` and `docs/architecture.md §4`.

## 1. AuthN / AuthZ model

**AuthN** — Supabase Auth JWT (production) / signed HMAC session token (sandbox). See `docs/authentication.md`.
- Every protected endpoint re-verifies the token and loads `users.role` + `users.status` from PostgreSQL on each request.
- Suspended/banned users receive `401` (or `403 ACCOUNT_SUSPENDED` at the login endpoint) even with a valid token.

**AuthZ** — three layered checks, all enforced server-side:
1. **RBAC** — role ∈ {user, moderator, admin}. Checked via `isModerator(ctx)` / `isAdmin(ctx)` in `src/lib/api.ts`.
2. **Per-resource ownership** — `room.owner_id === ctx.userId`, `community_member.role === 'owner'`, `study_session.user_id === ctx.userId`, etc. Ownership is checked on the row just fetched from the DB, never on a client-supplied field.
3. **Supabase RLS** — defense-in-depth at the database layer. Even if a bug in the API omits a check, RLS still prevents cross-user reads/writes for anon/authenticated keys. Service-role keys (which bypass RLS) are used only by the FastAPI server for legitimate cross-user writes (granting badges, audit logs, payment webhooks). See `docs/database.md §4` for example policies.

## 2. Supabase key discipline

- **`SUPABASE_ANON_KEY`** — public-safe; may be embedded in the web bundle and the Android app. Subject to RLS.
- **`SUPABASE_SERVICE_ROLE_KEY`** — bypasses RLS; **server-only**. Lives in `process.env` on the FastAPI host. Never sent to a client, never logged, never returned in any response. Any code path that uses it is server-side only (admin actions, payment webhook handler, badge grant, audit log writer).
- **`LIVEKIT_API_SECRET`**, **`SESSION_SECRET`** — server-only HMAC secrets. Same rule.
- Audit: grep the repo for these names; they must only appear in server code (`src/app/api/**`, `src/lib/**`) and never in client components or in any string that gets shipped to the browser.

## 3. Rate limiting

| Endpoint / action      | Limit          | Keyed by              | Sandbox impl                  | Production impl                |
| --------------------- | -------------- | --------------------- | ----------------------------- | ------------------------------ |
| `POST /api/auth/signup` | 10 / minute    | IP                    | in-memory sliding window      | Redis token bucket             |
| `POST /api/auth/login`  | 10 / minute    | IP                    | in-memory sliding window      | Redis token bucket             |
| Room token mint        | 20 / minute    | IP + user             | (planned)                    | Redis token bucket             |
| Message send (per room)| 30 / minute    | IP + user + room      | (planned)                    | Redis token bucket             |
| Generic API            | 60 / minute    | IP                    | (planned)                    | Redis token bucket             |

The sandbox limiter (`src/lib/ratelimit.ts`) uses a sliding-window counter keyed by IP from `X-Forwarded-For` (first hop) or `X-Real-IP`. It is process-local and **resets on restart** — production must use Redis so limits survive restarts and apply across all workers. The keys and limits are intentionally identical between the two so the production swap is mechanical.

Exceeded limits return `400` with `error.code = "RATE_LIMITED"` in the sandbox; production should return `429` with `Retry-After` (this is a minor contract improvement to land with the FastAPI port).

## 4. Input validation

- **Sandbox**: every route handler manually validates and normalizes the JSON body. Examples: `String(body?.email || "").trim().toLowerCase()`, `Math.min(40, Math.max(1, Number(...)))`, enum `includes()` checks (e.g. `REASONS.includes(reason)` in `reports/route.ts`).
- **Production**: Pydantic v2 models on FastAPI. Every endpoint has an explicit request model with field types, length bounds, and enum membership; FastAPI returns `422` with the field-level error detail envelope on failure.

Trust rules — **never** accepted from the client (the API schemas do not even declare these as input fields):
- `StudySession.durationMin` — computed server-side as `now() - startedAt`, capped at 480 min. Sessions < 1 min are deleted (see `closeSession()` in `study/sessions/route.ts`).
- `StudySession.xpEarned` — computed as `durationMin * XP_PER_MINUTE`.
- `Profile.totalXp`, `Profile.level`, `Profile.totalMinutes` — incremented by `awardXp()` only.
- `Streak.current`, `Streak.longest` — set by `bumpStreak()` only.
- `UserBadge` rows — created by `evaluateBadges()` only.
- `Payment.status` — set by the Razorpay webhook handler only (the sandbox `POST /api/subscriptions` shortcut will be replaced).
- `Report.status`, `Report.resolution`, `Report.resolvedById` — set by admins via `/api/admin/reports/[id]` only.

A request that tries to send any of these is silently ignored at the schema level.

## 5. Secure HTTP headers

Production FastAPI (via a middleware) and the Next.js sandbox (via `next.config.ts` headers) emit:

| Header                  | Value                                                                |
| ----------------------- | -------------------------------------------------------------------- |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload`                 |
| `X-Content-Type-Options`   | `nosniff`                                                       |
| `X-Frame-Options`          | `DENY`                                                          |
| `Referrer-Policy`          | `strict-origin-when-cross-origin`                               |
| `Permissions-Policy`       | `camera=(self), microphone=(self), geolocation=()`             |
| `Content-Security-Policy`  | see below                                                       |

CSP (production):
```
default-src 'self';
script-src 'self' 'wasm-unsafe-eval';
style-src 'self' 'unsafe-inline';
img-src 'self' data: https://<project>.supabase.co;
connect-src 'self' https://<project>.supabase.co wss://<project>.livekit.cloud https://app.posthog.com https://<sentry-ingest>;
media-src 'self' blob:;
frame-ancestors 'none';
base-uri 'self';
form-action 'self';
```

The CSP must allow:
- `connect-src` for LiveKit WebRTC (`wss://…livekit.cloud`), Supabase, PostHog, and Sentry.
- `media-src blob:` for LiveKit's local media stream previews.
- `img-src` for Supabase Storage avatars and inline data URLs.

Sandbox note: the sandbox dev server does not enforce all of these headers; production must apply them at the edge (Vercel/Railway) or in FastAPI middleware.

## 6. CORS

- **Web origin**: only `https://sankalp.in` (and staging `https://staging.sankalp.in`) is allowed.
- **Android**: pinned via a custom app scheme (`sankalp://`) and the Google Play signing fingerprint. FastAPI adds an `x-allowed-client: android` allowlist; the Android app sends an `Origin` header derived from the app scheme.
- The sandbox dev server allows `http://localhost:3000` for local development. Production has no wildcard CORS.

## 7. Secret management

- All secrets come from environment variables (see `docs/architecture.md §7`).
- They are never committed. `.env*` files are in `.gitignore`.
- Production secrets are provisioned via the deployment platform's secret store (Vercel/Railway env vars, Supabase project secrets, LiveKit Cloud API keys).
- The `SESSION_SECRET` default (`"sankalp-dev-secret-change-me-in-production"`) is intentional for the sandbox and **must** be overridden in any non-local deployment. Production rotates it as part of the FastAPI cutover and invalidates all sandbox-era session tokens.

## 8. Safe logging

- **Never log** tokens (Bearer or session), passwords, password hashes, refresh tokens, full emails (mask the local part in error logs), or PII (avatar URLs of users under report).
- **Always log** request IDs, user IDs, route name, status code, and timing. PII-safe.
- Admin actions are persisted in the `audit_logs` table with `actor_id`, `action`, `target_id`, and a JSON `metadata` blob. Examples: `user_role_status`, `report_resolve`, `room_admin_update`. See `src/app/api/admin/**`.
- Sentry breadcrumbs must not include request bodies; they should include route + status + user_id only.

## 9. LiveKit security

- Room tokens are minted **server-side only** by `POST /api/rooms/[id]/token` using `LIVEKIT_API_KEY/SECRET`.
- **6-hour TTL** (`exp = now + 6 * 3600`), matching the production LiveKit access token convention.
- **Per-user identity**: `sub = ctx.userId`, with `name = displayName` and `metadata = { username, avatarUrl, role }` so the room UI and other participants see consistent identity.
- **Scoped grants**:
  - `canPublish` — default true (mic/cam); can be turned off for `viewer` role.
  - `canSubscribe` — always true (must be able to hear/see others).
  - `canPublishData` — only granted on explicit request (e.g. screen share); default false.
  - `hidden`, `recorder` — always false.
- **Mic defaults OFF**: `RoomMember.muted = true` on join. Hosts can mute others via `PATCH /api/rooms/[id]/members/[userId]` (system message posted).
- **Capacity**: `participantCount >= maxParticipants` → `403 ROOM_FULL` (see `token/route.ts`). `maxParticipants` is clamped to 2..50 on room creation.
- **Room names** are random (`sankalp-<6-byte hex>`) so they are not guessable. Production enables LiveKit's "empty room timeout" and "room deletion" so dead rooms are reclaimed.

## 10. Reporting & moderation

- Any user can `POST /api/reports` with `{ reason, detail?, reportedUserId? | reportedRoomId? | reportedMessageId? }`. At least one target is required.
- Filing a report fans out a `report_update` notification to all moderators and admins.
- Moderators see `GET /api/reports?status=…`. Admins resolve via `PATCH /api/admin/reports/[id]` with `{ status, resolution }` where `resolution ∈ {warning, mute, kick, ban, no_action}`.
- Resolution is recorded with `resolved_by_id` + `resolved_at`; an `AuditLog` row is written.
- A `ban` resolution typically pairs with `PATCH /api/admin/users/[id] { status: "banned" }` — the admin surface chains these.
- Mutes/kicks in a live room happen via `PATCH/DELETE /api/rooms/[id]/members/[userId]` and a system message is posted to the room.

## 11. Privacy

- **Public profiles**: `GET /api/profile/[username]` exposes `displayName`, `username`, `bio`, `examGoal`, `targetYear`, `level`, `totalMinutes`, `totalXp`, `streakCount`, `sessionCount` (count only), `badges`. **Email is never returned.**
- **Self profile**: `GET /api/profile` adds `email` and `timezone` for the authenticated user only.
- **Search** (`GET /api/search/users`) excludes profiles where `onboardingComplete = false` and excludes users the caller has blocked.
- **Blocked users cannot interact**: `POST /api/friends` checks for a `Block` row in either direction and returns `400 BLOCKED`. Listing endpoints filter blocked users when the caller is authed.
- **Audit logs** store `actor_id` + `target_id` (UUIDs) + a JSON `metadata` of the action diff — no PII beyond IDs.

## 12. Threat-model checklist

| Threat                                   | Control                                                                                                  |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Forged study duration                    | Server computes all durations; sub-minute sessions discarded; 8h cap.                                    |
| Token theft (XSS)                         | CSP strict; production stores token in HttpOnly cookie; sandbox warns about `localStorage` exposure.       |
| Token theft (MITM)                        | HSTS + TLS-only in production; sandbox runs on localhost.                                                  |
| CSRF                                      | SameSite=Strict cookies in production; no cookie-based state in sandbox.                                    |
| Brute-force login                         | 10/min per IP rate limit; `401` (not `400`) on bad password; Supabase Auth has its own throttling.        |
| Account enumeration                       | `EMAIL_TAKEN` on signup is the only leak; login returns generic `401`.                                    |
| Privilege escalation                      | Role checked on every request; ownership checked on the row just fetched from the DB; RLS as backstop.  |
| Service-key leak                          | Service-role + LiveKit secrets never shipped to client; server-only env vars.                              |
| Malicious room token                      | 6h TTL, per-user identity, scoped grants, random unguessable room names.                                  |
| Abuse of room (spam/harassment)            | Reports → mod queue → warning/mute/kick/ban with audit trail.                                            |
| PII leak                                  | Email never returned in public profile; logs mask emails; no PII in Sentry breadcrumbs.                  |
| Admin abuse                                | Every admin action writes `AuditLog`; admin role grants are themselves audit-logged.                     |
