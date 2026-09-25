# Worklog

## 2026-09-25

- Hardened the server-authoritative 30-minute rolling free live-room allowance. The
  per-user allowance row is now a conditional database admission lock: only one
  concurrent tab/device can claim an active live-room session, and a competing
  join receives `LIVE_ROOM_ALREADY_ACTIVE` instead of replacing the first session.
  Window rollover no longer clears an active session; pre-window usage expires and
  post-window usage is measured from the server reset boundary. Heartbeats now
  update only the matching active room/session, preventing stale requests from
  reviving a closed session.
- Validation: `bunx tsc --noEmit`, `bun run lint`, and `bun test` all passed (6/6).
- Final verification closed two admission races: `/rooms/[id]/token` now refuses
  free users with an active session before issuing a LiveKit credential, and leave/
  heartbeat requests must identify the current session id so stale tabs cannot
  finalize or refresh a newer session. Authenticated HTTP tests covered persisted
  five-minute usage, relogin, concurrent admission, exhaustion, General Study and
  community rooms, 24-hour rollover, paid bypass, and solo Pomodoro non-consumption.
- Confirmed with an authenticated temporary free account that a solo Pomodoro
  session leaves `consumedFreeSeconds` unchanged (`0` before and after). Temporary
  test users were deleted and the test room was restored after verification.
- End-to-end near-cap verification found and fixed a heartbeat mismatch: the
  client interval is 20 seconds but the server stale timeout was 10 seconds,
  causing the second heartbeat to close a healthy room at 20 seconds. The
  server now uses a 45-second heartbeat timeout/grace. Re-test: seeded 1770
  seconds, joined General Study, heartbeats reached 0 with
  `FREE_ALLOWANCE_EXHAUSTED`, and both General Study and a community token
  request returned 403 with no token after leave/reload.
- Ran the final real-browser concurrent-session verification with two tabs and
  one temporary free account. Restored 20 free-user allowance rows to 1800
  seconds without changing 9 paid users; Tab A connected to General Study and
  displayed 30:00, while Tab B received HTTP 403 `LIVE_ROOM_ALREADY_ACTIVE`
  with no token. Tab A stayed connected for 35 seconds with heartbeats, then
  left; Tab B joined successfully afterward. Fresh reload and logout/login
  preserved the remaining allowance. General and community token checks used
  the same global remaining seconds, and solo Pomodoro left allowance usage
  unchanged. Temporary user and room state were cleaned up.
- Restored the two default rooms accidentally left with `isLive=false` during
  test cleanup (General Study Focus Room and GATE Focus Room). Both now have
  `isLive=true`, `isListed=true`, and no ended timestamp; authenticated token
  verification returned HTTP 200 for General Study instead of `ROOM_ENDED`.
- Repaired one stale free-user allowance left by an interrupted room exit:
  `jiocloud011@gmail.com` had a 79-second-old heartbeat, no matching active
  study session, and an orphaned `activeSessionId`. Finalized the server-capped
  45 seconds, cleared the active fields, and confirmed zero active allowance
  rows remain.

- Removed the unverified “As featured in” media claim and publication names
  from the landing page.

- Fixed Google OAuth callback routing for both Log in and Sign up: first-time
  Google users now go directly to onboarding after the Supabase account is
  synced, while completed users still return to their original destination.
- Fixed slow/stale onboarding completion by applying the authoritative profile
  returned by `PATCH /api/onboarding` directly to auth state instead of issuing
  a second `/auth/me` request. This removes the need to open a room before the
  welcome/dashboard transition is recognized.

- Fixed study timelapse saving on room exit by waiting for encoding and the authenticated upload before navigating away; the server session is stopped first so timelapse duration remains authoritative.
- Removed the timelapse-only 360p/500 kbps restriction. Capture now preserves the camera track's native dimensions and records with the browser's native MediaRecorder quality, storing the dimensions with the completed row.
- Updated timelapse duration mapping to 1–60 seconds based on server-computed study duration and increased the private storage/upload safety ceiling for HD files.
- Added three-attempt upload retry handling and exposed the actual server/storage error in the UI instead of masking it with a generic save failure.
- Fixed the one-minute "Invalid study session" failure by creating/uploading the timelapse before closing the study session; sub-minute session cleanup can otherwise delete the source row first.
- Made timelapse creation resilient to stale client session IDs by resolving the latest authenticated user's room session server-side; invalid client references no longer block saving.
- Changed the global free live-room allowance reset from 34 hours to 24 hours. Token issuance, presence joining, and the post-close recheck remain server-enforced; exhausted users are blocked and directed to purchase a pass.
- Fixed free-time accounting on reload/leave: clean server closes now charge the full session duration, while heartbeat-loss recovery still uses the last-heartbeat timeout cap. This prevents users from resetting the 30-minute allowance by closing or reloading the site.
- Simplified timelapse generation: it now continuously records the native camera stream and builds the saved video by seeking through that recording at accelerated positions, producing a true fast-forward video instead of sparse-frame slideshow output.
- Fixed the profile streak calendar to load timezone-aware data for one selected month at a time, with previous/next month arrows and the future-month navigation disabled.
- Updated live-room participant rendering: up to 8 participants stay in a responsive two-row grid; 9+ use a four-column scrollable/windowed grid, with off-screen remote tracks explicitly unsubscribed and resumed on scroll using the grid as the visibility root.
- Replaced the test badge catalog with realistic production milestones for study hours, streaks, daily goals, deep work, live-room participation, and hosting; added server-side award rules and reconciled the local database seed to remove obsolete test badges.
- Fixed continuous timelapse encoding for browsers that omit WebM duration metadata by falling back to the measured recording time; encoder errors now also clear the saving indicator.
- Added a server-side stale live-session reaper before token and presence access checks, preventing reloads or closed tabs from obtaining a fresh free-room session while old time is still active.
- Initialized the global free-room allowance during password signup and Supabase auth sync. The 30-minute allowance now starts at account creation, is shared across all rooms and devices, and is only refreshed by the server after the 24-hour window expires.
- Added an idempotent seed backfill for existing accounts; it creates missing allowance rows without overwriting usage or restarting an existing free window. Legacy users are also backfilled automatically by auth sync/entitlement checks.

- Fixed Tailwind v4 CSS resolution so the app no longer depends on a parent `Desktop` working directory; global styles now reference the repository's installed Tailwind and animation CSS files.
- Verified `bun run dev`: `/` returned HTTP 200 and `/api/health` returned HTTP 200 without compilation errors.
- Verified `bun run build`: Prisma generation, production compilation, TypeScript, static pages, and all routes completed successfully.
- Final checks: `bun test` passed 6/6, `bunx tsc --noEmit` passed, and lint passed after removing its configuration warning.

## 2026-09-24

- Completed repository-wide validation: added core regression tests, fixed compile/type inconsistencies across admin, room, payment, study, and UI code, enabled strict Next.js type validation, and configured canonical metadataBase.
- Validation completed: 6 regression tests pass, lint passes, TypeScript passes, production Next.js build passes, and local GET /api/health returned HTTP 200. The wrapper build's Prisma generate step remains sensitive to a Windows query-engine file lock when another Next process is running.
- Fixed stale live-room counts: discovery, community details, room lists, and room details now count only non-left members with a recent heartbeat instead of trusting stale isLive/participantCount snapshots.

## 2026-09-25

- Added the server-owned finalized study-session summary API at `/api/study/sessions/[id]/summary`. It validates the authenticated owner, requires `endedAt`, reads the persisted StudySession, and reports server-backed daily totals, goal progress, XP, and streak data. Unavailable participant/Pomodoro metrics are intentionally omitted.
- Added the responsive emerald/amber `SessionSummaryView` at `/session-summary/[sessionId]` with loading/error states, session-saved confirmation, finalized timestamps, room/type context, daily progress, and Study Again/Pomodoro/Dashboard actions.
- Updated End Session to wait for the idempotent server stop endpoint before navigating. Stop failures remain retryable and do not show a fabricated summary; successful finalization navigates to the owned summary page.
- Fixed instant-exit summary failures: sub-minute sessions are now finalized and retained at 0 minutes (without XP, streak, or goal credit) instead of being deleted, and timelapse encoding/upload no longer blocks server finalization or summary navigation.
- Verification: `bunx tsc --noEmit`, `bun run lint`, and `bun test` all passed (6/6 tests). Authenticated API smoke test created a temporary user/session, finalized a backdated 2-minute session, verified summary duration/today total matched the persisted session, verified the second stop returned `alreadyStopped` without duplicate XP, verified a different authenticated user received HTTP 404/`NOT_FOUND`, and removed only the temporary `codex-*` test users afterward.
- Fast-exit API test finalized a session in under a minute with HTTP 200 and `durationMin: 0`, then loaded its summary immediately with HTTP 200; the temporary test user was removed.
- Reduced live-room exit latency: the stop endpoint now returns after the authoritative StudySession claim, while allowance accrual and XP/streak/goal/badge work run in Next's post-response task. The room navigates immediately after firing finalization, and the summary retries briefly while that commit completes. Authenticated stop timing improved from approximately 7 seconds to approximately 1.6 seconds; UI navigation no longer waits for the request.
- Updated Session Summary session details to display dates as `DD/MM/YYYY` and timestamps as `DD/MM/YYYY, HH:MM`.
- Corrected dashboard study totals: today's goal progress, goal history, weekly completion, and lifetime "Total studied" now derive from finalized `StudySession.durationMin` records, combining solo and live-room sessions and ignoring stale counter drift.
- Accuracy verification with a temporary account: one finalized minute returned `goalAchieved=1` and `totalMinutes=1`. No shared users were reset because localhost uses the configured shared Supabase Postgres host, not an isolated local database.
- Validation: TypeScript, lint, 6/6 tests, and production build passed after stopping the local dev process that had locked Prisma's Windows query engine.
- Hardened daily/weekly/session-summary date bucketing around local midnight by filtering finalized sessions through the user timezone instead of UTC-midnight ranges. Re-ran TypeScript, lint, 6/6 tests, and production build successfully.
- Authorized study-state reset completed across all 29 users: 151 StudySessions, 9 Timelapse metadata rows, 31 UserBadge awards, and 0 leaderboard snapshots were cleared; all 29 profiles now have 0 minutes, 0 XP, level 1, and 0 legacy room minutes; all goals have 0 achieved minutes; all streaks are reset; and all live allowances have 0 consumed seconds with no active session. Users, authentication, subscriptions (29), payments (38), rooms, and communities were preserved.
- Added database-backed weekly leaderboard fixtures using all 29 existing users via `scripts/seed-weekly-leaderboard.ts`. Fixtures live only in `LeaderboardSnapshot(scope=global_demo, period=weekly)` and do not affect study totals, goals, XP, streaks, or badges. The global weekly API merges real finalized sessions dynamically, so logged-in users' real activity changes their ranking. API verification returned 10 ranked database users; TypeScript, lint, 6/6 tests, and production build passed.

- Fixed free live-room enforcement: the 30-minute allowance now resets after 34 hours, the presence join cannot bypass the token gate, and a final-session close is rechecked before a new room session starts. Exhausted users are blocked server-side and shown a pass link.

- Diagnosed Razorpay live-payment failure: the local environment is using an `rzp_test_` key, while live order creation requires matching `rzp_live_` credentials configured in Vercel Production and a redeploy. The order API does not use the website URL when creating orders.

- Created the native Expo/React Native Android project under `/app`; website source files were not imported or modified.
- Added secure token persistence, API-contract client targeting the existing website origin `https://www.sankalpstudylive.in/api`, onboarding, dashboard, communities, rooms, study/Pomodoro, profile/avatar picker, friends, leaderboard, notifications, settings, pricing, theme switching, and LiveKit room integration.
- Added native LiveKit WebRTC and companion WebRTC dependency; configured camera/microphone permissions, adaptive stream, dynacast, and release resource shrinking/minification settings.
- TypeScript check passes. Expo prebuild passes. Expo Doctor could not run because the bundled local CLI rejects its config command.
- Release compilation reached native LiveKit and JS bundle tasks; a subsequent build was interrupted while still compiling and needs one final uninterrupted run.
