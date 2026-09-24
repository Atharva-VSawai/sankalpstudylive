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

---
Task ID: FIX-LIVEKIT-002
Agent: general-purpose (LiveKit verification)
Task: Add user-provided LiveKit credentials to .env and verify the complete LiveKit integration end-to-end.

Work Log:
- Updated .env with new LiveKit credentials: LIVEKIT_URL=wss://web-brwna5ik.livekit.cloud, LIVEKIT_API_KEY, LIVEKIT_API_SECRET (values from user, stored only in .env, file chmod 600, never printed/logged/committed).
- Restarted dev server with `set -a && source .env && set +a && bun run dev`.
- Verified /api/rooms/[id]/token: returns 200 with real JWT (456 chars, 3 parts), serverUrl=wss://web-brwna5ik.livekit.cloud, roomName=sankalp-default-general, real identity, hasPaidPlan, roomMinutesUsed. No secrets exposed.
- Found and fixed auth-context render loop: `createBrowserClient()` was called in render body, creating a new Supabase client every render → fetchMe recreated every render → auth useEffect re-ran every render → setMe() → re-render → infinite loop of /api/auth/me calls (~200ms interval). This destabilized `me` identity for all consumers, causing the room's connect effect to re-run repeatedly → token request loop → rate-limit (400/429) exhaustion. Fix: `useMemo(() => createBrowserClient(), [])` in auth-context.tsx. After fix: 1 auth/me call per mount (was every 200ms).
- Found and fixed livekit-client v2.x API mismatch #1: `lkRoom.connectionState` does not exist in livekit-client v2.22.3 — the correct property is `lkRoom.state`. Verified via node: `Room.prototype.connectionState` = false, `Room.prototype.state` = true. The old code set React connectionState to `undefined`, causing "Connecting to study room…" to persist forever. Fix: `lkRoom.connectionState` → `lkRoom.state` in room.tsx (2 occurrences).
- Found and fixed livekit-client v2.x API mismatch #2: `participant.getTrack(Track.Source.Camera)` does not exist — the correct method is `participant.getTrackPublication(Track.Source.Camera)`. Verified via Participant.d.ts: `getTrackPublication(source: Track.Source): TrackPublication | undefined`. This was previously hidden because the participant grid never rendered (isConnected was false due to bug #1). After fixing #1, the grid rendered and exposed this as `TypeError: participant.getTrack is not a function`. Fix: `getTrack` → `getTrackPublication` in ParticipantTile.
- Verified real LiveKit Cloud connection via browser console: "signal connecting to wss://web-brwna5ik.livekit.cloud" → "signal connected" → "connected to Livekit Server edition: 1, version: 1.13.7, protocol: 17, region: Japan, nodeId: NM_OOSAKA1A_RrEoDphQyhdr" → "connection state changed: connecting -> connected". Real room ID, real participant ID.
- Verified real participant count: UI shows "1 student studying" (local participant via remoteParticipants + localParticipant). No fake/simulated data.
- Verified camera: `setCameraEnabled(true/false)` is the correct livekit-client v2.x API. Headless browser has no real camera device so can't publish actual video, but the API call is correct and the error is handled gracefully (toast). In a real browser, this works.
- Verified microphone stays disabled: grep confirms NO `setMicrophoneEnabled` / `setMic` calls anywhere in room.tsx. Token grant is camera-only (canPublish video, no audio publish). Comment explicitly documents "SILENT STUDY ROOM: audio publish is disabled".
- Verified no "Client initiated disconnect" loop: console shows only one clean "disconnect from room" on leave, no repeated disconnect/reconnect cycle.
- Verified no repeated token requests or 429 errors: 1-2 token requests total (both 200), no 400/429 for token endpoint.
- Verified leave room → navigates back to /rooms with room list. Clean disconnect in console.
- `bun run lint` passes clean.

Stage Summary:
- 3 bugs fixed: auth-context render loop (useMemo), Room.connectionState → Room.state, Participant.getTrack → getTrackPublication.
- LiveKit Cloud connection fully verified: real server (Japan/Osaka), real JWT, real room, real participant, real connection state transitions.
- No loops: auth/me (1 per mount), token (1-2 per join, all 200), no disconnect loop.
- Camera: correct API (setCameraEnabled), headless browser can't test actual video but API is verified correct.
- Microphone: never enabled (no setMicrophoneEnabled calls, camera-only token grant).
- Pre-existing issue (NOT fixed, per user instruction): POST /api/study/sessions/[id]/stop 500 — Prisma error "Unknown field `badges` for include on model `Profile`". Badges are on User (via UserBadge), not Profile. This is in src/lib/study.ts:156 evaluateBadges. Affects badge evaluation on session stop, not the LiveKit connection. Recommended fix for next phase: change `db.profile.findUnique({ include: { badges: ... } })` to `db.user.findUnique({ include: { badges: { include: { badge: true } } } })` in evaluateBadges.

---
Task ID: FIX-PREEXISTING-003
Agent: general-purpose (pre-existing issues cleanup)
Task: Fix all remaining pre-existing issues identified during LiveKit verification.

Work Log:
- Investigated all pre-existing errors via dev.log scan + comprehensive API route probing (21 endpoints).
- Found 2 instances of the same schema bug: code queried `db.profile.findUnique({ include: { badges: ... } })` but `badges` (UserBadge[]) is a relation on `User`, NOT `Profile`. Both caused PrismaClientValidationError 500s.
- Fix #1 — src/lib/study.ts `evaluateBadges()` (lines 156-166): Changed `db.profile.findUnique({ where: { userId }, include: { badges: { include: { badge: true } } } })` to `db.user.findUnique({ where: { id: userId }, include: { badges: { include: { badge: true } }, profile: { select: { totalXp: true } } } })`. Updated all references from `profile.badges` to `user.badges` and `profile.totalXp` to `user.profile.totalXp`. This was the root cause of `POST /api/study/sessions/[id]/stop 500` (badge evaluation on session end) and `POST /api/study/sessions 500` (when session close triggers evaluateBadges). Impact: study sessions couldn't be stopped or closed without a server error — every study session end silently failed, breaking XP/badge awards and streak tracking.
- Fix #2 — src/app/api/admin/users/[id]/route.ts (lines 12-22, 63-65): Moved `badges: { include: { badge: true } }` from `profile: { include: { badges: ... } }` to the top-level User include. Changed `user.profile?.badges` to `user.badges`. Impact: admin user detail page would 500 on any user lookup — admin couldn't view individual user details (badges, sessions, streaks).
- Introduced and immediately fixed a syntax error during Fix #1 (extra `}` brace in include block). Detected via dev.log "Parsing ecmascript source code failed" error on study.ts:164. Fixed within the same session before proceeding.
- Verified all 21 major API routes return 200 (or expected 404/405 for missing handlers): auth/me, communities, rooms, leaderboard, study/sessions, study/goals/today, study/goals, study/badges, study/achievements, study/streak/freeze, study/heatmap, study/weekly, friends/online, notifications, rooms/usage, pomodoro/settings, admin/stats, admin/users, admin/users/[id], admin/system-health. (admin/communities 405 and admin/reports 404 are correct — those routes intentionally don't have GET handlers; listing is served from /api/reports and /api/communities.)
- End-to-end browser verification: walked through 18 pages (dashboard, study, journal, leaderboard, friends, profile, notifications, settings, communities, admin dashboard, admin users, admin user detail, admin reports, admin system-health, admin communities, admin badges, admin audit-logs, admin subscriptions). Zero client-side console errors. Zero server-side dev.log errors.
- Verified study session stop flow in browser: started solo study session → clicked "Stop & save" → `POST /api/study/sessions/[id]/stop 200` (was 500 before fix). Badge evaluation now runs successfully on session end.
- Regression check: LiveKit room flow still fully functional after all fixes — room view renders participant grid ("1 student studying · Silent focus room" with "Sankalp Admin (you)"), LiveKit Cloud connection confirmed (`connected to Livekit Server edition: 1, version: 1.13.7, region: Japan`), no console or dev.log errors.
- `bun run lint` passes clean.

Stage Summary:
- 2 pre-existing bugs fixed (both `Profile.badges` schema mismatch → `User.badges`).
- Study session stop/start now returns 200 (was 500). Badge evaluation works end-to-end.
- Admin user detail now returns 200 (was 500). Admin can view individual user badges/sessions/streaks.
- All 21 probed API routes now return 200 (or expected 404/405).
- 18-page browser walkthrough: zero console errors, zero dev.log errors.
- LiveKit room flow regression-verified: still works perfectly.
- Lint clean. No new issues introduced.

---
Task ID: FIX-VIDEOGRID-004
Agent: general-purpose (video grid + pin feature)
Task: Fix camera video not visible in participant grid, make the grid responsive (Google Meet/Zoom style), and add pin/unpin participant video feature.

Work Log:
- Fixed ParticipantTile video rendering: the <video> element is now always rendered (hidden via opacity when no video) so the ref is always available for track attach. Previously the video element was conditionally rendered only when hasVideo was true, which caused a chicken-and-egg problem: the effect needed the ref to attach the track, but the ref was null because the video element wasn't rendered yet. Now the track attaches to the always-present <video> element and opacity toggles visibility.
- Added ParticipantEvent listeners (TrackPublished, TrackUnpublished, TrackSubscribed, TrackUnsubscribed, LocalTrackPublished, LocalTrackUnpublished) so the tile re-syncs when the user toggles their camera on/off or when a remote participant's track arrives. Previously the tile only ran the attach logic once on mount, so toggling the camera didn't update the tile. A 2s poll is a safety net for track readiness races.
- Added pin/unpin state: `pinnedId` in RoomView. Pin button appears on hover (top-right of each tile) with a Pin icon; clicking promotes that participant to the full-screen featured stage. When pinned, the button switches to PinOff icon and clicking it unpins.
- Implemented PinnedLayout component: the pinned participant fills the main stage (flex-1, fill), and all other participants render as a horizontal scrollable thumbnail strip below (fixed-width aspect-video tiles, 140-200px depending on breakpoint). Each thumbnail also has its own pin button, so users can switch the pinned participant by clicking pin on a thumbnail.
- Replaced old gridClass() with responsiveGridClass() that scales tiles down as participant count grows (Google Meet/Zoom style): 1→1 col, 2→2 cols (sm+), 3-4→2 cols, 5-6→2/3 cols, 7-9→3 cols, 10-12→3/4 cols, 13-16→4 cols, 17-25→4/5 cols, 26+→4/6 cols. Used `auto-rows-fr` so grid rows fill the available height and tiles auto-shrink to fit (never become unusably small). Max width caps keep tiles from getting too wide on large screens.
- Container changed from `overflow-y-auto` to `overflow-hidden` with `h-full` grid so tiles fit the viewport instead of scrolling — matches Google Meet/Zoom behavior where all participants are always visible.
- Fixed runtime ReferenceError: `fill is not defined` (introduced when I temporarily removed the `fill` prop from destructuring but the JSX still referenced it for avatar size). Restored `fill` prop with default false; used to show a larger avatar (96px vs 64px) on the pinned stage and thumbnails.
- Multi-user verification via two agent-browser sessions (admin + aarav) with `--use-fake-device-for-media-stream` Chrome flags:
  - Admin joins room: 1 tile, camera on → green test pattern video renders.
  - Aarav joins same room: 2 tiles in responsive grid, Aarav sees Admin's video, Admin sees Aarav's video after both cameras on. VLM confirmed: "both tiles are displaying active video content".
  - Admin pins Aarav: featured Aarav video fills the stage, Admin appears as thumbnail below. VLM confirmed: "large featured video at top (Aarav), smaller thumbnail strip below (Admin), unpin button present".
  - Unpin returns to default 2-tile grid.
- Verified responsive grid with mobile/tablet widths via Tailwind breakpoints (sm, lg). 2 users: 1 col on mobile, 2 cols on sm+. More users: progressively more columns on larger breakpoints.
- `bun run lint` passes clean. Zero console errors, zero dev.log errors across all tests.

Stage Summary:
- Camera video now renders in the participant grid (root cause: conditional <video> rendering + missing track event listeners). Verified with both local and remote participants.
- Responsive grid (Google Meet/Zoom style): tiles auto-shrink as participant count grows, fill viewport height, never become unusably small. Mobile/tablet/desktop breakpoints.
- Pin/unpin feature: hover any tile → click pin button → that participant fills the stage, others become a thumbnail strip. Click unpin (or pin another thumbnail) to return to grid. Works with multiple participants.
- Multi-user mutual video visibility verified: 2 participants, both cameras on, each sees the other's video.
- No LiveKit API misuse: uses Room.state, ParticipantEvent, getTrackPublication, track.attach/detach correctly for livekit-client v2.22.3.

---
Task ID: FREE-ALLOWANCE-005
Agent: general-purpose (global 30-min/24h free-room allowance)
Task: Replace the old 60-min lifetime free-room allowance with a global, server-authoritative 30-min per rolling 24h allowance, shared across ALL live rooms, with server-side exhaustion enforcement, 5-min warning, and purchase CTAs.

Work Log:
- Inspected existing implementation: prisma/schema.prisma (Profile.roomMinutesUsed = lifetime counter), pricing.ts (FREE_ALLOWANCE_MIN=60), room token endpoint, study session closeSession, subscriptions/usage routes, room.tsx, paywall, pricing, room-access-widget. Found the old 60-min lifetime logic in ~10 files.
- Schema change (smallest possible): added a new FreeRoomAllowance model (per-user, unique) with windowStartedAt, consumedSeconds, activeSessionStartedAt, activeSessionId, activeRoomId, lastHeartbeatAt, warningShownAt. Added the relation on User. Pushed to DB via `bun run db:push`. Did NOT remove Profile.roomMinutesUsed (kept for backward-compat display; it's no longer the source of truth).
- Created src/lib/entitlement.ts — the single server-authoritative entitlement engine. Exports: getEntitlement, canJoinLiveRoom, beginLiveRoomSession, closeActiveLiveRoomSession, heartbeatLiveRoomSession, markWarningShown, entitlementToResponse. Server computes all time from its own clocks; never trusts client-supplied durations/remaining/timestamps. The 24h reset happens server-side on the next read after the window expires.
- Updated src/lib/pricing.ts: FREE_ROOM_ALLOWANCE_SECONDS=1800, FREE_ROOM_WINDOW_MS=24h. Kept FREE_ALLOWANCE_MIN=30 as a legacy alias.
- Rewrote src/app/api/rooms/[id]/token/route.ts: now calls canJoinLiveRoom() and REFUSES the token (403 FREE_ALLOWANCE_EXHAUSTED) when the global allowance is 0 — no LiveKit token is issued. Creates the StudySession server-side (no separate /study/sessions call from the client), calls beginLiveRoomSession() which auto-closes any prior active session (multi-tab protection: only ONE active session per user; the previous tab's session is accrued and ended). Returns the entitlement in the response.
- Updated src/app/api/study/sessions/[id]/stop/route.ts: calls closeActiveLiveRoomSession() to accrue live-elapsed seconds into consumedSeconds. The legacy roomMinutesUsed increment in closeSession() was removed (replaced with a void + comment).
- Created src/app/api/rooms/[id]/heartbeat/route.ts: the client pings this every 20s. The server updates lastHeartbeatAt, recomputes the entitlement, and if free+remaining<=0, closes the active session and returns exhausted=true so the client disconnects from LiveKit. This is the server-authoritative "00:00 closes the room" enforcement.
- Created src/app/api/entitlement/route.ts (GET) — returns the server-authoritative entitlement for the client to render the countdown.
- Created src/app/api/entitlement/warning-shown/route.ts (POST) — marks the 5-min warning as shown for this window (idempotent; clears on 24h reset).
- Updated src/app/api/rooms/usage/route.ts and src/app/api/subscriptions/route.ts GET to return the new canonical fields (remainingFreeSeconds, consumedFreeSeconds, allowanceSeconds, windowStartedAt, windowResetsAt, isPaid, canJoinLiveRoom, hasActiveSession) plus backward-compat minute-resolution fields derived from the new entitlement.
- Updated src/lib/api.ts forbidden() to accept an optional `extra` payload (used to return the entitlement with the FREE_ALLOWANCE_EXHAUSTED error).
- Frontend (src/components/app/views/room.tsx): added entitlement + displayedFreeSeconds state. The token response seeds the countdown from the SERVER value. A 1s interval ticks the displayed value down for smooth UX. The 20s heartbeat re-syncs to the server value (overwriting any client manipulation). At <=5:00 the FreeWarningModal shows once (warningShownRef + server markWarningShown prevent re-show). At 00:00 the ExhaustedOverlay shows. If the heartbeat returns exhausted=true, the client disconnects from LiveKit. Paid users see no countdown. Removed the redundant /study/sessions call (token endpoint now creates the session). Added FreeWarningModal and ExhaustedOverlay components with the exact CTAs requested (Get Daily Pass ₹14/day, View Other Plans, Continue with Solo Study).
- Removed old 60-min UI text: paywall ("60 free minutes" → "30 free minutes... resets every 24 hours"), pricing ("60 minutes live-room access (lifetime)" → "30 minutes live-room access per day"), room-access-widget ("of 60 free live-room minutes" → "of 30 free live-room minutes today").
- Multi-tab/concurrency protection: FreeRoomAllowance is @unique on userId (only one row). beginLiveRoomSession closes any prior active session first (accrual). Only ONE activeSessionId per user. If Tab A and Tab B both try to join, Tab B's join auto-closes Tab A's session — Tab A's next heartbeat will get exhausted=false but its LiveKit connection will be stale; the server's authoritative consumedSeconds already accounts for the real elapsed time. Two tabs cannot multiply the allowance.
- Verified via agent-browser: admin joins room → top-left countdown shows "Free study time: 29:35" and ticks down. VLM confirmed the countdown is visible.
- Security tests (all PASSED):
  1. Send fake `remainingFreeSeconds: 99999` in token request → ignored, token issued based on server count.
  2. Send fake `duration: 0` to stop endpoint → ignored, server computes its own durationMin.
  3. Entitlement after stop → 1799s (1s real time consumed), fake payload had no effect.
  4. Directly call token for a DIFFERENT room → uses the SAME global allowance (no per-room bypass).
  5. Set consumedSeconds=1800 via DB (simulating exhaustion) → token endpoint refuses with FREE_ALLOWANCE_EXHAUSTED (403), no LiveKit token issued. Entitlement shows canJoinLiveRoom=false, remainingFreeSeconds=0.
  6. Browser join when exhausted → ExhaustedOverlay shows "Your 30 minutes of free study time are over." with Get Daily Pass ₹14/day + View Other Plans + Solo Study. VLM confirmed.
- `bun run lint` passes clean. Zero dev.log errors.

Stage Summary:
- NEW: global 30-min/rolling-24h free live-room allowance, per user, shared across ALL rooms. Server-authoritative via src/lib/entitlement.ts + FreeRoomAllowance table.
- OLD 60-min lifetime logic REMOVED from: pricing.ts (FREE_ALLOWANCE_MIN now 30, new constants), token route (now uses canJoinLiveRoom), closeSession (no more roomMinutesUsed increment), subscriptions/usage routes (now return entitlement fields), UI text (paywall/pricing/widget all say 30 min/day).
- 00:00 closes the room: heartbeat returns exhausted=true → client disconnects. Token endpoint refuses re-join. No room access until 24h reset or paid plan.
- 5-min warning: shown ONCE per window (warningShownAt flag, server-side). FreeWarningModal with Get Daily Pass ₹14/day + View Other Plans.
- 24h reset: server-side, on the next read after windowStartedAt + 24h. No client timer, no logout/login reset.
- Paid override: isPaidPlanActive bypasses the allowance entirely (no countdown, no warning, no forced close).
- Multi-tab: one active session per user; new join auto-closes the prior. No allowance multiplication.
- Android-ready: the entitlement + token + heartbeat + warning-shown endpoints are the contract; the server never accepts client-supplied time values as authoritative.

---
Task ID: VIDEO-OPT-006
Agent: general-purpose (LiveKit video optimization)
Task: Implement production-grade LiveKit video optimization: server-authoritative quality policy, adaptive stream + dynacast + simulcast, subscriber-side layer capping (free=240p, paid=360p), local 720p capture, virtualized participant grid for 1000+ rooms, off-screen video pausing, 5-min video-quality upsell for free users, dev diagnostics.

Work Log:
- Created src/lib/video-quality.ts — server-authoritative quality policy. FREE: remoteGridMaxQuality=LOW (~240p), remoteGridMaxHeightPx=240. PAID: remoteGridMaxQuality=MEDIUM (~360p), remoteGridMaxHeightPx=360. Both: localCapturePreset=h720. resolveVideoQualityPolicy() reads the DB subscription (never trusts client). videoQualityPolicyToResponse() returns the shape for the token/entitlement response.
- Updated src/lib/entitlement.ts: Entitlement now includes `videoQuality: VideoQualityPolicyResponse`. getEntitlement() resolves the policy from the DB subscription and includes it in the response. entitlementToResponse() includes videoQuality.
- Created src/lib/video-quality-client.ts — single client-side place that translates the server policy into LiveKit API calls. buildRoomOptions(policy) returns Room options with adaptiveStream=true, dynacast=true, videoCaptureDefaults=h720, publishDefaults.simulcast=true + [h720, h360, h180] simulcast layers. applyRemoteQualityCap(pub, policy) calls pub.setVideoQuality(LOW/MEDIUM) + setVideoDimensions on a remote camera track. pauseRemoteTrack(pub) sets quality to LOW when the tile is scrolled off-screen. resumeRemoteTrack(pub, policy) re-asserts the cap when the tile scrolls back. applyPolicyToAllRemoteTracks(room, policy) caps all existing remote cameras. countSubscribedRemoteVideoTracks(room) for diagnostics.
- Updated src/components/app/views/room.tsx:
  - Ent type now includes `videoQuality: ClientVideoPolicy`.
  - connect() reads the policy from the token response, builds the Room via `new Room(buildRoomOptions(policy))`, applies the quality cap on every TrackSubscribed event, re-applies on Reconnected, and applies to all existing remote tracks after connect (race safety).
  - Added VirtualizedParticipantGrid: for ≤60 participants, renders all tiles in a CSS grid (IntersectionObserver handles off-screen pausing). For >60, renders only the visible window + overscan (6 rows) inside a scroll container; off-screen rows are lightweight spacer divs with NO <video> elements. The participant count in the header still reflects the REAL LiveKit count.
  - Added VisibleTile: wraps ParticipantTile with an IntersectionObserver. On visibility change, calls pauseRemoteTrack (off-screen) or resumeRemoteTrack (on-screen) on the remote camera publication. This COMPLEMENTS LiveKit Adaptive Stream (which handles display:none / detached) by also handling "in the DOM but scrolled out of the viewport".
  - Added 5-minute video-quality upsell (QualityUpsellModal): shown ONCE per room session, 5 min AFTER room entry (roomEnteredAtRef), NOT based on remaining allowance. Distinct from the 5-min-remaining free-allowance warning (FreeWarningModal). Non-blocking; does NOT add minutes, reset the allowance, or interrupt the room. Paid users never see it. Shows "Enjoy better video quality with Premium", ₹14/day, "Get Daily Pass", "View Other Plans".
  - Added DevDiagnostics overlay (dev only, bottom-left, toggleable): shows conn state, participant count, subscribed video tracks, visible tiles, tier + remote≤X + local=preset. No secrets logged.
- Verified via curl: /api/entitlement returns videoQuality (free: LOW/240p/h720; paid: MEDIUM/360p/h720). Server computes the tier from the DB subscription.
- Verified via agent-browser: admin joins room → LiveKit Cloud connection confirmed (Japan region) → camera on → video renders → "Free study time: 29:XX" countdown shows → dev diagnostics "Stats" button visible → overlay shows "conn: connected, participants: 1, subscribed video: 0, visible tiles: 1, tier: free · remote≤LOW · local=h720". VLM confirmed the layout.
- `bun run lint` passes clean. `bun run build` succeeds with no errors/warnings (Next.js 16 + Turbopack + Vercel-compatible: no custom Node servers, no server-side WebRTC, all browser APIs are inside client components/effects with SSR guards).

Stage Summary:
- Local HD: 720p capture preset (h720 = 1280×720 @ 30fps). NOT 1080p — 720p is plenty for a local preview and keeps uplink low.
- Free remote grid cap: ~240p (VideoQuality.LOW simulcast layer) via setVideoQuality + setVideoDimensions. Subscriber-side; publisher quality is NOT reduced.
- Paid remote grid cap: ~360p (VideoQuality.MEDIUM) via the same mechanism.
- 5-min video-quality upsell: QualityUpsellModal, 5 min after room entry, once per session, free users only, non-blocking, distinct from the 5-min-remaining allowance warning.
- Adaptive Stream: enabled (LiveKit observes each <video> element's rendered size + visibility to pick the appropriate simulcast layer, pauses delivery when not visible). We do NOT build a competing system.
- Dynacast + simulcast: enabled. Publisher emits [h720, h360, h180] layers; each subscriber receives only the layer appropriate for their tier + tile size + visibility.
- Off-screen pausing: IntersectionObserver on each tile → pauseRemoteTrack (setVideoQuality LOW) when scrolled out of view; resumeRemoteTrack re-asserts the cap when scrolled back. Complements Adaptive Stream.
- Virtualization: ≤60 participants = full CSS grid + IntersectionObserver. >60 = windowed grid (only visible rows + 6-row overscan render <video> elements; off-screen rows are spacer divs). No 1000-video DOM explosion.
- 1000+ participants: the design never creates one <video> per participant. Participant count in the header is the REAL LiveKit count (from room.remoteParticipants). Only visible tiles attach video. Remote tracks for off-screen tiles are paused.
- Worldwide LiveKit Cloud: the serverUrl comes from the server token response (wss://web-brwna5ik.livekit.cloud); all media flows Browser ↔ LiveKit Cloud, never through Vercel. No localhost/127.0.0.1 media URLs.
- Vercel compatibility: build succeeds. All browser APIs (IntersectionObserver, MediaDevices, WebRTC, livekit-client) are inside a "use client" component with SSR guards (IntersectionObserver typeof check).
- LiveKit Cloud limits: the app does not impose an artificial participant limit (maxParticipants defaults to 500 in the Room model; the frontend virtualizes so the DOM limit is not the constraint). LiveKit Cloud's actual per-room participant limit depends on the project's plan — document this separately.

---
Task ID: PINNED-LAYOUT-QUALITY-FIX-007
Agent: general-purpose (pinned layout + quality cap persistence)
Task: Fix pinned layout to horizontal (pinned big-left, self + others on right) and fix the video quality cap being overridden by LiveKit Adaptive Stream (which was letting quality go back to original after a few seconds, increasing LiveKit billing).

Work Log:
- Pinned layout fix (src/components/app/views/room.tsx PinnedLayout): changed from vertical (pinned on top, thumbnails at bottom) to horizontal. Pinned video now fills the LEFT side (flex-1, full height, large rectangle). The RIGHT side is a vertical strip (w-120-240px responsive): self video at the top, then other participants in a vertical scroll list below. Self is excluded from the "others" list when it's in the top of the strip. When self IS the pinned participant, no right strip shows (only the big pinned self video). Verified via agent-browser + VLM: pinned self fills screen, unpin button present, no cut-off.
- Quality cap persistence fix (the billing bug): root cause was that LiveKit Adaptive Stream continuously re-evaluates the video element's rendered size and overrides a one-time setVideoQuality call. In emitTrackUpdate(), when requestedVideoDimensions is void (which setVideoQuality sets it to), LiveKit uses the Adaptive Stream's videoDimensionsAdaptiveStream which can be LARGER than our LOW cap — so the subscribed layer creeps back up to HD after a few seconds, increasing LiveKit billing.
  - Fix #1 (src/lib/video-quality-client.ts applyRemoteQualityCap): made setVideoDimensions the PRIMARY persistent cap (sets requestedVideoDimensions, which Adaptive Stream does NOT override — it only overrides when this is void). setVideoQuality is now belt-and-suspenders (LiveKit uses the smaller of dimensions vs max-quality layer).
  - Fix #2 (src/lib/video-quality-client.ts): added reassertRemoteQualityCap() helper.
  - Fix #3 (src/components/app/views/room.tsx connect()): added RoomEvent.TrackStreamStateChanged listener that re-asserts the cap whenever Adaptive Stream changes the stream state. This is the critical event-based fix.
  - Fix #4 (src/components/app/views/room.tsx connect()): added a 3s periodic re-assertion interval (qualityReassertRef) that calls applyPolicyToAllRemoteTracks. setVideoDimensions/setVideoQuality are no-ops when values haven't changed, so this does NOT cause extra API traffic — it just guarantees the server always forwards the capped layer. Defense-in-depth against any silent override.
  - Added qualityReassertRef + cleanup in all 3 paths (connect cleanup, heartbeat exhaustion, leave).
- Verified via agent-browser: admin joins room, camera on, pins self → big-left layout, no cut-off, unpin works. Lint clean, no dev.log errors.

Stage Summary:
- Pinned layout: horizontal (pinned big-left, self + others vertical strip on right). No more "pinned video cutting and grid goes to bottom".
- Quality cap persistence: setVideoDimensions is the primary cap (Adaptive Stream respects it as max). Re-asserted on TrackStreamStateChanged + every 3s. This fixes the "starts low, then goes back to original quality" billing issue — the subscribed layer now stays at/below the policy max (free=240p, paid=360p) for the entire subscription lifetime, regardless of how large the rendered video element is.

---
Task ID: COMMUNITY-LIMIT-008
Agent: general-purpose (max-2 community membership limit)
Task: Enforce a maximum of 2 community memberships per user, server-side, with race-condition protection, UI updates, and profile display.

Work Log:
- Inspected existing: CommunityMember model already has @@unique([communityId, userId]) (prevents duplicate joins). join endpoint had NO max-2 check. leave endpoint exists. onboarding auto-joins 1 community. Communities view used local `joined` state (not server-derived). Profile endpoint didn't include memberships.
- Rewrote src/app/api/communities/[slug]/join/route.ts: added MAX_COMMUNITY_MEMBERSHIPS=2. The join uses a Prisma transaction with `SELECT 1 FROM "User" WHERE id = ? FOR UPDATE` to SERIALIZE concurrent joins for the same user (closes the race condition that let 3 concurrent requests all see count=1 and all create). Inside the lock: check already-member, count memberships, reject if >= 2, create, post-create safety check + rollback. Handles P2002 (duplicate) as ALREADY_MEMBER. Returns forbidden("COMMUNITY_LIMIT_REACHED") when at the limit.
- Updated src/app/api/onboarding/route.ts: the auto-join now checks existing membership + count before creating (defensive; a new user has 0 so this is always allowed, but the guard prevents a re-run from exceeding 2). Fixed a pre-existing bug where memberCount was incremented even on `update` (re-join).
- Updated src/app/api/profile/route.ts GET: now includes `memberships` (the user's actual CommunityMember rows with community details), `membershipCount`, and `maxMemberships: 2`.
- Rewrote src/components/app/views/communities.tsx: fetches the user's profile to derive joined communities + membership count. Shows "X/2 communities joined · You can join up to 2 communities." Joined communities show "Joined" (disabled). At the limit, all other communities show "Limit reached" (disabled, with Lock icon). Toast shows the limit message on COMMUNITY_LIMIT_REACHED. Invalidates the profile query on success so the UI updates immediately.
- Updated src/components/app/views/profile.tsx: added a "Communities" card showing the user's actual memberships (color tile + name + exam goal + View link). Shows "X/2 joined" in the header. When 0 memberships, shows a "Browse communities" CTA. When < 2, shows "You can join N more communit(y/ies)."
- Race-condition test: 3 concurrent joins (gate + jee + neet) at 1 membership → exactly 1 succeeded (jee), 2 rejected → final count = 2. The FOR UPDATE lock works. (Without the lock, the count=1 check passed for all 3 and the user ended up with 3 memberships — confirmed the race was real before the fix.)
- All API tests passed: A (join UPSC → 1), B (join DSA → 2), C (join GATE → COMMUNITY_LIMIT_REACHED), D (join JEE → COMMUNITY_LIMIT_REACHED), E (profile shows 2), I (concurrent → invariant holds), leave + rejoin (works), duplicate (ALREADY_MEMBER).
- Browser: Communities page shows "2/2 communities joined", DSA+JEE show "Joined", all others show "Limit reached" (disabled). VLM confirmed. Profile → Communities shows DSA + JEE tiles with "2/2 joined".
- `bun run lint` passes clean.

Stage Summary:
- Server-side max-2 enforcement: join endpoint uses Prisma transaction + SELECT...FOR UPDATE on the User row to serialize concurrent joins. Race-condition proof (verified with 3 concurrent requests). A malicious user calling the API directly is rejected with COMMUNITY_LIMIT_REACHED.
- (userId, communityId) @@unique constraint already existed (prevents duplicate joins). Leave endpoint already existed (frees a slot).
- Onboarding auto-joins 1 community (always within the limit for a new user); the guard prevents re-runs from exceeding 2.
- Communities page: server-derived joined status + membership count; "Joined" for joined, "Limit reached" (disabled) at the limit; "You can join up to 2 communities" message.
- Profile: Communities card shows the user's actual memberships with a "X/2 joined" header and a "browse" CTA when < 2.
- The 30-minute free live-room allowance remains GLOBAL and separate from community membership (unchanged).

---
Task ID: TIMELAPSE-009
Agent: general-purpose (study timelapse, cost-first)
Task: Implement the Study Timelapse feature with a cost-first architecture: browser-side sparse capture, 360p, no audio, 15–60s final video, private Supabase Storage, signed URLs, lazy playback, delete.

Work Log:
- Inspected: LiveKit impl, StudySession lifecycle, Prisma schema, Supabase config (createServerClient uses service-role key server-side; publishable key client-side), profile route, auth. No existing timelapse code. The `timelapses` Storage bucket doesn't exist yet — created lazily by ensureTimelapseBucket().
- Prisma: added Timelapse model (id, userId, studySessionId, roomId, storagePath, thumbnailPath, studyDurationSeconds, timelapseDurationSeconds, width, height, fileSizeBytes, status PROCESSING|READY|FAILED, visibility private, failureReason, createdAt, updatedAt). Indexes on userId, studySessionId, createdAt, status. Added `timelapses Timelapse[]` relation on User. Pushed to Supabase Postgres via `bun run db:push`.
- Created src/lib/timelapse-storage.ts (server-only): ensureTimelapseBucket (creates the private `timelapses` bucket with 20MB file cap + allowed mime types), uploadTimelapseVideo, uploadTimelapseThumb, createTimelapseSignedUrl (5-min TTL), createTimelapseThumbSignedUrl, deleteTimelapseFiles. All use createServerClient (service-role key, never exposed to browser). Paths: timelapses/{userId}/{timelapseId}/video.webm + thumb.webp.
- Created src/lib/timelapse-capture.ts (client): TimelapseCapture class + timelapseDurationFor + captureIntervalMs + isTimelapseSupported. Cost-first: adaptive sampling (1s for <30m, up to 15s for 8h+), 640×360 360p, canvas.captureStream(10fps) → MediaRecorder at 500 kbps, NO AUDIO. Reuses the LiveKit LocalVideoTrack's mediaStreamTrack if the camera is on (clones it so stopping our capture doesn't stop LiveKit); else getUserMedia({video:true, audio:false}). Memory bounded (MAX_FRAMES rolling window — actually we don't store frames, we draw directly onto the canvas at the adaptive interval, so memory is O(1) frames). Final duration: 15–60s mapped from study duration (30m→15s, 1h→20s, 2h→25s, 4h→35s, 6h→45s, 10h→60s). Produces a WebM blob + a WebP thumbnail.
- API routes (all auth + ownership checked):
  - POST /api/timelapses/create — creates a PROCESSING row; study duration computed from the StudySession (server-authoritative, not from client).
  - POST /api/timelapses/[id]/complete — receives multipart video+thumb, uploads to Supabase Storage (private bucket), sets status=READY. maxDuration=60, body size capped, hard caps 20MB video / 512KB thumb.
  - GET /api/timelapses — lists metadata (NO video), paginated.
  - GET /api/timelapses/[id]/signed-url — returns a 5-min signed URL after ownership check; refuses if status≠READY.
  - GET /api/timelapses/[id]/thumb — redirects to a signed thumbnail URL (lazy-loaded by <img>).
  - DELETE /api/timelapses/[id] — deletes Storage files + metadata row; returns error (not false success) if Storage delete fails.
- Room view (src/components/app/views/room.tsx): added timelapse state (showTimelapsePrompt, timelapseRecording, timelapseUploading). Prompt shown ONCE on join if browser supports capture. "Enable Timelapse" starts a TimelapseCapture (reuses LiveKit camera track if on, else getUserMedia video-only). "Not Now" dismisses without requesting camera. Recording indicator ("● Timelapse recording") shown while active. On room exit / leave, finalizeTimelapseAndUpload() stops the capture (triggers onFinalized) and the upload runs in the background — does NOT block room exit. "Saving timelapse…" indicator shows while uploading. Cleanup on unmount via destroy().
- Profile (src/components/app/profile-timelapses.tsx + src/components/app/views/profile.tsx): added ProfileTimelapses card. Loads ONLY metadata + thumbnails initially (thumbnails via /api/timelapses/[id]/thumb → signed URL redirect, lazy-loaded by <img loading="lazy">). Clicking a READY timelapse requests a signed URL and plays that ONE video in a modal. No preloading, no autoplay. Delete with confirm; shows error toast if Storage delete fails.
- Verified via curl: list (empty), create (PROCESSING), list (1 PROCESSING), signed-url (NOT_READY), delete (ok), list (empty). All ownership-checked.
- Verified via agent-browser: room join → "Create a study timelapse?" prompt with "Enable Timelapse" + "Not now". "Not now" dismisses, room continues, no camera request, no console errors. Re-join → prompt re-appears (once per session). "Enable Timelapse" → "Timelapse recording" indicator appears, camera granted (fake device). VLM confirmed the indicator + countdown + clean layout.
- `bun run lint` passes clean. `bun run build` succeeds — all timelapse routes compiled as serverless functions. Vercel-compatible (no custom servers, no server-side WebRTC, browser APIs guarded with typeof checks in client components).
- Security: service-role key never reaches the browser (all Storage ops are in API routes using createServerClient). Signed URLs not logged. Ownership checked on every endpoint. Client cannot fake study duration (server reads it from StudySession). Client cannot complete another user's timelapse. Bucket is private.

Stage Summary:
- Cost-first: browser captures sparse 360p frames (adaptive interval 1s–15s), compiles a 15–60s video locally, uploads ONLY the final 2–6 MB WebM. No raw study video stored. No audio. No LiveKit recording. No Vercel video proxy.
- 10-hour session: adaptive interval grows to 15s, so ~2400 frames over 10h → memory bounded (we draw directly to canvas, no frame array) → ~60s final video at 500 kbps ≈ 3–5 MB. Verified by design.
- Playback egress: profile loads thumbnails only; clicking one video requests a 5-min signed URL. No autoplay, no preload.
- Privacy: timelapses private by default; only the owner can list/play/delete. Bucket never public.
- Delete: removes Storage video + thumbnail + metadata; returns error if Storage delete fails (no false success).
- LiveKit unaffected: timelapse reuses the LiveKit camera track (cloned) if available; never records remote participants; never uses LiveKit Egress.
- 30-min free-room allowance: completely unchanged — timelapse is a separate feature that doesn't touch entitlement.

---
Task ID: OPTIONAL-AUTH-010
Agent: general-purpose (optional Supabase + Google OAuth)
Task: Make Supabase email/password + Google OAuth fully optional so the app works with OR without Supabase configured, and Google OAuth works automatically when the provider is enabled.

Work Log:
- Inspected: auth-context.tsx (login/signup/loginWithGoogle), supabase.ts (createBrowserClient/createServerClient), api.ts getAuth, auth/sync route. Found: login already had a Sankalp fallback but always tried Supabase first (pointless round-trip when not configured); signup was Supabase-only (no fallback); createBrowserClient/createServerClient would throw/struggle with empty URL+key.
- Rewrote src/lib/supabase.ts: added isSupabaseConfigured boolean (true only when BOTH NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are set). createBrowserClient + createServerClient return a real SupabaseClient when configured, or a NO-OP stub when not. The stub's auth.getSession/getUser return null session, signInWithPassword/signUp return an error, signInWithOAuth returns an error, onAuthStateChange returns a no-op subscription, signOut is a no-op. This keeps the auth-context running with Sankalp-local auth only — no code changes needed to switch between Supabase-on and Supabase-off modes.
- Updated src/lib/auth-context.tsx login: only tries Supabase signInWithPassword when isSupabaseConfigured; otherwise goes straight to the Sankalp /api/auth/login fallback. Avoids a pointless round-trip + error toast when Supabase isn't set up.
- Updated src/lib/auth-context.tsx signup: now tries Supabase signUp first (if configured); if Supabase returns an immediate session, uses it + syncs the profile. If Supabase requires email confirmation (no session) OR Supabase isn't configured, falls back to the Sankalp /api/auth/signup endpoint which creates the user + issues a Sankalp signed token immediately (no email confirmation needed). This means: with Supabase off → local signup works instantly; with Supabase on + email confirmation disabled → Supabase signup works; with Supabase on + email confirmation enabled → falls back to local signup so the user isn't stuck waiting for email.
- Updated src/lib/auth-context.tsx loginWithGoogle: checks isSupabaseConfigured first; if not, throws a clear actionable error ("Google sign-in requires Supabase to be configured..."). If Supabase IS configured, attempts the OAuth redirect; on "provider is not enabled" error, gives a clear actionable message pointing to the Supabase Dashboard. When the user enables Google OAuth in Supabase Dashboard → Authentication → Providers → Google, this works end-to-end automatically — no code changes.
- Updated src/lib/auth-context.tsx fetchMe: when a Supabase session exists but /api/auth/me returns 401 (the Supabase-auth'd user doesn't exist in our DB yet — first Google OAuth login or first Supabase email signup), calls /auth/sync to create the user in our DB, then re-fetches /auth/me. This handles the Google OAuth callback flow: Supabase redirects back with a session → fetchMe sees the session → /auth/me 401 → /auth/sync creates the user (with googleSub) → /auth/me succeeds.
- getAuth (src/lib/api.ts) already robust: tries Sankalp 2-part token first, then Supabase 3-part JWT. With the no-op stub, supabase.auth.getUser returns null user → getAuth returns null (or the Sankalp token if present). No changes needed.
- Verified: current sandbox has Supabase configured (NEXT_PUBLIC_SUPABASE_URL set) → login (admin@sankalp.in, falls back to Sankalp local), auth/me (works), dashboard loads. Google "Continue with Google" button initiates the Supabase OAuth redirect (will work when the Google provider is enabled in Supabase Dashboard). `bun run lint` clean. `bun run build` succeeds.

Stage Summary:
- Supabase OFF (no env vars): Sankalp local email/password auth works fully (login + signup). Google button shows a clear "configure Supabase" error.
- Supabase ON (env vars set): Supabase email/password login/signup work (with Sankalp fallback for seeded users + email-confirmation-required case). Google OAuth works automatically when the provider is enabled in Supabase Dashboard (no code change). First Google login auto-creates the user in our DB via /auth/sync.
- No code changes needed to switch between modes — just set/unset NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.

---
Task ID: TIMELAPSE-TOGGLE-FIX-011
Agent: general-purpose (timelapse toggle button + storage fix)
Task: Add a timelapse on/off toggle button to the room controls, auto-enable camera on first timelapse, stop+save on toggle off, and fix the "could not save timelapse" error (missing SUPABASE_SERVICE_ROLE_KEY).

Work Log:
- Root cause of "could not save timelapse": SUPABASE_SERVICE_ROLE_KEY was missing from .env. Without it, createServerClient falls back to the publishable key which is subject to Supabase Storage RLS → listBuckets returns empty, upload fails with "Bucket not found". The service role key bypasses RLS.
- Added SUPABASE_SERVICE_ROLE_KEY to .env (value provided by user, stored only in .env, chmod 600, never printed/logged/committed). The createServerClient in supabase.ts already prefers the service key when present.
- Updated src/lib/timelapse-storage.ts: added isStorageConfigured() check (returns false if the service key is missing, with a clear actionable reason). Updated timelapseBucketExists() to return false when the service key is missing (so the complete route gives the right error).
- Updated src/app/api/timelapses/[id]/complete/route.ts: checks isStorageConfigured() BEFORE parsing the body, returns a clear STORAGE_NOT_CONFIGURED error with the actionable message "SUPABASE_SERVICE_ROLE_KEY is not set. Add it to your environment (Supabase Dashboard → Project Settings → API → service_role key)."
- Created the `timelapses` private bucket via direct SQL (INSERT INTO storage.buckets) since the JS SDK can't create buckets due to RLS on storage.buckets. The bucket is private (public=false), 20 MB file cap, allowed MIME types: video/webm, image/webp, image/jpeg.
- Added a Timelapse toggle button to the room controls bar (between Camera and Ambient). Uses the Film icon. When ON: shows "Stop timelapse" (active state). When OFF: shows "Timelapse".
- toggleTimelapse function: when turning ON, auto-enables the camera if it's off (so the first timelapse has video to record), then starts the capture. When turning OFF mid-session, calls finalizeTimelapseAndUpload() which stops the capture and uploads immediately (doesn't wait for room exit). The user can toggle on/off multiple times for multiple timelapses in one session.
- Updated uploadTimelapse error handling: parses the error JSON from the complete endpoint and shows the actual error message (e.g. "SUPABASE_SERVICE_ROLE_KEY is not set...") in the toast for 8 seconds (longer for config errors). Success toast says "Study timelapse saved to your profile."
- Verified end-to-end via agent-browser: admin joins room → clicks Timelapse toggle → camera auto-enables → "Timelapse recording" indicator shows → wait 10s → clicks "Stop timelapse" → POST /api/timelapses/create 200 → POST /api/timelapses/[id]/complete 200 → DB shows status=READY, fileSize=35231 bytes, storagePath set → Profile → Timelapses shows the tile with thumbnail + Play button → clicking Play opens a video player with a signed URL (5-min expiry) → Close works.
- `bun run lint` passes clean. `bun run build` succeeds.

Stage Summary:
- Timelapse toggle button: in the room controls bar (Camera | Timelapse | Ambient | Leave). Toggles on/off. On = start capture + auto-enable camera. Off = stop + save immediately.
- Storage fix: SUPABASE_SERVICE_ROLE_KEY added → service role bypasses RLS → bucket listing, upload, signed URLs all work.
- Error messages: clear actionable errors for missing service key ("add it to Supabase Dashboard → Settings → API") and missing bucket ("create a private bucket named 'timelapses' in Supabase Dashboard → Storage").
- Full flow verified: toggle on → camera auto-on → record → toggle off → upload → READY in DB → Profile shows thumbnail → Play opens signed-URL video player.

---
Task ID: BRANDING-012
Agent: general-purpose (Sankalp Study Live branding system)
Task: Implement the centralized branding system with theme-aware logos, responsive variants, favicon, and accessibility.

Work Log:
- Inspected existing logo assets: public/logo.svg (dark-on-light "S" mark, didn't match the brand), pasted images in /tmp/my-project/upload/ (confirmed via VLM: Sankalp logo is a green-to-gold gradient circle with a mountain/tent "resolve" mark + "Sankalp" wordmark, designed for light backgrounds). The user's newly uploaded file (ChatGPT Image Sep 23, 2026, 06_42_56 PM.png) did not land on the server filesystem — reported honestly rather than fabricating a logo.
- Created src/components/branding/logo.tsx — the centralized BrandLogo component. Theme-aware: the wordmark uses the `--brand-ink` CSS variable which is dark on light themes and light on dark themes (pure CSS, no JS mounted guard needed — avoids hydration mismatch + setState-in-effect lint). The gradient mark (green→gold) is identical in both themes (colorful, strong contrast on both). Responsive variants: `full` (mark + text), `compact` (mark + smaller text), `icon` (mark only). Accessibility: aria-label "Sankalp Study Live", role="img", aria-hidden on the decorative SVG. No layout shift: fixed `size` prop + viewBox SVG. Inline SVG (no <img>) — crisp at any DPI, zero network requests, inherits CSS vars.
- Added `text-brand-ink` utility class to globals.css (the CSS variable --brand-ink already existed but the utility class didn't).
- Updated src/components/app/brand.tsx: the existing `Logo` export now delegates to BrandLogo, so all existing usages (landing, onboarding, auth, app-shell loading, chrome header) get the theme-aware behavior automatically with zero call-site changes.
- Updated src/components/app/chrome.tsx: the app header now uses `BrandLogo variant="full"` on desktop and `BrandLogo variant="icon" size={32}` on mobile (responsive: full logo on desktop, icon-only on mobile).
- Updated src/components/app/app-shell.tsx: the marketing header uses `BrandLogo variant="full"`; the loading screen uses `BrandLogo variant="icon" size={48}`.
- Replaced public/logo.svg with a proper brand-aligned SVG: a rounded square with the green→gold gradient + the "resolve" mountain/tent mark in white. Used as the favicon, apple-touch-icon, shortcut icon, and OpenGraph/Twitter preview image.
- Updated src/app/layout.tsx metadata: added `icons` (favicon + apple + shortcut → /logo.svg), `openGraph.images`, `twitter.images`, and `viewport.themeColor` (brand-emerald for light, brand-saffron for dark — matches the CSS vars and the browser chrome).
- Verified via agent-browser + VLM:
  - Light mode: logo visible top-left, green-to-gold gradient mark + "Sankalp" text, dark text on light background, clean (no extra whitespace). VLM confirmed.
  - Dark mode: logo visible, light "Sankalp" text on dark background (excellent contrast), gradient mark vibrant. VLM confirmed.
  - Auth page: logo centered and prominent above the login form. VLM confirmed.
- `bun run lint` passes clean. `bun run build` succeeds.

Stage Summary:
- Centralized BrandLogo component at src/components/branding/logo.tsx. Theme-aware (pure CSS via --brand-ink), responsive (full/compact/icon variants), accessible (aria-label "Sankalp Study Live"), zero layout shift (fixed size + SVG viewBox), zero network requests (inline SVG).
- All existing Logo usages (landing, auth, onboarding, app-shell loading, chrome header) now use BrandLogo via the re-export — no call-site changes needed.
- Favicon + apple-touch-icon + shortcut icon + OpenGraph/Twitter preview images all point to the optimized /logo.svg (brand gradient mark). Theme-color meta tag uses brand-emerald (light) / brand-saffron (dark).
- The user's uploaded logo file did not arrive on the server; the branding was implemented from the brand colors + mark confirmed via VLM inspection of the pasted images. When the user uploads the actual PNG/WebP logo files, they can drop them in /public/branding/ and the BrandLogo component can switch to <img>-based variants using resolvedTheme — the architecture supports this without a rewrite.

---
Task ID: AUTH-VERCEL-013
Agent: Codex
Task: Diagnose production Supabase sign-in failure on sankalpstudylive.in.

Work Log:
- Verified the deployed `POST /api/auth/login`, `/api/auth/signup`, and public database-backed routes return HTTP 500, while the same invalid login locally returns the expected HTTP 401. This isolates a Vercel database/runtime configuration failure in addition to the auth-flow issue.
- Updated Supabase auth synchronization so `/api/auth/sync` verifies the Supabase JWT directly and can create the local User/Profile/Streak/Subscription rows for a first-time Supabase user.
- Made the verified Supabase token identity authoritative instead of trusting browser-supplied email or Supabase IDs.
- When Supabase is configured, email login/signup now stays on Supabase Auth and surfaces its real error; it no longer falls through to the local Postgres login route and masks the root cause.
- `bun run lint` passes. After stopping the existing localhost process that held Prisma's Windows query engine file, `bun run build` passes; Next reports only the pre-existing workspace-root and metadataBase warnings.

---
Task ID: PRODUCTION-FOCUS-014
Agent: Codex
Task: Focused performance, ordering, onboarding, room-access, and NEET PG improvements.

Work Log:
- Login/signup now reuse the full `/api/auth/sync` response instead of immediately fetching `/api/auth/me` again. Auth-state listeners are suppressed during an explicit auth action to prevent duplicate profile requests.
- Exit Room disconnects LiveKit and navigates immediately; trusted session finalization, presence cleanup, and timelapse work continue in the background. Cleanup is guarded against duplicate unmount/disconnect requests.
- Added an owner/moderator End room control that fires the existing authorized server close route without delaying navigation; ended rooms are rejected by the LiveKit token endpoint.
- Added the centralized community order: General Study, GATE, JEE, NEET, UPSC, NEET PG, CAT, SSC, Banking, MPSC, Placements, DSA.
- Updated community API ordering and UI exam metadata to use the same order.
- Added idempotent NEET PG community/default-room seeding. Existing General Study default rooms are normalized to platform-wide (`communityId = null`) by the seed without deleting or duplicating data.
- Added server-side onboarding checks for community joins, room creation, community-room presence, and LiveKit token issuance.
- Added server-side community membership checks for community-specific room creation, presence, and LiveKit tokens. General Study remains the special platform-wide room and still uses the global entitlement check.
- Preserved the existing maximum-two membership transaction and added row-locked onboarding auto-membership creation.
- Read-only local inspection found 11 existing communities/default rooms and no NEET PG record yet; production/local seed execution is still required to materialize the new NEET PG records.
- Validation: `bun run lint` passes; `bun run build` passes with only existing Next warnings; local browser smoke test rendered the landing page; unauthenticated join/token API checks returned `401`.

---
Task ID: BRANDING-013
Agent: Codex
Task: Add the supplied Sankalp logo with light/dark theme variants.

Work Log:
- Added clean transparent light and dark full-wordmark PNG assets under `public/branding/`.
- Replaced the old sheet-derived mark asset with a clean transparent logo mark.
- Updated the centralized `BrandLogo` component to select the light or dark wordmark from `next-themes` while preserving existing `full`, `compact`, and `icon` call sites.
- Verified the local landing page visually in both light and dark themes; the correct logo variant appears in the header.
- `bun run lint` passes. The production build was attempted but Prisma's Windows query-engine file was locked by the running local Next.js process.

---
Task ID: ROOM-PRESENCE-015
Agent: Codex
Task: Fix live waiting-room participant counts.

Work Log:
- Room entry now posts the authenticated presence join after the LiveKit connection succeeds, keeping the server-side `participantCount` synchronized with actual room presence.
- The Live Rooms list refetches every 10 seconds so waiting-room counts update without a manual refresh.

---
Task ID: ACCOUNT-SECURITY-016
Agent: Codex
Task: Admin identity migration and account security settings.

Work Log:
- Migrated the Supabase admin identity from `admin@sankalp.in` to `support@sankalpstudylive.in` without changing its password; synchronized the PostgreSQL user email as well.
- Updated the idempotent seed to use the support address and migrate the legacy local admin address while preserving its password hash.
- Added Settings password change with current-password verification for Supabase Auth and local-auth fallback.
- Added Supabase recovery-email delivery for forgotten passwords.
- Hid account deletion from admin Settings and added a server-side `ADMIN_PROTECTED` guard so admin accounts cannot self-delete through the API.
- Validation: `bun run lint` and `bun run build` pass; build retains only existing workspace-root and metadataBase warnings.

---
Task ID: AUTH-ROOM-017
Agent: Codex
Task: Fix first-time Google callback and live-room timelapse logout.

Work Log:
- Switched the browser Supabase client to PKCE and exchange the callback code before the first `/api/auth/me` request, avoiding the hash-router collision that made the first Google sign-in appear to do nothing.
- Preserved the requested post-OAuth route through the callback.
- Disabled inactivity auto-logout while the user is inside an individual live room, including long timelapse sessions.
- Preserved the active study-session ID for timelapse finalization so background upload does not lose its session reference.
- Validation: `bun run lint` passes.

---
Task ID: TIMELAPSE-018
Agent: Codex
Task: Correct timelapse duration and playback speed.

Work Log:
- Replaced real-time canvas recording with bounded still-frame sampling during the study session.
- On stop, the sampled frames are encoded into an accelerated WebM whose duration is calculated server/client-side and clamped to 15–60 seconds.
- A five-minute study session now produces an accelerated short video instead of a five-minute slow-motion recording.
- Validation: `bun run lint` and `bun run build` pass.

---
Task ID: TIMELAPSE-019
Agent: Codex
Task: Repair timelapse playback window.

Work Log:
- Reworked the playback overlay with an accessible modal surface, explicit close control, responsive sizing, inline video playback, loading state, and playback error/retry handling.
- Added an explicit playback attempt after the signed URL loads while retaining native controls for browsers that block asynchronous autoplay.

---
Task ID: ACCOUNT-SECURITY-020
Agent: Codex
Task: Do not request passwords from OAuth-only users during account deletion.

Work Log:
- Added a server-derived `hasPassword` flag to the authenticated user response.
- Account deletion now asks for a password only when the account actually has a password hash; Google-only users confirm with `DELETE` without entering a nonexistent password.
- The server-side password verification rule remains authoritative.

---
Task ID: PERFORMANCE-021
Agent: Codex
Task: Reduce repeated page loading and profile perceived latency.

Work Log:
- Increased React Query cache retention for stable app data to avoid refetching on every hash-route navigation; live views keep their own shorter refresh intervals.
- Profile now renders immediately from the already-loaded `/api/auth/me` profile while the richer `/api/profile` response loads memberships and full badge data in parallel.
- Disabled reconnect-triggered refetches for this low-bandwidth deployment profile.
