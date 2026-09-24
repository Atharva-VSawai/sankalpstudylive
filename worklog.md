# Worklog

## 2026-09-25

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
