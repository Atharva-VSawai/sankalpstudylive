# Sankalp — REST API

> Binding contract for the web SPA (this repo) and the future Android client.
> Source of truth is the Next.js route tree under `src/app/api/**`. The FastAPI production target mirrors these paths verbatim.

## 1. Conventions

- **Base path**: `/api`. Production FastAPI mounts the same paths under the app root.
- **Format**: JSON (`Content-Type: application/json`). SSE for live room events.
- **Auth**: `Authorization: Bearer <jwt>` on every protected endpoint. The sandbox uses a signed HMAC token (see `docs/authentication.md`); production uses Supabase Auth JWTs. **No code change in this contract.**
- **Pagination**: list endpoints accept `page` (1-indexed) and `limit` (capped per endpoint). Responses include `page`, `limit`, `total` for list endpoints that span many rows.
- **Error envelope**:
  ```json
  { "error": { "code": "BAD_REQUEST", "message": "…" } }
  ```
- **Status codes**: `200` success, `201` created (some endpoints return `200` with the created body — be tolerant), `400` bad request, `401` missing/invalid token, `403` forbidden (auth'd but not allowed), `404` not found, `429` rate limited, `500` server error.
- **Rate limits** (per-IP sliding window; Redis token bucket in production):
  - signup: 10/min
  - login: 10/min
  - room token: 20/min (server-imposed)
  - message send: 30/min (planned; room-scoped)

## 2. Endpoints by module

> Auth column: `public` (no token), `user` (any active account), `mod` (moderator or admin), `admin` (admin only).

### Auth

| Method | Path                       | Auth   | Request                                          | Response                                | Notes                                                     |
| ------ | -------------------------- | ------ | ------------------------------------------------ | --------------------------------------- | --------------------------------------------------------- |
| POST   | `/api/auth/signup`         | public | `{ email, password, referralCode? }`            | `{ token, user: Me }`                   | Rate-limited 10/min. Creates User, Profile, Streak, Subscription, own Referral. Email must include `@`; password ≥ 8 chars. |
| POST   | `/api/auth/login`          | public | `{ email, password }`                           | `{ token, user: Me }`                   | Rate-limited 10/min. Returns `401` for bad creds; `400 ACCOUNT_SUSPENDED` if `status !== 'active'`. |
| POST   | `/api/auth/google-demo`    | public | `{ email? }`                                    | `{ token, user: Me }`                   | Sandbox stand-in for Google OAuth. Production: Supabase Google provider redirect → JWT (no body). If `email` is new, creates an OAuth-only user (no password). |
| GET    | `/api/auth/me`             | user   | —                                                | `Me`                                    | Returns `{ id, email, role, status, profile, streak }`.    |
| (client) | `/api/auth/logout`       | user   | client deletes token from storage               | —                                       | No server endpoint in the sandbox; production adds `POST /api/auth/logout` to JTI-blacklist the JWT in Redis. |

`Me` shape (see `src/lib/me.ts`):
```json
{ "id": "uuid", "email": "user@example.com",
  "role": "user", "status": "active",
  "profile": { /* Profile fields */ },
  "streak": { "current": 3, "longest": 12, "lastStudyDate": "2025-01-01T00:00:00Z" } }
```

### Onboarding

| Method | Path              | Auth | Request                                                                                       | Response | Notes                                                                                                       |
| ------ | ----------------- | ---- | --------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------- |
| PATCH  | `/api/onboarding` | user | `{ displayName, username, examGoal, targetYear?, studyHoursGoal? }`                          | `Me`     | `examGoal` ∈ {GATE, JEE, NEET, UPSC, CAT, SSC, Banking, MPSC, Placements, DSA, General Study}. Auto-joins the matching community. Sets `emailVerifiedAt`. Username must be unique; 3+ chars `[a-z0-9_]`. |

### Communities

| Method | Path                              | Auth | Request            | Response                                            | Notes                                                        |
| ------ | --------------------------------- | ---- | ------------------ | --------------------------------------------------- | ------------------------------------------------------------ |
| GET    | `/api/communities`                | public | `?q=&featured=true`  | `{ communities: [{ id, slug, name, description, examGoal, color, iconUrl, memberCount, isFeatured, tags, liveRooms }] }` | Search by name/slug/description; optional featured filter. |
| GET    | `/api/communities/[slug]`         | public+ | —                | `{ community, rooms[], membership? }`                | `membership` only if authed. Returns up to 30 listed rooms ordered by `isLive desc, participantCount desc, createdAt desc`. |
| POST   | `/api/communities/[slug]/join`    | user | —                  | `{ joined: true }`                                  | Idempotent guard via unique `(communityId, userId)`. Increments `memberCount`. |
| POST   | `/api/communities/[slug]/leave`   | user | —                  | `{ left: true }` or `{ left: false, reason: "NOT_MEMBER" }` | Decrements `memberCount`.                                       |

### Rooms

| Method | Path                                  | Auth | Request                                                                                                                | Response                                                                                                | Notes                                                                                                                  |
| ------ | ------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/rooms`                          | public | `?communityId=&live=true&q=&page=&limit=` (limit ≤ 40)                                                                | `{ rooms[], page, limit, total }`                                                                       | Listed rooms only; ordered by `isLive desc, participantCount desc, createdAt desc`.                                   |
| POST   | `/api/rooms`                          | user | `{ name, description?, communitySlug?, isPrivate?, maxParticipants?, focusMode?, tags?, pomodoroConfig? }`            | `{ room }`                                                                                              | `maxParticipants` clamped 2..50. Creates `livekitRoom` name = `sankalp-<rand>`. Owner becomes a `host` RoomMember.       |
| GET    | `/api/rooms/[id]`                     | public | —                                                                                                                    | `{ room, participants[], timer }`                                                                       | `participants` come from the presence store (Redis in prod).                                                           |
| PATCH  | `/api/rooms/[id]`                     | user (owner/mod) | `{ name?, description?, isListed?, focusMode?, isLive?, maxParticipants?, tags? }`                          | `{ room }`                                                                                              | Owner or moderator only.                                                                                                 |
| DELETE | `/api/rooms/[id]`                     | user (owner/mod) | —                                                                                                          | `{ closed: true }`                                                                                      | Soft-closes the room: `isLive=false, isListed=false, endedAt=now()`.                                                   |
| POST   | `/api/rooms/[id]/token`              | user | `{ canPublish?, canPublishData? }`                                                                                     | `{ token, url, livekitRoom, identity, wsUrl }`                                                          | Returns a LiveKit JWT (HS256). 6h TTL. Enforces capacity (`maxParticipants`). Upserts RoomMember row.                    |
| GET    | `/api/rooms/[id]/presence`           | public | —                                                                                                                    | `{ participants: PresenceParticipant[] }`                                                               | Also reaps stale participants (lastSeen > 45s).                                                                          |
| POST   | `/api/rooms/[id]/presence`           | user | `{ action: "join"\|"heartbeat"\|"leave", micOn?, camOn? }`                                                              | join → `{ participant, count }`; heartbeat → `{ ok: true }`; leave → `{ left: true, remaining }`        | Heartbeats refresh `lastSeenAt`. `leave` updates RoomMember.`leftAt` and recomputes `participantCount`.                 |
| PATCH  | `/api/rooms/[id]/presence`           | user | `{ micOn?, camOn?, isSpeaking? }`                                                                                      | `{ participant }`                                                                                       | Updates presence fields.                                                                                                  |
| GET    | `/api/rooms/[id]/messages`           | public | `?limit=` (≤ 200)                                                                                                     | `{ messages[] }`                                                                                        | In-memory buffer (last 200 in sandbox; persisted rows in production with pruning).                                       |
| POST   | `/api/rooms/[id]/messages`           | user | `{ text }` (≤ 500 chars)                                                                                              | `{ message }`                                                                                           | Sender must be a RoomMember. Persists a `RoomMessage` row.                                                               |
| GET    | `/api/rooms/[id]/events`             | user (token via query) | `?token=`                                                                                  | SSE stream of `presence`, `history`, `message`, `timer` events                                         | Long-lived connection; 15s keep-alive comments. EventSource cannot set headers, hence query token.                       |
| POST   | `/api/rooms/[id]/timer`              | user (host/co-host) | `{ action: "start"\|"stop", mode?: "focus"\|"break", minutes? }`                                  | `{ timer }`                                                                                              | Only host/co-host (or owner) controls the shared timer. `minutes` clamped 1..180; defaults from `pomodoroConfig`.        |
| PATCH  | `/api/rooms/[id]/members/[userId]`   | user (host/mod) | `{ muted?, role? }`                                                                                          | `{ member: { userId, ...patch } }`                                                                       | Cannot change the owner's role. Posts a system message when muting.                                                       |
| DELETE | `/api/rooms/[id]/members/[userId]`   | user (host/mod) | —                                                                                                            | `{ kicked: true }`                                                                                      | Cannot kick the room owner. Removes from presence, marks `leftAt`.                                                        |

`PresenceParticipant`:
```json
{ "userId": "uuid", "username": "string", "displayName": "string", "avatarUrl": "string|null",
  "micOn": false, "camOn": false, "isSpeaking": false,
  "role": "host|co_host|participant|viewer",
  "joinedAt": 1730000000000, "lastSeenAt": 1730000000000 }
```

`timer`:
```json
{ "mode": "focus|break|idle", "endsAt": 1730000000000 | null,
  "round": 3, "focusMin": 25, "breakMin": 5, "startedBy": "uuid|null" }
```

### Study engine

| Method | Path                              | Auth | Request                                                            | Response                                                                 | Notes                                                                                                                                                                                  |
| ------ | --------------------------------- | ---- | ------------------------------------------------------------------ | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| POST   | `/api/study/sessions`             | user | `{ roomId?, communityId?, mode?: "focus"\|"pomodoro" }`            | `{ sessionId, startedAt }`                                               | Only one active (un-ended) session per user; if one exists it is auto-closed (server-computed duration, capped at `MAX_SESSION_MIN = 480`). If `roomId` is given, sender must be a RoomMember. |
| GET    | `/api/study/sessions`             | user | `?limit=` (≤ 100)                                                  | `{ sessions[] }`                                                         | Only completed (`endedAt != null`) sessions, newest first.                                                                                                                              |
| POST   | `/api/study/sessions/[id]/stop`   | user | —                                                                  | `{ stopped: true, durationMin, xpEarned, level, streak, goal, awardedBadges }` or `{ alreadyStopped: true, durationMin, xpEarned }` | Server computes duration as `now() - startedAt`. Sessions < 1 min are deleted (no XP, no streak). Awards XP, bumps streak & daily goal, evaluates badges, sends notifications for new badges. |
| GET    | `/api/study/goals/today`          | user | —                                                                  | `{ date, targetMin, achievedMin, completed, completedAt, streak }`       | Creates today's row if missing using `profile.studyHoursGoal`.                                                                                                                          |
| PATCH  | `/api/study/goals/today`          | user | `{ targetMin }` (15..1440)                                         | `{ goal }`                                                               | Updates both the profile's `studyHoursGoal` and today's row.                                                                                                                            |
| GET    | `/api/study/goals`                | user | —                                                                  | `{ goals[] }`                                                            | Last 14 days of goal history, ascending by date.                                                                                                                                       |
| GET    | `/api/study/streak`               | user | —                                                                  | `{ current, longest, lastStudyDate }`                                   |                                                                                                                                                                                          |
| GET    | `/api/study/badges`               | user | —                                                                  | `{ badges[] }` (each with `earned` + `awardedAt`)                       | Returns all defined badges with the caller's earned state.                                                                                                                              |

### Leaderboard

| Method | Path               | Auth           | Request                                                                                          | Response                          | Notes                                                                       |
| ------ | ------------------ | -------------- | ------------------------------------------------------------------------------------------------ | --------------------------------- | --------------------------------------------------------------------------- |
| GET    | `/api/leaderboard` | public (or user for `friends`) | `?scope=global\|community\|friends&communitySlug=&period=daily\|weekly\|monthly\|alltime&limit=` (≤ 100) | `{ scope, period, rows[] }`        | `friends` requires auth and includes the caller + accepted friends. Aggregates `study_sessions.durationMin` and `xpEarned` over the period window. Ranked by minutes desc, then XP desc. |

### Social

| Method | Path                | Auth | Request                                                       | Response                              | Notes                                                                                                  |
| ------ | ------------------- | ---- | ------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| GET    | `/api/friends`      | user | —                                                             | `{ friends[], incoming[], outgoing[] }` | Lists accepted friends, incoming pending requests, outgoing pending requests.                       |
| POST   | `/api/friends`     | user | `{ username }`                                                | `{ requested: true }`                 | Blocks either way → `400 BLOCKED`. `404` if user not found. `400 ALREADY_FRIENDS` / `PENDING`. Re-activates declined. Notifies target. |
| PATCH  | `/api/friends/[id]`| user | `{ action: "accept"\|"decline" }`                             | `{ status: "accepted"\|"declined" }`  | `[id]` is the `fromUserId` of the pending request. Notifies on accept.                                  |
| DELETE | `/api/friends/[id]`| user | —                                                             | `{ removed: true }`                   | Unfriend / cancel pending request in either direction.                                                  |
| POST   | `/api/blocks`      | user | `{ username }`                                                | `{ blocked: true }`                   | Also deletes any existing friendship in either direction.                                               |
| DELETE | `/api/blocks`      | user | `{ username }`                                                | `{ unblocked: true }`                 |                                                                                                          |
| POST   | `/api/reports`     | user | `{ reason, detail?, reportedUserId?, reportedRoomId?, reportedMessageId? }` | `{ report }` | `reason` ∈ {spam, harassment, cheating, nsfw, other}. At least one of the three reported* IDs required. Notifies all mods+admins. |
| GET    | `/api/reports`     | mod  | `?status=open\|reviewing\|resolved\|dismissed\|all`            | `{ reports[] }`                       | Up to 100 most recent reports.                                                                          |

### Profile

| Method | Path                       | Auth | Request                                                                                                                                                              | Response                              | Notes                                                                |
| ------ | -------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------------------- |
| GET    | `/api/profile`             | user | —                                                                                                                                                                   | `{ id, email, role, timezone, profile: {…, badges[]}, streak, subscription }` | Full current-user profile with badge metadata.                      |
| PATCH  | `/api/profile`             | user | `{ displayName?, bio?, avatarUrl?, username?, examGoal?, targetYear?, studyHoursGoal?, timezone? }`                                                                | `{ profile }`                         | Username uniqueness enforced. `studyHoursGoal` clamped 15..1440.      |
| GET    | `/api/profile/[username]` | public | —                                                                                                                                                                | `{ profile, isFriend, friendStatus, isBlocked, isMe }` | Public profile. `email` is **never** returned. Excludes blocked users from friend interactions. |
| GET    | `/api/search/users`        | public+ | `?q=&limit=` (≤ 20)                                                                                                                                              | `{ users[] }`                         | Searches `username` + `displayName` on profiles with `onboardingComplete=true`. Excludes users the caller has blocked (if authed). |

### Notifications

| Method | Path                    | Auth | Request              | Response                                | Notes                                                       |
| ------ | ----------------------- | ---- | -------------------- | --------------------------------------- | ----------------------------------------------------------- |
| GET    | `/api/notifications`    | user | `?unread=true&limit=` | `{ notifications[], unreadCount }`       | Newest first; max 50.                                       |
| PATCH  | `/api/notifications`    | user | —                    | `{ markedAllRead: true }`               | Marks all unread → read for the caller.                    |
| PATCH  | `/api/notifications/[id]`| user | —                    | `{ read: true }`                        | Marks one read. `404` if not owned by caller.               |

### Subscriptions

| Method | Path                | Auth | Request                       | Response              | Notes                                                                                                                                                                                                  |
| ------ | ------------------- | ---- | ----------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/subscriptions` | user | —                             | `{ subscription }`    | Defaults to `{ plan: "free", status: "active" }` if missing.                                                                                                                                          |
| POST   | `/api/subscriptions` | user | `{ plan: "plus"\|"pro" }`     | `{ subscription }`    | Sandbox: writes a `Payment` row with `status="paid"` and upgrades the subscription with 30-day renewal. **Production**: this route initiates a Razorpay checkout; the `Payment` row is created by the webhook only. |

### Referrals

| Method | Path             | Auth | Request | Response                                                 | Notes                                                          |
| ------ | ---------------- | ---- | ------- | -------------------------------------------------------- | -------------------------------------------------------------- |
| GET    | `/api/referrals` | user | —       | `{ code, referredCount, firstSessionCount }`             | Counts referrals that reached `signed_up` or further milestones. |

### Admin

| Method | Path                            | Auth  | Request                                                                                       | Response                                | Notes                                                                                       |
| ------ | ------------------------------- | ----- | --------------------------------------------------------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------- |
| GET    | `/api/admin/stats`              | mod   | —                                                                                             | `{ users, activeUsers, communities, liveRooms, reports, openReports, sessions, payments, totalMinutes, totalXp }` | `activeUsers` = logged in within 7 days.                                                     |
| GET    | `/api/admin/users`              | mod   | `?status=&role=&q=&page=&limit=` (≤ 100)                                                       | `{ users[], page, limit, total }`       | Returns users with embedded profile summary.                                                 |
| PATCH  | `/api/admin/users/[id]`         | mod   | `{ role?: "user"\|"moderator"\|"admin", status?: "active"\|"suspended"\|"banned" }`          | `{ user: { id, role, status } }`        | Writes an `AuditLog` row with the action and diff.                                           |
| PATCH  | `/api/admin/reports/[id]`       | admin | `{ status?: "open"\|"reviewing"\|"resolved"\|"dismissed", resolution?: "warning"\|"mute"\|"kick"\|"ban"\|"no_action" }` | `{ report }` | Sets `resolvedById`, `resolvedAt`. Writes `AuditLog`.                                       |
| PATCH  | `/api/admin/rooms/[id]`         | admin | `{ isLive?, isListed?, action?: "close" }`                                                    | `{ room }`                              | `action:"close"` force-closes the room. Writes `AuditLog`.                                  |
| POST   | `/api/admin/communities`        | admin | `{ slug, name, description, examGoal?, color?, tags?, isFeatured? }`                          | `{ community }`                         | `slug` must match `^[a-z0-9-]+$`. `SLUG_TAKEN` if exists.                                    |
| PATCH  | `/api/admin/communities/[slug]` | admin | `{ name?, description?, color?, tags?, isFeatured? }`                                          | `{ community }`                         |                                                                                              |

### Health

| Method | Path           | Auth   | Request | Response                                                                    | Notes                            |
| ------ | -------------- | ------ | ------- | --------------------------------------------------------------------------- | -------------------------------- |
| GET    | `/api/health`  | public | —       | `{ status: "ok", service: "sankalp-web", time: "ISO-8601" }`                | Liveness probe. Not a load-test. |

## 3. Enum reference

- **user role**: `user` | `moderator` | `admin`
- **user status**: `active` | `suspended` | `banned`
- **community member role**: `member` | `moderator` | `owner`
- **room member role**: `host` | `co_host` | `participant` | `viewer`
- **friendship status**: `pending` | `accepted` | `declined` | `blocked`
- **report reason**: `spam` | `harassment` | `cheating` | `nsfw` | `other`
- **report status**: `open` | `reviewing` | `resolved` | `dismissed`
- **report resolution**: `warning` | `mute` | `kick` | `ban` | `no_action`
- **subscription plan**: `free` | `plus` | `pro`
- **subscription status**: `active` | `canceled` | `past_due`
- **payment status**: `pending` | `paid` | `failed` | `refunded`
- **payment provider**: `razorpay` (default), extensible
- **session mode**: `focus` | `pomodoro` | `break`
- **timer mode**: `focus` | `break` | `idle`
- **badge tier**: `bronze` | `silver` | `gold` | `platinum`
- **leaderboard scope**: `global` | `community` | `friends`
- **leaderboard period**: `daily` | `weekly` | `monthly` | `alltime`
- **notification type**: `friend_request` | `friend_accept` | `badge_earned` | `goal_completed` | `streak_milestone` | `room_invite` | `system` | `report_update`
- **device platform**: `web` | `android` | `ios`
- **referral status**: `pending` | `signed_up` | `first_session` | `rewarded`
- **exam goal** (validated string, not enum): `GATE` | `JEE` | `NEET` | `UPSC` | `CAT` | `SSC` | `Banking` | `MPSC` | `Placements` | `DSA` | `General Study`

## 4. Badge catalog (seeded)

The seed (`prisma/seed.ts`) installs these badges. `evaluateBadges()` grants them on session stop.

| slug           | name              | tier     | xp  | Trigger                                   |
| -------------- | ----------------- | -------- | --- | ----------------------------------------- |
| `first_session`| First Steps       | bronze   | 50  | First completed session                   |
| `streak_7`     | Week Warrior      | bronze   | 100 | Streak ≥ 7                                |
| `streak_30`    | Monthly Resolve   | silver   | 300 | Streak ≥ 30                               |
| `streak_100`   | Century of Focus  | gold     | 1000| Streak ≥ 100                              |
| `night_owl`    | Night Owl         | bronze   | 50  | Session started 00:00–04:00               |
| `early_bird`   | Early Bird        | bronze   | 50  | Session started before 06:00              |
| `goal_master`  | Goal Master      | silver   | 250 | (planned) Hit daily goal 10×             |
| `social_learner`| Social Learner   | bronze   | 100 | (planned) Studied with 5 friends         |
| `room_host`    | Room Host         | bronze   | 100 | (planned) Hosted first live room          |
| `marathon`     | Marathon          | gold     | 500 | Single session ≥ 240 min                  |
| `level_10`     | Level 10          | gold     | 500 | Reached level 10                          |
| `level_25`     | Level 25          | platinum| 2000| Reached level 25                          |

## 5. Sandbox ↔ production parity notes

- The sandbox returns `200` for most successful operations including creation (no `201`). Production FastAPI follows the same convention; clients should treat any `2xx` with the documented body as success.
- `POST /api/subscriptions` in the sandbox immediately marks a payment as `paid`. **Production replaces this with a Razorpay checkout + server-side webhook handler** that creates the `Payment` and updates the `Subscription`. The client must not assume success until the webhook fires.
- The `room_messages` table is written but the room GET/events endpoints read from the in-memory buffer (last 200 messages). Production reads from PostgreSQL with the same `(room_id, created_at)` index and trims history via a background job.
- `POST /api/auth/logout` is a no-op in the sandbox (the client simply deletes its token). Production adds it to JTI-blacklist the JWT in Redis until natural expiry.
