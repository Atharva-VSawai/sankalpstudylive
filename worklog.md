# Worklog

## 2026-09-25

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

- Fixed free live-room enforcement: the 30-minute allowance now resets after 34 hours, the presence join cannot bypass the token gate, and a final-session close is rechecked before a new room session starts. Exhausted users are blocked server-side and shown a pass link.

- Diagnosed Razorpay live-payment failure: the local environment is using an `rzp_test_` key, while live order creation requires matching `rzp_live_` credentials configured in Vercel Production and a redeploy. The order API does not use the website URL when creating orders.

- Created the native Expo/React Native Android project under `/app`; website source files were not imported or modified.
- Added secure token persistence, API-contract client targeting the existing website origin `https://www.sankalpstudylive.in/api`, onboarding, dashboard, communities, rooms, study/Pomodoro, profile/avatar picker, friends, leaderboard, notifications, settings, pricing, theme switching, and LiveKit room integration.
- Added native LiveKit WebRTC and companion WebRTC dependency; configured camera/microphone permissions, adaptive stream, dynacast, and release resource shrinking/minification settings.
- TypeScript check passes. Expo prebuild passes. Expo Doctor could not run because the bundled local CLI rejects its config command.
- Release compilation reached native LiveKit and JS bundle tasks; a subsequent build was interrupted while still compiling and needs one final uninterrupted run.
