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
- docs/security.md (153 lines): AuthN/AuthZ layered model (Supabase JWT + RBAC + per-resource ownership + Supabase RLS); Supabase key discipline (anon public, service-role server-only, LiveKit/SESSION_SECRET server-only); rate-limit table (signup 10/min, login 10/min, room token 20/min, message 30/min — sandbox sliding window vs production Redis token bucket); input validation (manual in sandbox, Pydantic in prod) with the explicit list of fields NEVER accepted from the client (duration, xp, streak, level, badges, payment.status, report.status); secure HTTP headers table + concrete CSP allowing LiveKit wss:// + Supabase + PostHog + Sentry; CORS (web origin only + Android pinned app scheme); secret management; safe logging rules + AuditLog table; LiveKit security (server-side minting, 6h TTL, per-user identity, scoped grants canPublish/canSubscribe/canPublishData, mic defaults OFF, capacity enforcement, random unguessable room names); reporting & moderation flow (reports → mod queue → warning/mute/kick/ban with audit trail); privacy (email never in public profile, blocked users cannot interact); threat-model checklist table covering forgery, token theft, CSRF, brute-force, account enumeration, privilege escalation, service-key leak, malicious tokens, room abuse, PII leak, admin abuse.
- Verified all 5 files land in the 150–400 line target range (database.md runs longer at 526 because the spec demanded full DDL for 19 tables plus indexes plus RLS plus migrations — content density justified).
- Did NOT modify any code, schema, or other agent's docs. Only created the 5 required files and appended this worklog entry.

Stage Summary:
- 5 production-grade architecture docs delivered at the exact required paths: docs/architecture.md, docs/database.md, docs/api.md, docs/authentication.md, docs/security.md.
- Every claim grounded in the actual codebase (Prisma schema + 50+ Next.js API route handlers + 8 lib modules + seed).
- Production target (FastAPI + PG/Supabase + Redis + LiveKit) and sandbox reality (Next.js API routes + Prisma/SQLite + in-memory presence + simulated LiveKit JWT) are documented as 1:1 mappable so the future Android agent can consume docs/api.md as a binding contract per AGENTS.md.
- Trust boundaries from AGENTS.md §3 are enforced everywhere: server computes study duration/XP/streaks/badges; client never submits these; service-role and LiveKit secrets never shipped to clients.
- Ready for the next agent (DOC-B for livekit/analytics/deployment/mobile-contract, or downstream feature work) to consume these docs as the architectural source of truth.

---

Task ID: DOC-B
Agent: general-purpose (docs)
Task: Write the LiveKit + analytics + deployment + mobile-contract docs and the project README (5 production-grade files).

Work Log:
- Read AGENTS.md (Android reuse rule, trust boundaries), prisma/schema.prisma (all models + enums), worklog.md (current status).
- Browsed every route under src/app/api/** to extract the real request/response shapes, error codes, side effects, and analytics events.
- Read src/app/api/rooms/[id]/token/route.ts (LiveKit token issuer), src/app/api/rooms/[id]/events/route.ts (SSE stream), src/lib/presence.ts (in-memory presence/timer/chat store), src/lib/study.ts (XP/streak/badge engine), src/lib/auth.ts (session token), src/lib/me.ts, prisma/seed.ts (demo logins + seeded communities/badges).
- Created docs/ directory (did not exist).
- Wrote docs/livekit.md (428 lines): token flow + JWT shape, sandbox vs production signing, media defaults (mic/cam OFF on join), active-speaker, reconnect, moderation, capacity, performance/rendering rules, room lifecycle, shared timer contract, chat, security, end-to-end Android join sequence.
- Wrote docs/analytics.md (522 lines): canonical 22-event vocabulary with property schemas + trigger points + where each fires (server vs client), identity/alias flow, activation + D1/D7/D30 retention definitions, core funnel, PostHog integration (server posthog-python + client posthog-js + posthog-android), Sentry wiring with release tagging, privacy rules (no PII), naming/evolution rules, dashboards.
- Wrote docs/deployment.md (447 lines): components table (sandbox vs production), Next.js/Vercel build + env vars (public + server-only), FastAPI on Railway/Render/AWS with uvicorn/gunicorn, Supabase Postgres (pgbouncer-pooled for app, direct for migrations, RLS), Upstash Redis (presence/ratelimit/leaderboard/pubsub), LiveKit Cloud setup + CORS + TLS, Supabase Storage buckets + signed upload flow, Resend transactional email, GitHub Actions CI/CD (lint, typecheck, migrate, deploy), monitoring (Sentry + PostHog + Uptime), scaling notes (architectural, not load-tested), sandbox note, mobile note pointing to AGENTS.md.
- Wrote docs/mobile-contract.md (2103 lines): the binding contract. §0 permanent Android-reuse rule (restated from AGENTS.md). §1 base URL + transport + Bearer JWT auth + UUIDs + ISO-8601 UTC. §2 error envelope + 14 canonical error codes + status codes (note on 400 vs 429 for RATE_LIMITED). §3 pagination. §4 exhaustive enum list (user.role, user.status, communityMember.role, roomMember.role, friendship.status, report.reason/status/resolution, subscription.plan/status, studySession.mode, timer.mode, badge.tier, notification.type, payment.status/provider, referral.status, userDevice.platform, examGoal). §5 every endpoint (~45 routes) with method, path, auth scope, request schema, response schema, error codes, example request + example response JSON, side effects, analytics events fired — covering auth, onboarding, communities, rooms (list/create/get/patch/delete/token/presence get-post-patch/messages get-post/events SSE/timer/members patch-delete), study (sessions post-get/stop/goals today get-patch/goals/streak/badges), leaderboard, friends (get/post/patch/delete), blocks (post/delete), reports (post/get), profile (get/patch/by-username), search, notifications (get/patch-all/patch-one), subscriptions (get/post), referrals (get), admin (stats/users/user-patch/reports-patch/rooms-patch/communities-post-patch), health, plus reserved POST /api/user-devices for push. §6 LiveKit token flow with exact SDK call (room.connect(url, token)), mic/cam defaults via setMicrophoneEnabled/setCameraEnabled, ROOM_FULL handling, TTL 6h, active-speaker guidance. §7 realtime channel (SSE transport, event types presence/message/timer/history with full payload shapes, 20s heartbeat + 45s reap window). §8 timezones + streak rules (first/yesterday/today/gap>1) + Android never submits durations. §9 push notifications (device registration reserved + GET /api/notifications source of truth + FCM as optimization). §10 versioning & compatibility (unversioned today, /api/v2 on breaking changes, 6-month deprecation policy). §11 Android QA checklist (~140 checkboxes covering auth, onboarding, communities, rooms, LiveKit token+connect, presence+SSE, timer, chat, study engine, leaderboard, social, reports, notifications, subscriptions, profile+search, admin, health, end-to-end study room flow).
- Wrote README.md: project intro paragraph, feature list (bullets), tech stack (production target + sandbox runtime), repo structure (key folders + file-by-file map), quick start (bun install → db:push → seed → dev), demo logins table (admin@sankalp.in/admin123 + 7 demo users), docs index linking to architecture/database/api/authentication/security/livekit/analytics/deployment/mobile-contract + AGENTS.md, the Android rule callout, status/known limitations (LiveKit placeholder secret, in-memory presence, SQLite, signed session token, simulated payments, no-op analytics, no Sentry, no FCM yet, performance targets are architectural not load-tested).
- Verified line counts: livekit 428, analytics 522, deployment 447, mobile-contract 2103, README ~190.
- Did NOT modify any code; did NOT create any files outside the 5 required.
- mobile-contract.md came in longer than the 400–700 line guideline because covering every endpoint with request AND response examples (per the task spec) plus the QA checklist and the 10 non-endpoint contract sections exceeded that range; prioritized the spec's "exhaustive and precise" requirement over the line target.

Stage Summary:
- Created 5 production-grade documentation files exactly at the requested paths.
- All endpoint shapes, error codes, enums, and side effects are derived from the actual code in src/app/api/** and src/lib/** — not invented.
- The Android binding contract (docs/mobile-contract.md) is the single source of truth for the future Android developer and reuses the exact API surface implemented in this sandbox.
- The AGENTS.md "Android app must reuse this backend" rule is restated in both README.md and docs/mobile-contract.md §0.
- docs/livekit.md, docs/analytics.md, and docs/deployment.md each document their layer with sandbox-vs-production callouts so the swap is mechanical.
- README.md documents quick start, demo logins, and known sandbox limitations so a new contributor can run the project in 4 commands.
- Next actions for the next agent: read docs/mobile-contract.md before any API change; run `bun run lint` (not run by this agent since no code was modified); keep the API contract stable for Android.

---
Task ID: MAIN-1
Agent: main (Z.ai Code)
Task: Build the full Sankalp platform — schema, API, frontend, docs, self-verify

Work Log:
- Inspected repo (Next.js 16 + Prisma/SQLite + shadcn/ui New York). Wrote AGENTS.md + worklog.
- Designed full Prisma schema with 24 entities (User, Profile, AuthSession, Community, CommunityMember, Room, RoomMember, StudySession, DailyGoal, Streak, Badge, UserBadge, LeaderboardSnapshot, Friendship, Block, Report, RoomMessage, Notification, Subscription, Payment, UserDevice, Referral, AuditLog) — UUIDs, indexes, constraints, soft-enum strings. Pushed to SQLite, generated client.
- Seeded 11 communities (GATE/JEE/NEET/UPSC/CAT/SSC/Banking/MPSC/Placements/DSA/General Study), 12 badges, 8 demo accounts (admin + 7 users).
- Built lib: auth (signed HMAC session token, PBKDF2-ish hashing), api (getAuth/RBAC helpers), ratelimit (sliding window), presence (in-memory room state: participants/chat/timer + pub/sub), study (server-authoritative XP/streak/goals/badges, timezone-aware streaks), me helper.
- Built 45+ API routes under /api/* mirroring the FastAPI contract: auth (signup/login/google-demo/me), onboarding, communities (list/detail/join/leave), rooms (list/create/detail/token/presence/messages/events-SSE/timer/members), study (sessions start+stop, goals today+history, streak, badges), leaderboard (global/community/friends × daily/weekly/monthly/alltime), friends (list/request/accept/decline), blocks, reports, notifications, profile (own+public), search, subscriptions, referrals, admin (stats/users/communities/rooms/reports), health.
- Built the SPA shell on the single / route: hash-based RouterProvider context (fixed a dual-instance bug where navigate in one useRouter didn't update AppShell), emerald+saffron theme (globals.css), AppHeader/AppSidebar/MobileNav/Footer, theme toggle, command palette.
- Built all 25 views: Landing (hero, live rooms, communities, how-it-works, stats, exam categories, FAQ, CTA), Auth (login/signup with demo accounts + Google demo), Onboarding (4-step), Communities, CommunityDetail, Rooms (+create dialog), Room (live study room: simulated LiveKit tile grid, SSE presence/chat/timer, mic/cam toggles, Pomodoro, study start/stop), Dashboard (streak/level/goal chart/leaderboard/badges/sessions), Study (solo Pomodoro with chime), Leaderboard (podium + scope/period), Friends (search/requests/accept), Notifications, Profile (own, 14-day chart, badges, referral), PublicProfile (friend/block/report), Settings, Pricing (INR), Legal (privacy/terms/guidelines), Admin (dashboard/users/communities/rooms/reports/analytics).
- Wrote full docs via two parallel subagents (DOC-A: architecture/database/api/authentication/security; DOC-B: livekit/analytics/deployment/mobile-contract/README). mobile-contract.md is the binding Android contract (2103 lines, every endpoint + LiveKit token flow + SSE channel + streak rules + QA checklist).
- Ran lint (clean after fixing JSX-key, set-state-in-effect, refs-in-render, unused disables).
- Self-verified end-to-end with agent-browser: landing ✓, signup→onboarding ✓, login→dashboard ✓ (stat cards, weekly chart, leaderboard), communities ✓, community detail ✓, rooms + create ✓, live room view ✓ (participants, chat, timer, mic/cam, study start), solo study ✓, leaderboard ✓, friends ✓, notifications ✓, public profile ✓ (friend/block/report), admin ✓ (all 6 sections). Fixed two real bugs during verification: (1) router dual-instance → switched to RouterProvider context; (2) /api/profile/[username] included `badges` on Profile instead of User → moved to user.badges.

Stage Summary:
- App is fully runnable: `bun run dev` → http://localhost:3000. Demo logins: admin@sankalp.in/admin123, aarav@sankalp.in/demo1234 (see README).
- All 13 documented flows render and interact correctly in the browser. No console/runtime errors.
- Lint clean. Schema pushed + seeded.
- docs/ contains: architecture, database, api, authentication, security, livekit, analytics, deployment, mobile-contract. AGENTS.md + README.md written.
- Sandbox simulations clearly documented (LiveKit token = real HS256 JWT shape signed with placeholder secret; Redis presence = in-memory; Postgres = SQLite). Production swap is drop-in per docs.
- Performance targets are architectural only (not load-tested) — stated honestly in docs and on the landing page.

Unresolved / Next-phase priorities (for the recurring webDevReview cron):
- Real LiveKit Cloud credentials + livekit-server-sdk swap (token endpoint already mints the right JWT shape).
- Real Supabase Auth + Google OAuth (replace signed session token; /auth/google-demo → real redirect).
- Real Redis for presence (currently in-memory per process — won't share across multiple instances).
- WebSocket gateway mini-service for room events (SSE works for one instance; multi-instance needs Redis pub/sub).
- PostHog + Sentry wiring (trackEvent is a no-op stub today).
- More micro-interactions / polish: room reactions (emoji), screen-share, friend invite to room, push notifications (FCM), streak freeze, weekly recap email.
- E2E tests (Playwright) for the golden path — not written (instructions: no test code required, but documented as next step).

---
Task ID: CRON-1
Agent: webDevReview cron (round 1)
Task: QA the platform, fix bugs, add features + styling polish

Work Log:
- Read worklog.md (full project history). Platform was stable from MAIN-1.
- Ran comprehensive QA in a single command (sandbox kills bg dev servers between commands): all 44 API routes return 200, all 18 views render with correct H1s, zero console errors, login/room/study flows work. No bugs found in the existing surface.
- Added 3 new features + 2 styling improvements:

  1. Room emoji reactions (NEW)
     - Schema/lib: added `sendReaction` + `listReactions` to src/lib/presence.ts (ephemeral, last-30 buffer for late joiners).
     - API: POST /api/rooms/[id]/reactions (10 allowed emoji: 🔥👏💪🙏💡✨🚀❤️🧠🎯), GET /api/rooms/[id]/reactions.
     - SSE: events stream now emits `reaction` events + a `reactions` snapshot on connect.
     - Frontend: room view has a Smile button that opens an emoji picker; reactions float up across the stage with a CSS keyframe animation (`float-up`). Also added a Share/Invite button that copies the room link.

  2. Activity heatmap (NEW) — GitHub-style contribution graph
     - API: GET /api/study/heatmap?weeks=N (timezone-aware, returns per-day minutes for last N weeks, default 12).
     - Component: src/components/app/activity-heatmap.tsx — 7-row grid, month labels, 6 intensity levels (bg-muted → bg-brand-emerald), today ring, hover scale, legend.
     - Placed on Dashboard (14 weeks) and Profile (20 weeks, below the 14-day bar chart).

  3. Streak freeze (NEW) — protect your streak on a missed day
     - Schema: added `freezesAvailable` (default 2), `freezesUsed`, `lastFreezeDate` to Streak model. Pushed with db:push.
     - Lib: updated `bumpStreak` in study.ts — if a user misses exactly 1 day and has a freeze available, consume it automatically and continue the streak. Added `activateFreeze` for proactive use.
     - Fixed a logic bug: check order in `activateFreeze` must be ALREADY_FROZEN_TODAY before ALREADY_STUDIED_TODAY (since activating sets lastStudyDate=today, the second call would wrongly hit ALREADY_STUDIED_TODAY).
     - API: POST /api/study/streak/freeze (activate), GET /api/study/streak/freeze (status). Updated GET /api/study/streak + loadMe to return freeze fields.
     - Component: src/components/app/streak-freeze-card.tsx — sky-themed card with snowflake icon, "X left" badge, activate button, "Frozen today" state. Placed on Dashboard.

  4. Landing testimonials section (STYLING)
     - Added a "Loved by aspirants" section with 3 illustrative persona cards (Aarav/Diya/Vihaan, star ratings, exam-colored avatars). Clearly labelled as illustrative personas (not real user quotes) to stay truthful per the original "do not fabricate statistics" rule.

  5. Notification filters (STYLING)
     - Added All / Unread filter tabs to the notifications view. Unread tab shows count badge + dedicated empty state ("No unread notifications. You're all caught up!"). Swapped to CheckCheck icon for mark-all.

- Updated auth-context Me type + me.ts helper to include freezesAvailable/freezesUsed/lastFreezeDate.
- Ran `bun run lint` → clean (0 errors, 0 warnings).

Verification (agent-browser + curl):
- /api/study/heatmap → 200 (84 days, activeDays + totalMinutes correct)
- /api/study/streak/freeze GET → 200; POST → 200 (freezesAvailable 2→1, freezesUsed 0→1)
- /api/rooms/[id]/reactions POST → 200 (returns reaction obj); GET → 200 (returns array)
- Dashboard: "HEATMAP PRESENT" + "FREEZE CARD PRESENT" ✓
- Room: "Send reaction" + "Share room" buttons present; emoji picker opens; 🔥 click sends reaction ✓
- Landing (scrolled): "TESTIMONIALS PRESENT" + "PERSONA 1 PRESENT" ✓
- Notifications: "FILTERS PRESENT"; Unread tab click → "No unread notifications" empty state ✓
- Profile: "PROFILE HEATMAP PRESENT" (Contribution graph, 20 weeks) ✓
- Zero console errors across all pages.

Stage Summary:
- Platform remains fully stable; all 13 documented flows still pass + 3 new features added.
- New API endpoints (reactions, heatmap, streak/freeze) are backward-compatible additions — the Android contract in docs/mobile-contract.md gains optional fields and new endpoints, nothing breaks.
- Lint clean. Schema pushed. All features browser-verified.

Unresolved / Next-phase priorities (for the next webDevReview round):
- Update docs/mobile-contract.md to document the 3 new endpoints (reactions, heatmap, streak/freeze) + the new streak.freeze fields. (Deferred to keep this round focused on code.)
- Real LiveKit/Supabase Auth/Redis swap (still sandbox-simulated).
- Friend invite-to-room: currently just a copied link; a proper "invite friend by username" flow with a notification + join button would be nicer.
- Room screen-share simulation (button + tile).
- Push notifications (FCM) + notification preferences in settings.
- Weekly recap email (Resend).
- Playwright E2E tests for the golden path.
- More micro-animations: confetti on badge earned, streak milestone celebration, room join/leave transitions.
