# Mobile Backend Contract — Sankalp Android

> **This document is the binding contract between the Sankalp backend and the future
> Android app.** Every endpoint, every enum, every error code, every payload shape is
> frozen here. The Android app MUST consume this exact API. Changing anything in this
> document requires a new major version (see §10).
>
> Related: `AGENTS.md` (permanent rules), `docs/livekit.md` (media plane),
> `docs/analytics.md` (events), `docs/security.md` (trust boundaries),
> `docs/architecture.md`, `docs/database.md`.

---

## 0. Permanent rule (restate from AGENTS.md)

The future Android app **MUST** reuse the **existing** Sankalp backend, database, Supabase
project, auth, LiveKit project, and API.

### NEVER

- ❌ Create a second, mobile-specific database (`mobile_users`, `app_users`).
- ❌ Fork the API into a separate `mobile-api` service.
- ❌ Re-implement study-session timing, XP, streaks, or badges on the client.
- ❌ Ship a parallel auth system (separate Firebase project).
- ❌ Spin up a second LiveKit project.

### ALWAYS

- ✅ Use the same PostgreSQL/Supabase database and Prisma schema in `prisma/schema.prisma`.
- ✅ Use this exact REST API.
- ✅ Use the same Supabase Auth JWT (`Authorization: Bearer <jwt>`).
- ✅ Use the same LiveKit token endpoint: `POST /api/rooms/{id}/token`.
- ✅ Reuse the same enums, IDs (UUIDs), timestamps (UTC ISO-8601), and error codes.

---

## 1. Base URL & transport

| Environment | Base URL                                |
| ----------- | --------------------------------------- |
| Production  | `https://api.sankalp.in`                |
| Staging     | `https://api-staging.sankalp.in`         |
| Sandbox     | Same origin (`/api`) on the running Next.js dev server (e.g. `http://localhost:3000/api`). |

- All requests are JSON (`Content-Type: application/json`) unless the response is
  explicitly `text/event-stream` (the SSE stream — see §7).
- All requests/responses are UTF-8.
- All timestamps are ISO-8601 UTC with a `Z` suffix, e.g. `"2024-05-12T08:30:00.000Z"`.
  The Android client MUST parse with offset-aware UTC parsing.
- All IDs are **UUIDs** (cuid in the sandbox runtime; `gen_random_uuid()` in Postgres
  production). Treat them as opaque strings; do not parse their structure.

### Auth

Every authenticated request carries:

```
Authorization: Bearer <Supabase JWT>
```

- The JWT is obtained from **Supabase Auth** via the Android Supabase SDK
  (`supabase-kt`). Supported providers: **Google OAuth** and **email/password**.
- The sandbox runtime uses a signed session token of the same Bearer shape (see
  `src/lib/auth.ts`). It is **not** a Supabase JWT, but the request header is identical.
- The token TTL is 30 days for the sandbox session and 1 hour (Supabase default) for the
  production Supabase JWT. The Android client must refresh the Supabase JWT before
  expiry using the Supabase SDK; the API treats the bearer token as opaque.
- The API verifies the bearer token on every request via `getAuth(req)`
  (`src/lib/api.ts`). On failure it returns `401 UNAUTHORIZED`.

### Request bodies

- All `POST`/`PATCH`/`PUT`/`DELETE` bodies are JSON.
- Unknown fields in request bodies are ignored (forward-compat).
- Empty body on `POST` is allowed where documented; the server treats missing fields as
  defaults.

---

## 2. Error envelope

Every non-2xx response uses this exact shape:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable message"
  }
}
```

`message` is for the developer or for the end user; the client MUST branch on `code`,
not `message`. `message` may change between releases; `code` is frozen.

### HTTP status codes

| Status | Meaning                                       |
| ------ | --------------------------------------------- |
| 200    | OK (GET, PATCH success, some POSTs that return data) |
| 201    | Created (POST that creates a resource)        |
| 400    | Bad request (validation, invalid input)        |
| 401    | Unauthenticated                               |
| 403    | Authenticated but forbidden                   |
| 404    | Resource not found                            |
| 409    | Conflict (rare; usually encoded as 400 with a specific code) |
| 429    | Rate limited (returned with 400 + `RATE_LIMITED` in the sandbox) |
| 500    | Internal server error                          |

> Note: in the current sandbox implementation `RATE_LIMITED` is returned as HTTP 400
> (see `src/lib/api.ts` `badRequest`). In production it will be 429. Android must accept
> both 400 and 429 with `code: "RATE_LIMITED"`.

### Error codes (canonical list)

| Code                | When                                                            |
| ------------------- | --------------------------------------------------------------- |
| `UNAUTHORIZED`      | Missing or invalid bearer token.                                |
| `FORBIDDEN`         | Authenticated but not allowed to perform this action on this resource. |
| `NOT_FOUND`         | Resource does not exist.                                       |
| `BAD_REQUEST`       | Generic validation error.                                       |
| `RATE_LIMITED`      | Too many requests (10/min on signup/login).                     |
| `EMAIL_TAKEN`       | Signup: an account with this email already exists.              |
| `USERNAME_TAKEN`    | Onboarding / profile update: username is taken.                |
| `ALREADY_MEMBER`    | Communities: user is already a member.                          |
| `NOT_MEMBER`        | Room: caller is not a member of the room.                       |
| `ALREADY_FRIENDS`   | Friends: a friendship already exists with status `accepted`.  |
| `PENDING`           | Friends: a friend request is already pending.                  |
| `BLOCKED`           | Either side has blocked the other; interaction refused.        |
| `ACCOUNT_SUSPENDED` | Login: account `status != "active"`.                            |
| `ROOM_FULL`         | Token issuance: `participantCount >= maxParticipants`.          |
| `NOT_HOST`          | Timer: caller is not the host.                                  |
| `SLUG_TAKEN`        | Admin: community slug already exists.                           |

The client MUST gracefully handle any of these. Treat unknown codes as `BAD_REQUEST`.

---

## 3. Pagination

List endpoints accept:

```
?page=1&limit=20
```

- `page` is 1-indexed. `page < 1` is treated as 1.
- `limit` is clamped to a per-endpoint max (often 20–100).

Paginated responses:

```json
{
  "...resource fields...": "...",
  "page": 1,
  "limit": 20,
  "total": 137
}
```

The client computes `hasMore = page * limit < total`.

---

## 4. Enums (exact string values — Android MUST use these)

These are the canonical string values. Android should define them as Kotlin `enum class`
with `serialName` matching these strings exactly.

### `user.role`
`user` | `moderator` | `admin`

### `user.status`
`active` | `suspended` | `banned`

### `communityMember.role`
`member` | `moderator` | `owner`

### `roomMember.role`
`host` | `co_host` | `participant` | `viewer`

### `friendship.status`
`pending` | `accepted` | `declined` | `blocked`

### `report.reason`
`spam` | `harassment` | `cheating` | `nsfw` | `other`

### `report.status`
`open` | `reviewing` | `resolved` | `dismissed`

### `report.resolution`
`warning` | `mute` | `kick` | `ban` | `no_action`

### `subscription.plan`
`free` | `plus` | `pro`

### `subscription.status`
`active` | `canceled` | `past_due`

### `studySession.mode`
`focus` | `pomodoro` | `break`

### `timer.mode` (presence ephemeral state)
`focus` | `break` | `idle`

### `badge.tier`
`bronze` | `silver` | `gold` | `platinum`

### `notification.type`
`friend_request` | `friend_accept` | `badge_earned` | `goal_completed` | `streak_milestone` | `room_invite` | `system` | `report_update`

### `payment.status`
`pending` | `paid` | `failed` | `refunded`

### `payment.provider`
`razorpay` (others may be added later)

### `referral.status`
`pending` | `signed_up` | `first_session` | `rewarded`

### `userDevice.platform`
`web` | `android` | `ios`

### `examGoal`
One of: `GATE`, `JEE`, `NEET`, `UPSC`, `CAT`, `SSC`, `Banking`, `MPSC`, `Placements`,
`DSA`, `General Study` (case-sensitive). Used in onboarding, profile, communities.

---

## 5. Endpoints

This section lists **every** endpoint under `/api/*`. For each: method, path, auth
scope, request schema, response schema, possible error codes, and an example
request/response. Auth scope is one of: `public` (no auth), `user` (any authenticated
user), `moderator` (role moderator or admin), `admin` (role admin only).

### 5.1 Auth

---

#### `POST /api/auth/signup`

- **Auth scope**: `public`
- **Rate limit**: 10/minute per IP
- **Request**:
  ```json
  { "email": "user@example.com", "password": "min8chars", "referralCode": "aarav-1a2b" }
  ```
  `referralCode` is optional. `password` must be ≥ 8 chars.
- **Response 200**:
  ```json
  {
    "token": "<bearer-token>",
    "user": {
      "id": "ckpq7v8m0...",
      "email": "user@example.com",
      "role": "user",
      "status": "active",
      "profile": { "username": "user1", "displayName": "user1", "onboardingComplete": false, ... },
      "streak": { "current": 0, "longest": 0, "lastStudyDate": null }
    }
  }
  ```
  Note: the response is 200, not 201, in the current implementation.
- **Errors**: `EMAIL_TAKEN`, `BAD_REQUEST`, `RATE_LIMITED`
- **Side effects**: creates `User`, `Profile`, `Streak`, `Subscription(plan=free)`,
  `Referral` (the new user's own code). If `referralCode` matches an open `Referral`,
  binds it and sets status=`signed_up`.
- **Analytics**: fires `signup_completed` (server) and `referral_signup` if applicable.

---

#### `POST /api/auth/login`

- **Auth scope**: `public`
- **Rate limit**: 10/minute per IP
- **Request**:
  ```json
  { "email": "user@example.com", "password": "min8chars" }
  ```
- **Response 200**:
  ```json
  { "token": "<bearer-token>", "user": { ...same as signup... } }
  ```
- **Errors**: `UNAUTHORIZED` (bad creds), `ACCOUNT_SUSPENDED`, `BAD_REQUEST`, `RATE_LIMITED`
- **Side effects**: sets `User.lastLoginAt = now`.

---

#### `POST /api/auth/google-demo`

- **Auth scope**: `public`
- **Purpose**: Simulated Google OAuth for the sandbox. Production: the Android app uses
  the Supabase Auth Google provider, which returns a real JWT directly — this endpoint
  is **not** called by Android in production.
- **Request**:
  ```json
  { "email": "googleuser@gmail.com" }
  ```
  If `email` is omitted, a random `google-demo-<hex>@gmail.com` is generated. If the
  email already exists, the existing user is logged in (idempotent).
- **Response 200**: same shape as `/api/auth/login`.
- **Errors**: `ACCOUNT_SUSPENDED`
- **Production swap**: Android calls Supabase Auth directly:
  ```kotlin
  supabase.auth.signInWith(Google) { /* … */ }
  val jwt = supabase.auth.currentAccessToken()   // send as Bearer
  ```

---

#### `GET /api/auth/me`

- **Auth scope**: `user`
- **Response 200**:
  ```json
  {
    "id": "ckpq7v8m0...",
    "email": "user@example.com",
    "role": "user",
    "status": "active",
    "profile": { "...": "..." },
    "streak": { "current": 4, "longest": 12, "lastStudyDate": "2024-05-11T00:00:00.000Z" }
  }
  ```
- **Errors**: `UNAUTHORIZED`
- **Use**: Android calls this on app launch to validate the cached token.

---

### 5.2 Onboarding

---

#### `PATCH /api/onboarding`

- **Auth scope**: `user`
- **Request**:
  ```json
  {
    "displayName": "Aarav Sharma",
    "username": "aarav",
    "examGoal": "GATE",
    "targetYear": 2026,
    "studyHoursGoal": 360,
    "timezone": "Asia/Kolkata"
  }
  ```
  - `displayName`: ≥ 2 chars
  - `username`: ≥ 3 chars, `[a-z0-9_]` only
  - `examGoal`: one of the documented enum values
  - `targetYear`: 2024–2035 (optional)
  - `studyHoursGoal`: 15–1440 minutes (NOT hours); default 360
  - `timezone`: IANA name. The sandbox onboarding route does not currently persist
    timezone; Android should additionally `PATCH /api/profile { timezone }` to set it.
- **Response 200**: the full `MeResponse` (same shape as `GET /api/auth/me`).
- **Errors**: `BAD_REQUEST`, `USERNAME_TAKEN`, `UNAUTHORIZED`
- **Side effects**: sets `Profile.onboardingComplete = true`, sets
  `User.emailVerifiedAt = now`, auto-joins the community matching `examGoal` (slug =
  `examGoal.toLowerCase().replace(/\s+/g, "-")`, e.g. `General Study` → `general-study`
  — note the seeded slug is `general`, so `General Study` joins `general-study` if it
  exists, else nothing).
- **Analytics**: fires `onboarding_completed` and `community_joined` (server).

---

### 5.3 Communities

---

#### `GET /api/communities`

- **Auth scope**: `public` (auth optional, used to surface joined state in the future)
- **Query**: `?q=<text>&featured=true`
- **Response 200**:
  ```json
  {
    "communities": [
      {
        "id": "ckpq1m2k0...",
        "slug": "gate",
        "name": "GATE",
        "description": "...",
        "examGoal": "GATE",
        "color": "#10b981",
        "iconUrl": null,
        "memberCount": 1245,
        "isFeatured": true,
        "tags": ["engineering", "psu", "mtech"],
        "liveRooms": 3
      }
    ]
  }
  ```
- **Errors**: none (always 200).

---

#### `GET /api/communities/{slug}`

- **Auth scope**: `public` (auth optional — when present, response includes `membership`)
- **Response 200**:
  ```json
  {
    "community": {
      "id": "ckpq1m2k0...",
      "slug": "gate",
      "name": "GATE",
      "description": "...",
      "examGoal": "GATE",
      "color": "#10b981",
      "iconUrl": null,
      "memberCount": 1245,
      "isFeatured": true,
      "tags": ["engineering", "psu", "mtech"],
      "createdAt": "2024-04-01T00:00:00.000Z",
      "updatedAt": "2024-05-01T00:00:00.000Z"
    },
    "rooms": [
      {
        "id": "ckpq8n2k0...",
        "name": "GATE CS — DSA drill",
        "description": "...",
        "isLive": true,
        "isPrivate": false,
        "participantCount": 7,
        "maxParticipants": 20,
        "focusMode": true,
        "tags": ["dsa"],
        "owner": { "id": "ckpq7v8m0...", "username": "aarav", "displayName": "Aarav Sharma", "avatarUrl": null }
      }
    ],
    "membership": { "role": "member", "joinedAt": "2024-04-10T00:00:00.000Z" }
  }
  ```
  `membership` is `null` if the caller is unauthenticated or not a member.
- **Errors**: `NOT_FOUND`

---

#### `POST /api/communities/{slug}/join`

- **Auth scope**: `user`
- **Request**: empty body
- **Response 200**:
  ```json
  { "joined": true }
  ```
- **Errors**: `UNAUTHORIZED`, `NOT_FOUND`, `ALREADY_MEMBER`
- **Side effects**: creates `CommunityMember(role=member)`, increments
  `Community.memberCount`.
- **Analytics**: fires `community_joined`.

---

#### `POST /api/communities/{slug}/leave`

- **Auth scope**: `user`
- **Request**: empty body
- **Response 200**:
  ```json
  { "left": true }
  ```
  If the caller was not a member, returns `{ "left": false, "reason": "NOT_MEMBER" }`
  with HTTP 200 (no error code).
- **Errors**: `UNAUTHORIZED`, `NOT_FOUND`

---

### 5.4 Rooms

---

#### `GET /api/rooms`

- **Auth scope**: `public`
- **Query**: `?communityId=&live=true&q=&page=1&limit=20` (limit capped at 40)
- **Response 200**:
  ```json
  {
    "rooms": [
      {
        "id": "ckpq8n2k0...",
        "name": "GATE CS — DSA drill",
        "description": "...",
        "isLive": true,
        "isPrivate": false,
        "focusMode": true,
        "participantCount": 7,
        "maxParticipants": 20,
        "tags": ["dsa"],
        "startedAt": "2024-05-12T08:00:00.000Z",
        "community": { "slug": "gate", "name": "GATE", "color": "#10b981" },
        "owner": { "id": "ckpq7v8m0...", "username": "aarav", "displayName": "Aarav Sharma", "avatarUrl": null }
      }
    ],
    "page": 1, "limit": 20, "total": 53
  }
  ```
- **Errors**: none (always 200).

---

#### `POST /api/rooms`

- **Auth scope**: `user`
- **Request**:
  ```json
  {
    "name": "GATE CS — DSA drill",
    "description": "Solving LeetCode medium together",
    "communitySlug": "gate",
    "isPrivate": false,
    "maxParticipants": 20,
    "focusMode": true,
    "tags": ["dsa", "interview"],
    "pomodoroConfig": { "focusMin": 25, "breakMin": 5, "longBreakMin": 15, "rounds": 4 }
  }
  ```
  - `name`: 3–80 chars (required)
  - `maxParticipants`: 2–50 (default 20)
  - `tags`: max 6 strings
  - `communitySlug`: optional; if present must be a real community slug
- **Response 200**:
  ```json
  {
    "room": {
      "id": "ckpq8n2k0...",
      "name": "GATE CS — DSA drill",
      "description": "...",
      "isLive": true,
      "isPrivate": false,
      "focusMode": true,
      "participantCount": 1,
      "maxParticipants": 20,
      "pomodoroConfig": { "focusMin": 25, "breakMin": 5, "longBreakMin": 15, "rounds": 4 },
      "tags": ["dsa", "interview"],
      "livekitRoom": "sankalp-9f3a2c1b4d8e",
      "community": { "slug": "gate", "name": "GATE", "color": "#10b981" },
      "owner": { "id": "ckpq7v8m0...", "username": "aarav", "displayName": "Aarav Sharma", "avatarUrl": null }
    }
  }
  ```
- **Errors**: `UNAUTHORIZED`, `BAD_REQUEST`
- **Side effects**: creates `Room` with `isLive=true`, `startedAt=now`,
  `livekitRoom=sankalp-<12 hex>`. Creates a `RoomMember` row for the owner with
  `role=host`, `muted=true`, `cameraOff=true`. Sets `participantCount=1`.
- **Analytics**: fires `room_created`.

---

#### `GET /api/rooms/{id}`

- **Auth scope**: `public` (presence + timer are returned even without auth — useful for
  preview before joining)
- **Response 200**:
  ```json
  {
    "room": {
      "id": "ckpq8n2k0...",
      "name": "GATE CS — DSA drill",
      "description": "...",
      "isLive": true,
      "isPrivate": false,
      "isListed": true,
      "focusMode": true,
      "participantCount": 7,
      "maxParticipants": 20,
      "pomodoroConfig": { "focusMin": 25, "breakMin": 5, "longBreakMin": 15, "rounds": 4 },
      "tags": ["dsa", "interview"],
      "startedAt": "2024-05-12T08:00:00.000Z",
      "endedAt": null,
      "livekitRoom": "sankalp-9f3a2c1b4d8e",
      "community": { "slug": "gate", "name": "GATE", "color": "#10b981", "examGoal": "GATE" },
      "owner": { "id": "ckpq7v8m0...", "username": "aarav", "displayName": "Aarav Sharma", "avatarUrl": null }
    },
    "participants": [ /* see §7 presence participant shape */ ],
    "timer": { "mode": "idle", "endsAt": null, "round": 0, "focusMin": 25, "breakMin": 5, "startedBy": null }
  }
  ```
- **Errors**: `NOT_FOUND`

---

#### `PATCH /api/rooms/{id}`

- **Auth scope**: `user` (must be the room owner or a moderator/admin)
- **Request** (any subset):
  ```json
  {
    "name": "New name (≥3 chars)",
    "description": "New description",
    "isListed": true,
    "focusMode": true,
    "isLive": true,
    "maxParticipants": 30,
    "tags": ["dsa"]
  }
  ```
- **Response 200**: `{ "room": { /* updated Room row, raw Prisma shape */ } }`
- **Errors**: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `BAD_REQUEST`

---

#### `DELETE /api/rooms/{id}`

- **Auth scope**: `user` (must be the room owner or a moderator/admin)
- **Request**: empty
- **Response 200**: `{ "closed": true }`
- **Errors**: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`
- **Side effects**: sets `Room.isLive=false`, `isListed=false`, `endedAt=now`. Does
  not delete the row. LiveKit's room is reaped when the last participant leaves.

---

#### `POST /api/rooms/{id}/token`

See `docs/livekit.md` for the full contract; summarized here for completeness.

- **Auth scope**: `user`
- **Request**:
  ```json
  { "canPublish": true, "canPublishData": false }
  ```
- **Response 200**:
  ```json
  {
    "token": "eyJ...",
    "url": "wss://sankalp.livekit.cloud",
    "livekitRoom": "sankalp-9f3a2c1b4d8e",
    "identity": "ckpq7v8m0...",
    "wsUrl": "wss://sankalp.livekit.cloud"
  }
  ```
- **Errors**: `UNAUTHORIZED`, `BAD_REQUEST` (profile missing), `ROOM_FULL`,
  `NOT_FOUND`
- **Side effects**: upserts `RoomMember` for the caller; role = `host` if caller is
  the owner, else `participant`. Resets `leftAt=null`, `lastSeenAt=now`.
- **Analytics**: fires `room_token_issued`.

---

#### `GET /api/rooms/{id}/presence`

- **Auth scope**: `public`
- **Response 200**:
  ```json
  {
    "participants": [
      {
        "userId": "ckpq7v8m0...",
        "username": "aarav",
        "displayName": "Aarav Sharma",
        "avatarUrl": null,
        "micOn": false,
        "camOn": false,
        "isSpeaking": false,
        "role": "host",
        "joinedAt": 1700000000000,
        "lastSeenAt": 1700000020000
      }
    ]
  }
  ```
- **Errors**: `NOT_FOUND` is not returned — the server returns `{ participants: [] }`
  for unknown rooms (presence is ephemeral).

---

#### `POST /api/rooms/{id}/presence`

- **Auth scope**: `user`
- **Request** (three actions, mutually exclusive via the `action` field):
  1. Join (default — no `action` field):
     ```json
     { "micOn": false, "camOn": false }
     ```
  2. Heartbeat:
     ```json
     { "action": "heartbeat" }
     ```
  3. Leave:
     ```json
     { "action": "leave" }
     ```
- **Response 200**:
  - Join: `{ "participant": { ...presenceParticipant }, "count": 7 }`
  - Heartbeat: `{ "ok": true }`
  - Leave: `{ "left": true, "remaining": 6 }`
- **Errors**: `UNAUTHORIZED`, `NOT_FOUND`
- **Heartbeat cadence**: every **20 seconds** while in the room. The server reaps
  participants silent for **45 seconds** (see §7).
- **Side effects**: on join, increments `Room.participantCount` (capped at
  `maxParticipants`). On leave, sets `RoomMember.leftAt=now` and updates
  `Room.participantCount` to the remaining participant count.

---

#### `PATCH /api/rooms/{id}/presence`

- **Auth scope**: `user` (must already be in presence)
- **Request** (any subset):
  ```json
  { "micOn": true, "camOn": true, "isSpeaking": false }
  ```
- **Response 200**: `{ "participant": { ...updated participant } }`
- **Errors**: `UNAUTHORIZED`, `NOT_FOUND` (not in presence)
- **Note**: `isSpeaking` is intended to be toggled only on transitions, not per audio
  frame. See `docs/livekit.md` §5.

---

#### `GET /api/rooms/{id}/messages`

- **Auth scope**: `public`
- **Query**: `?limit=50` (capped at 200)
- **Response 200**:
  ```json
  {
    "messages": [
      {
        "id": "1700000000-1a2b3c",
        "userId": "ckpq7v8m0...",
        "username": "aarav",
        "text": "Let's do 50 minutes of DSA.",
        "isSystem": false,
        "createdAt": 1700000000000
      }
    ]
  }
  ```
- **Note**: messages returned here are the **in-memory** channel (last 200, capped).
  Persistent history (in the `RoomMessage` table) is queryable via admin endpoints only
  in this contract.

---

#### `POST /api/rooms/{id}/messages`

- **Auth scope**: `user` (must be a `RoomMember` of this room)
- **Request**:
  ```json
  { "text": "Let's do 50 minutes of DSA." }
  ```
  Text is trimmed to 500 chars.
- **Response 200**:
  ```json
  {
    "message": {
      "id": "1700000000-1a2b3c",
      "userId": "ckpq7v8m0...",
      "username": "aarav",
      "text": "Let's do 50 minutes of DSA.",
      "isSystem": false,
      "createdAt": 1700000000000
    }
  }
  ```
- **Errors**: `UNAUTHORIZED`, `FORBIDDEN` (`NOT_MEMBER` code), `NOT_FOUND`, `BAD_REQUEST`
- **Side effects**: persists a `RoomMessage` row (history) AND broadcasts the message
  on the SSE stream.

---

#### `GET /api/rooms/{id}/events`

- **Auth scope**: `user` — token passed as query param `?token=<bearer>` because
  EventSource (and the Android equivalent) cannot set headers.
- **Response**: `Content-Type: text/event-stream`. SSE frames per §7.
- **Errors**: `UNAUTHORIZED`, `NOT_FOUND`
- **Note**: in production, this is replaced (or augmented) by a WebSocket at
  `wss://api.sankalp.in/ws/rooms/{id}` carrying the same JSON event shapes. Android
  should abstract the transport behind a single `RoomEvents` interface.

---

#### `POST /api/rooms/{id}/timer`

- **Auth scope**: `user` (must be a `RoomMember`; only host/co_host/owner can start/stop)
- **Request**:
  ```json
  { "action": "start", "mode": "focus", "minutes": 25 }
  ```
  or
  ```json
  { "action": "stop" }
  ```
  - `mode`: `focus` or `break` (default `focus`)
  - `minutes`: 1–180 (defaults to the room's `pomodoroConfig.focusMin` or `.breakMin`)
- **Response 200**:
  ```json
  {
    "timer": {
      "mode": "focus",
      "endsAt": 1700001500000,
      "round": 3,
      "focusMin": 25,
      "breakMin": 5,
      "startedBy": "ckpq7v8m0..."
    }
  }
  ```
- **Errors**: `UNAUTHORIZED`, `BAD_REQUEST` (`NOT_MEMBER` or `NOT_HOST`), `NOT_FOUND`
- **Side effects**: broadcasts a `timer` SSE event AND a system chat message
  ("Aarav started a 25 min focus timer" / "Timer stopped").

---

#### `PATCH /api/rooms/{id}/members/{userId}`

- **Auth scope**: `user` (must be the room owner, a `host`/`co_host` RoomMember, or a
  platform moderator/admin)
- **Request** (any subset):
  ```json
  { "muted": true, "role": "co_host" }
  ```
  - `muted`: boolean — server-mutes the target.
  - `role`: one of `host`, `co_host`, `participant`, `viewer`. Cannot change the
    room owner's role.
- **Response 200**: `{ "member": { "userId": "...", "muted": true, "role": "co_host" } }`
- **Errors**: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `BAD_REQUEST`
- **Side effects**: if `muted=true`, posts a system chat message ("X was muted by the host").

---

#### `DELETE /api/rooms/{id}/members/{userId}`

- **Auth scope**: `user` (must be the room owner, a `host`/`co_host` RoomMember, or a
  platform moderator/admin)
- **Request**: empty
- **Response 200**: `{ "kicked": true }`
- **Errors**: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `BAD_REQUEST` (cannot kick the
  owner)
- **Side effects**: removes the target from the in-memory presence, sets
  `RoomMember.leftAt=now`, posts a system chat message ("X was removed").

---

### 5.5 Study

---

#### `POST /api/study/sessions`

- **Auth scope**: `user`
- **Request**:
  ```json
  { "roomId": "ckpq8n2k0...", "communityId": "ckpq1m2k0...", "mode": "focus" }
  ```
  - `roomId`: optional; if present the caller must already be a `RoomMember`
    (`FORBIDDEN` `NOT_MEMBER` otherwise)
  - `communityId`: optional; if omitted, inherits from `room.communityId`
  - `mode`: `focus` (default) or `pomodoro`
- **Response 200**:
  ```json
  { "sessionId": "ckpq9o3m1...", "startedAt": "2024-05-12T08:00:00.000Z" }
  ```
- **Errors**: `UNAUTHORIZED`, `BAD_REQUEST`, `FORBIDDEN` (`NOT_MEMBER`)
- **Side effects**: if the caller already has an un-ended session, the server
  auto-closes it first (capped at `MAX_SESSION_MIN = 480` minutes), awarding XP and
  bumping the streak. The new session is then created with `startedAt = now`.
- **Analytics**: fires `study_started`. The auto-close path fires `study_completed`
  for the previous session.
- **Critical rule**: the client NEVER submits a duration. The server computes
  duration from `startedAt` and `endedAt` on stop. See §8.

---

#### `GET /api/study/sessions`

- **Auth scope**: `user`
- **Query**: `?limit=30` (capped at 100)
- **Response 200**:
  ```json
  {
    "sessions": [
      {
        "id": "ckpq9o3m1...",
        "startedAt": "2024-05-12T08:00:00.000Z",
        "endedAt": "2024-05-12T08:50:00.000Z",
        "durationMin": 50,
        "xpEarned": 500,
        "mode": "focus",
        "room": { "id": "ckpq8n2k0...", "name": "GATE CS — DSA drill" },
        "community": { "slug": "gate", "name": "GATE" }
      }
    ]
  }
  ```
  Only **ended** sessions are returned (open sessions are excluded).
- **Errors**: `UNAUTHORIZED`

---

#### `POST /api/study/sessions/{id}/stop`

- **Auth scope**: `user` (must own the session)
- **Request**: empty
- **Response 200**:
  ```json
  {
    "stopped": true,
    "durationMin": 50,
    "xpEarned": 500,
    "level": 4,
    "streak": 5,
    "goal": {
      "userId": "ckpq7v8m0...",
      "date": "2024-05-12T00:00:00.000Z",
      "targetMin": 360,
      "achievedMin": 50,
      "completed": false,
      "completedAt": null
    },
    "awardedBadges": [
      { "slug": "first_session", "name": "First Steps", "description": "...", "tier": "bronze" }
    ]
  }
  ```
  If the session was already stopped:
  ```json
  { "alreadyStopped": true, "durationMin": 50, "xpEarned": 500 }
  ```
  If the session was sub-minute, the row is deleted and the response is:
  ```json
  { "stopped": true, "durationMin": 0, "xpEarned": 0, "awardedBadges": [] }
  ```
- **Errors**: `UNAUTHORIZED`, `NOT_FOUND`, `FORBIDDEN` (not your session)
- **Side effects**: server computes `durationMin = min(MAX_SESSION_MIN, round((now -
  startedAt)/60000))`. Awards `durationMin * XP_PER_MINUTE` (XP_PER_MINUTE = 10) XP to
  the profile, recomputes `level = floor(sqrt(totalXp/50)) + 1`, bumps the streak in
  the user's timezone, updates the daily goal, evaluates badges, and creates
  `Notification` rows for any new badges.
- **Analytics**: fires `study_completed`, `study_duration`, optionally `goal_completed`,
  `streak_milestone`, `badge_earned` (per badge).

---

#### `GET /api/study/goals/today`

- **Auth scope**: `user`
- **Response 200**:
  ```json
  {
    "date": "2024-05-12T00:00:00.000Z",
    "targetMin": 360,
    "achievedMin": 50,
    "completed": false,
    "completedAt": null,
    "streak": { "current": 5, "longest": 12, "lastStudyDate": "2024-05-12T00:00:00.000Z" }
  }
  ```
  The "date" is the user's **local** calendar date (midnight UTC of the user's tz date),
  so a 11:30 PM IST session counts toward the user's local day, not UTC.
- **Errors**: `UNAUTHORIZED`
- **Side effects**: upserts today's `DailyGoal` row using the profile's
  `studyHoursGoal` as the default `targetMin` if no row exists.

---

#### `PATCH /api/study/goals/today`

- **Auth scope**: `user`
- **Request**:
  ```json
  { "targetMin": 480 }
  ```
  - `targetMin`: 15–1440
- **Response 200**:
  ```json
  { "goal": { /* DailyGoal row */ } }
  ```
- **Errors**: `UNAUTHORIZED`, `BAD_REQUEST`
- **Side effects**: updates `Profile.studyHoursGoal` (the default for future days) AND
  today's `DailyGoal.targetMin`.

---

#### `GET /api/study/goals`

- **Auth scope**: `user`
- **Response 200**:
  ```json
  {
    "goals": [
      {
        "id": "ckpq1g2l0...",
        "userId": "ckpq7v8m0...",
        "date": "2024-05-12T00:00:00.000Z",
        "targetMin": 360,
        "achievedMin": 380,
        "completed": true,
        "completedAt": "2024-05-12T09:00:00.000Z"
      }
    ]
  }
  ```
  Last 14 days of goals.
- **Errors**: `UNAUTHORIZED`

---

#### `GET /api/study/streak`

- **Auth scope**: `user`
- **Response 200**:
  ```json
  { "id": "ckpq1s2r0...", "userId": "ckpq7v8m0...", "current": 5, "longest": 12, "lastStudyDate": "2024-05-12T00:00:00.000Z", "updatedAt": "2024-05-12T08:50:00.000Z" }
  ```
  If the user has never studied: `{ "current": 0, "longest": 0, "lastStudyDate": null }`.
- **Errors**: `UNAUTHORIZED`

---

#### `GET /api/study/badges`

- **Auth scope**: `user`
- **Response 200**:
  ```json
  {
    "badges": [
      {
        "id": "ckpq1b2d0...",
        "slug": "first_session",
        "name": "First Steps",
        "description": "Completed your first study session.",
        "tier": "bronze",
        "xpReward": 50,
        "earned": true,
        "awardedAt": "2024-05-12T08:50:00.000Z"
      }
    ]
  }
  ```
  All badges are returned; `earned` indicates whether the user has it.
- **Errors**: `UNAUTHORIZED`

---

### 5.6 Leaderboard

---

#### `GET /api/leaderboard`

- **Auth scope**: `public` for `scope=global` and `scope=community`; `user` for
  `scope=friends`
- **Query**: `?scope=global|community|friends&communitySlug=&period=daily|weekly|monthly|alltime&limit=50`
  - `scope=friends` requires authentication; returns 200 with empty rows if no friends
  - `period` default: `weekly`
  - `limit` capped at 100
- **Response 200**:
  ```json
  {
    "scope": "global",
    "period": "weekly",
    "rows": [
      {
        "rank": 1,
        "userId": "ckpq7v8m0...",
        "username": "aarav",
        "displayName": "Aarav Sharma",
        "avatarUrl": null,
        "examGoal": "GATE",
        "level": 4,
        "minutes": 380,
        "xp": 3800
      }
    ]
  }
  ```
- **Errors**: `UNAUTHORIZED` (only when `scope=friends` and no auth)

---

### 5.7 Friends

---

#### `GET /api/friends`

- **Auth scope**: `user`
- **Response 200**:
  ```json
  {
    "friends": [ { "userId": "...", "username": "...", "displayName": "...", "avatarUrl": null, "examGoal": "GATE", "level": 4, "status": "accepted", "since": "2024-04-10T..." } ],
    "incoming": [ { "...", "status": "pending" } ],
    "outgoing": [ { "...", "status": "pending" } ]
  }
  ```
- **Errors**: `UNAUTHORIZED`

---

#### `POST /api/friends`

- **Auth scope**: `user`
- **Request**: `{ "username": "diya" }`
- **Response 200**: `{ "requested": true }`
- **Errors**: `UNAUTHORIZED`, `BAD_REQUEST`, `NOT_FOUND`, `ALREADY_FRIENDS`, `PENDING`, `BLOCKED`
- **Side effects**: creates `Friendship(status=pending)` (or resets a `declined`
  friendship back to `pending`). Creates a `Notification(type=friend_request)` for
  the recipient.
- **Analytics**: fires `friend_request_sent`.

---

#### `PATCH /api/friends/{id}`

- **Auth scope**: `user` (`{id}` is the `fromUserId` of a pending request directed at
  the caller)
- **Request**: `{ "action": "accept" }` or `{ "action": "decline" }`
- **Response 200**: `{ "status": "accepted" }` or `{ "status": "declined" }`
- **Errors**: `UNAUTHORIZED`, `NOT_FOUND`
- **Side effects**: on accept, creates a `Notification(type=friend_accept)` for the
  sender.
- **Analytics**: fires `friend_accepted` on accept.

---

#### `DELETE /api/friends/{id}`

- **Auth scope**: `user`
- **Request**: empty
- **Response 200**: `{ "removed": true }`
- **Errors**: `UNAUTHORIZED`
- **Side effects**: deletes the friendship row (whether `pending`, `accepted`, or
  `declined`) in either direction.

---

### 5.8 Blocks

---

#### `POST /api/blocks`

- **Auth scope**: `user`
- **Request**: `{ "username": "spammer" }`
- **Response 200**: `{ "blocked": true }`
- **Errors**: `UNAUTHORIZED`, `BAD_REQUEST`, `NOT_FOUND`
- **Side effects**: upserts a `Block` row. Also deletes any friendship in either
  direction.
- **Analytics**: fires `user_blocked`.

---

#### `DELETE /api/blocks`

- **Auth scope**: `user`
- **Request**: `{ "username": "spammer" }`
- **Response 200**: `{ "unblocked": true }` (or `{ "unblocked": false }` if no block
  existed)
- **Errors**: `UNAUTHORIZED`

---

### 5.9 Reports

---

#### `POST /api/reports`

- **Auth scope**: `user`
- **Request**:
  ```json
  {
    "reason": "spam",
    "detail": "Optional free text, max 1000 chars (never sent to analytics)",
    "reportedUserId": "ckpq2m2k0...",
    "reportedRoomId": "ckpq8n2k0...",
    "reportedMessageId": "ckpq1m2g0..."
  }
  ```
  At least one of `reportedUserId`, `reportedRoomId`, `reportedMessageId` is required.
- **Response 200**: `{ "report": { /* Report row */ } }`
- **Errors**: `UNAUTHORIZED`, `BAD_REQUEST`
- **Side effects**: creates a `Report(status=open)`. Creates
  `Notification(type=report_update)` rows for every moderator/admin.
- **Analytics**: fires `report_created` (without the `detail` field).

---

#### `GET /api/reports`

- **Auth scope**: `moderator`
- **Query**: `?status=open|reviewing|resolved|dismissed|all` (default `open`)
- **Response 200**: `{ "reports": [ { /* Report row with reporter + reported included */ } ] }`
- **Errors**: `UNAUTHORIZED`, `FORBIDDEN`

---

### 5.10 Profile

---

#### `GET /api/profile`

- **Auth scope**: `user` (the caller's own full profile)
- **Response 200**:
  ```json
  {
    "id": "ckpq7v8m0...",
    "email": "user@example.com",
    "role": "user",
    "timezone": "Asia/Kolkata",
    "profile": {
      "id": "ckpq1p2r0...",
      "userId": "ckpq7v8m0...",
      "username": "aarav",
      "displayName": "Aarav Sharma",
      "avatarUrl": null,
      "bio": null,
      "examGoal": "GATE",
      "targetYear": 2026,
      "studyHoursGoal": 360,
      "onboardingComplete": true,
      "streakCount": 5,
      "totalMinutes": 380,
      "totalXp": 3800,
      "level": 4,
      "badges": [
        { "slug": "first_session", "name": "First Steps", "description": "...", "tier": "bronze", "awardedAt": "2024-05-12T..." }
      ]
    },
    "streak": { "id": "...", "userId": "...", "current": 5, "longest": 12, "lastStudyDate": "...", "updatedAt": "..." },
    "subscription": { "id": "...", "userId": "...", "plan": "free", "status": "active", "startedAt": "...", "renewsAt": null }
  }
  ```
- **Errors**: `UNAUTHORIZED`

---

#### `PATCH /api/profile`

- **Auth scope**: `user`
- **Request** (any subset):
  ```json
  {
    "displayName": "Aarav S.",
    "bio": "GATE 2026 aspirant.",
    "avatarUrl": "https://...",
    "username": "aarav2",
    "examGoal": "GATE",
    "targetYear": 2026,
    "studyHoursGoal": 480,
    "timezone": "Asia/Kolkata"
  }
  ```
- **Response 200**: `{ "profile": { /* updated Profile row */ } }`
- **Errors**: `UNAUTHORIZED`, `BAD_REQUEST`, `USERNAME_TAKEN`
- **Note**: `timezone` is stored on the `User` row (not `Profile`); other fields are
  on `Profile`. Both are updated atomically by this endpoint.

---

#### `GET /api/profile/{username}`

- **Auth scope**: `public` (auth optional — when present, response includes
  `isFriend`, `friendStatus`, `isBlocked`, `isMe`)
- **Response 200**:
  ```json
  {
    "profile": {
      "userId": "ckpq2m2k0...",
      "username": "diya",
      "displayName": "Diya Patel",
      "avatarUrl": null,
      "bio": null,
      "examGoal": "NEET",
      "targetYear": 2025,
      "level": 7,
      "totalMinutes": 1820,
      "totalXp": 18200,
      "streakCount": 0,
      "sessionCount": 38,
      "streak": { "current": 9, "longest": 15 },
      "badges": [ /* earned badges */ ]
    },
    "isFriend": false,
    "friendStatus": "pending",
    "isBlocked": false,
    "isMe": false
  }
  ```
- **Errors**: `NOT_FOUND`

---

### 5.11 Search

---

#### `GET /api/search/users`

- **Auth scope**: `public` (auth optional — when present, blocked users are filtered
  out)
- **Query**: `?q=<text>&limit=10` (limit capped at 20; q must be ≥ 1 char)
- **Response 200**:
  ```json
  {
    "users": [
      {
        "userId": "ckpq2m2k0...",
        "username": "diya",
        "displayName": "Diya Patel",
        "avatarUrl": null,
        "examGoal": "NEET",
        "level": 7
      }
    ]
  }
  ```
  Only onboarding-completed profiles are returned.
- **Errors**: none (always 200; empty array if q is missing/too short).

---

### 5.12 Notifications

---

#### `GET /api/notifications`

- **Auth scope**: `user`
- **Query**: `?unread=true&limit=30` (limit capped at 50)
- **Response 200**:
  ```json
  {
    "notifications": [
      {
        "id": "ckpq1n2o0...",
        "userId": "ckpq7v8m0...",
        "type": "friend_request",
        "title": "New friend request",
        "body": "You have a new friend request",
        "link": "#/friends",
        "read": false,
        "createdAt": "2024-05-12T..."
      }
    ],
    "unreadCount": 3
  }
  ```
- **Errors**: `UNAUTHORIZED`

---

#### `PATCH /api/notifications`

- **Auth scope**: `user`
- **Request**: empty
- **Response 200**: `{ "markedAllRead": true }`
- **Errors**: `UNAUTHORIZED`
- **Side effects**: sets `read=true` on all unread notifications of the caller.

---

#### `PATCH /api/notifications/{id}`

- **Auth scope**: `user`
- **Request**: empty
- **Response 200**: `{ "read": true }`
- **Errors**: `UNAUTHORIZED`, `NOT_FOUND`
- **Side effects**: marks one notification read.
- **Analytics**: fires `notification_opened` (client-side, after this call returns).

---

### 5.13 Subscriptions

---

#### `GET /api/subscriptions`

- **Auth scope**: `user`
- **Response 200**:
  ```json
  {
    "subscription": {
      "id": "ckpq1s2u0...",
      "userId": "ckpq7v8m0...",
      "plan": "free",
      "status": "active",
      "startedAt": "2024-04-01T00:00:00.000Z",
      "renewsAt": null
    }
  }
  ```
- **Errors**: `UNAUTHORIZED`

---

#### `POST /api/subscriptions`

- **Auth scope**: `user`
- **Request**: `{ "plan": "plus" }` or `{ "plan": "pro" }`
- **Response 200**: `{ "subscription": { /* updated Subscription row */ } }`
- **Errors**: `UNAUTHORIZED`, `BAD_REQUEST`
- **Side effects**: in production, this endpoint creates a Razorpay order and returns
  it; the client completes the payment on the Razorpay SDK; the webhook updates the
  row. In the sandbox, the endpoint immediately creates a `Payment(status=paid)` row
  and upgrades the subscription (plan set, `renewsAt = now + 30 days`).
- **Analytics**: fires `subscription_started` and `payment_succeeded`.

---

### 5.14 Referrals

---

#### `GET /api/referrals`

- **Auth scope**: `user`
- **Response 200**:
  ```json
  {
    "code": "aarav-1a2b",
    "referredCount": 4,
    "firstSessionCount": 2
  }
  ```
- **Errors**: `UNAUTHORIZED`

---

### 5.15 Admin

---

#### `GET /api/admin/stats`

- **Auth scope**: `moderator`
- **Response 200**:
  ```json
  {
    "users": 12453,
    "activeUsers": 1820,
    "communities": 11,
    "liveRooms": 17,
    "reports": 23,
    "openReports": 4,
    "sessions": 38201,
    "payments": 124,
    "totalMinutes": 182034,
    "totalXp": 1820340
  }
  ```
- **Errors**: `UNAUTHORIZED`, `FORBIDDEN`

---

#### `GET /api/admin/users`

- **Auth scope**: `moderator`
- **Query**: `?status=&role=&q=&page=1&limit=30` (limit capped at 100)
- **Response 200**:
  ```json
  {
    "users": [
      {
        "id": "ckpq2m2k0...",
        "email": "diya@sankalp.in",
        "role": "user",
        "status": "active",
        "createdAt": "2024-04-01T...",
        "lastLoginAt": "2024-05-12T...",
        "username": "diya",
        "displayName": "Diya Patel",
        "examGoal": "NEET",
        "totalMinutes": 1820,
        "totalXp": 18200,
        "level": 7
      }
    ],
    "page": 1, "limit": 30, "total": 12453
  }
  ```
- **Errors**: `UNAUTHORIZED`, `FORBIDDEN`

---

#### `PATCH /api/admin/users/{id}`

- **Auth scope**: `moderator`
- **Request** (any subset): `{ "role": "moderator", "status": "suspended" }`
- **Response 200**: `{ "user": { "id": "...", "role": "moderator", "status": "active" } }`
- **Errors**: `UNAUTHORIZED`, `FORBIDDEN`, `BAD_REQUEST`, `NOT_FOUND`
- **Side effects**: writes an `AuditLog` row.

---

#### `PATCH /api/admin/reports/{id}`

- **Auth scope**: `admin`
- **Request** (any subset):
  ```json
  { "status": "resolved", "resolution": "warning" }
  ```
  - `status`: one of `open`, `reviewing`, `resolved`, `dismissed`
  - `resolution`: one of `warning`, `mute`, `kick`, `ban`, `no_action`
- **Response 200**: `{ "report": { /* updated Report row */ } }`
- **Errors**: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `BAD_REQUEST`
- **Side effects**: sets `resolvedById = caller.id`, `resolvedAt = now`. Writes an
  `AuditLog`.

---

#### `PATCH /api/admin/rooms/{id}`

- **Auth scope**: `admin`
- **Request** (any subset):
  ```json
  { "isLive": false, "isListed": false, "action": "close" }
  ```
  - `action: "close"` is a shortcut that sets `isLive=false`, `isListed=false`,
    `endedAt=now`.
- **Response 200**: `{ "room": { /* updated Room row */ } }`
- **Errors**: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`
- **Side effects**: writes an `AuditLog`.

---

#### `POST /api/admin/communities`

- **Auth scope**: `admin`
- **Request**:
  ```json
  {
    "slug": "gate-2026",
    "name": "GATE 2026",
    "description": "...",
    "examGoal": "GATE",
    "color": "#10b981",
    "tags": ["2026"],
    "isFeatured": false
  }
  ```
- **Response 200**: `{ "community": { /* new Community row */ } }`
- **Errors**: `UNAUTHORIZED`, `FORBIDDEN`, `BAD_REQUEST`, `SLUG_TAKEN`

---

#### `PATCH /api/admin/communities/{slug}`

- **Auth scope**: `admin`
- **Request** (any subset):
  ```json
  { "name": "GATE 2026", "description": "...", "color": "#0ea5e9", "tags": ["2026"], "isFeatured": true }
  ```
- **Response 200**: `{ "community": { /* updated row */ } }`
- **Errors**: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`

---

### 5.16 Health

---

#### `GET /api/health`

- **Auth scope**: `public`
- **Response 200**:
  ```json
  { "status": "ok", "service": "sankalp-web", "time": "2024-05-12T08:30:00.000Z" }
  ```
- **Errors**: none. Use this for liveness probes.

---

### 5.17 Reserved — `POST /api/user-devices` (planned)

This endpoint is **reserved** in the contract but not yet implemented in the sandbox.
Android MUST implement the request side; the server side will be added before launch.

- **Auth scope**: `user`
- **Request**:
  ```json
  {
    "platform": "android",
    "pushToken": "<FCM token>",
    "appVersion": "1.0.3",
    "osVersion": "14",
    "deviceModel": "Pixel 7"
  }
  ```
- **Expected response 200**:
  ```json
  { "device": { "id": "...", "userId": "...", "platform": "android", "pushToken": "...", "appVersion": "1.0.3", "lastSeenAt": "..." } }
  ```
- **Errors**: `UNAUTHORIZED`, `BAD_REQUEST`
- **Idempotency**: the table is `@@unique([userId, platform])`, so re-registering
  upserts the device row (updates the `pushToken` and `lastSeenAt`).

---

## 6. LiveKit token flow

The Android app uses the official LiveKit Android SDK:
`io.livekit:livekit-android` (latest stable, currently 2.x).

### 6.1 Step-by-step

1. Android has the Sankalp bearer token (from Supabase Auth).
2. Android calls:
   ```
   POST /api/rooms/{id}/token
   Authorization: Bearer <Supabase JWT>
   { "canPublish": true, "canPublishData": false }
   ```
3. The server responds:
   ```json
   {
     "token": "<LiveKit JWT>",
     "url": "wss://sankalp.livekit.cloud",
     "livekitRoom": "sankalp-9f3a2c1b4d8e",
     "identity": "<userId>",
     "wsUrl": "wss://sankalp.livekit.cloud"
   }
   ```
4. Android connects:
   ```kotlin
   val room = LiveKit.create(appContext = applicationContext)
   room.connect(url = response.url, token = response.token)
   ```
5. The token's `video` grant is:
   ```json
   {
     "roomJoin": true,
     "room": "sankalp-9f3a2c1b4d8e",
     "canPublish": true,
     "canSubscribe": true,
     "canPublishData": false
   }
   ```
   - `identity` = `userId`
   - `name` = `displayName`
   - `metadata` = `JSON.stringify({ username, avatarUrl, role })`
6. Android parses `metadata` to render participant tiles without an extra API round-trip.
7. The token TTL is **6 hours**. Android must re-request a token when LiveKit fires
   `reconnect_failure` due to token expiry.

### 6.2 Mic and camera defaults

- Mic defaults **OFF**. Toggle:
  ```kotlin
  room.localParticipant.setMicrophoneEnabled(true)
  ```
  Then notify the server via `PATCH /api/rooms/{id}/presence { micOn: true }` so the
  presence channel reflects the new state.
- Camera defaults **OFF**. Toggle:
  ```kotlin
  room.localParticipant.setCameraEnabled(true)
  ```
  Then `PATCH /api/rooms/{id}/presence { camOn: true }`.
- Screen-share requires `canPublishData: true` in the token request; ask the user
  explicitly before requesting it.

### 6.3 Capacity enforcement

- The server rejects token issuance with `403 ROOM_FULL` when
  `room.participantCount >= room.maxParticipants`.
- Android should surface this as a "Room is full" dialog and offer to retry when a slot
  frees up (poll `GET /api/rooms/{id}` for `participantCount`).

### 6.4 Active-speaker

- Use LiveKit's `Room.activeSpeakers` flow; do not poll the presence endpoint for
  per-frame audio.
- In the sandbox (where LiveKit is not actually connected), drive the speaking
  indicator via `PATCH /api/rooms/{id}/presence { isSpeaking: true|false }` on
  transitions only.

See `docs/livekit.md` for the full media contract (rendering rules, reconnect,
moderation, performance).

---

## 7. Realtime channel — room events stream

### 7.1 Transport

```
GET /api/rooms/{id}/events?token=<bearer>
Accept: text/event-stream
```

The token is passed as a query parameter because the Android SSE client (and the
browser's `EventSource`) cannot set custom headers. The server treats the query
`token` exactly like a Bearer header (see `src/app/api/rooms/[id]/events/route.ts`).

In production, an equivalent WebSocket endpoint `wss://api.sankalp.in/ws/rooms/{id}`
will be added, carrying the same JSON event shapes. Android should abstract the
transport behind a `RoomEvents` interface so the swap is local.

### 7.2 Event types

The server emits the following SSE events. Each is sent as:
```
event: <type>
data: <json>
```

The Android SSE parser must dispatch on `event:` and parse `data:` as JSON.

---

#### `presence`

Full snapshot of the participant list. Sent on initial connect, on every join/leave/
reap, and after every `PATCH /api/rooms/{id}/presence`.

```json
{
  "type": "presence",
  "participants": [
    {
      "userId": "ckpq7v8m0...",
      "username": "aarav",
      "displayName": "Aarav Sharma",
      "avatarUrl": null,
      "micOn": false,
      "camOn": false,
      "isSpeaking": false,
      "role": "host",
      "joinedAt": 1700000000000,
      "lastSeenAt": 1700000020000
    }
  ]
}
```

The Android client MUST NOT locally invent participants. The presence list is the
source of truth for who is in the room.

---

#### `message`

A new chat message (user or system). Sent on `POST /api/rooms/{id}/messages` and on
system events (mute, kick, timer start/stop).

```json
{
  "type": "message",
  "message": {
    "id": "1700000000-1a2b3c",
    "userId": "ckpq7v8m0...",
    "username": "aarav",
    "text": "Let's do 50 minutes of DSA.",
    "isSystem": false,
    "createdAt": 1700000000000
  }
}
```

For system messages, `userId` is `"system"`, `username` is `"system"`, and
`isSystem` is `true`.

---

#### `timer`

The shared room timer state. Sent on initial connect and on every
`POST /api/rooms/{id}/timer`.

```json
{
  "type": "timer",
  "timer": {
    "mode": "focus",
    "endsAt": 1700001500000,
    "round": 3,
    "focusMin": 25,
    "breakMin": 5,
    "startedBy": "ckpq7v8m0..."
  }
}
```

`endsAt` is epoch milliseconds (not ISO). When `mode` is `"idle"`, `endsAt` is `null`
and `startedBy` is `null`.

Android renders remaining time as `max(0, endsAt - Date.now())` and treats the timer
as elapsed when it crosses zero, then waits for the next `timer` event. Android MUST
NOT locally start a new Pomodoro round; only the host can.

---

#### `history`

Initial chat snapshot. Sent **once** immediately after the SSE connection opens,
before any `presence` or `timer` event in some implementations (the sandbox sends
presence first, then history, then timer — but order is best-effort; Android should
render in any order).

```json
{
  "type": "history",
  "messages": [ /* up to 50 most-recent messages, same shape as `message.message` */ ]
}
```

---

### 7.3 Heartbeats

The SSE stream sends a `: hb` comment every 15 seconds (SSE comments start with `:`
and are ignored by `EventSource`). Android's SSE parser must likewise ignore them but
may use them to detect a dead connection (if no comment + no event for 45s, reconnect).

The Android client must additionally `POST /api/rooms/{id}/presence { action:
"heartbeat" }` every **20 seconds** while connected. The server reaps participants
whose `lastSeenAt` is older than **45 seconds**, which causes a `presence` event
without the stale participant to broadcast to everyone else.

---

## 8. Timezones & streaks

### 8.1 Timezone

- `User.timezone` (IANA name, default `"Asia/Kolkata"`) is the user's local timezone.
- Android sends `timezone` in:
  - `PATCH /api/onboarding { timezone }` (the sandbox onboarding route does not
    currently persist it; Android should additionally call `PATCH /api/profile`).
  - `PATCH /api/profile { timezone }`.
- Android obtains the timezone via `TimeZone.getDefault().id` on first onboarding and
  whenever the user changes their device timezone.

### 8.2 Streak rules (server-authoritative)

Implemented in `src/lib/study.ts` `bumpStreak(userId, timezone)`:

- First study session ever (`Streak.lastStudyDate` is null) → `current = 1`,
  `longest = 1`, `lastStudyDate = today`.
- Studied yesterday (local) → `current += 1`, `longest = max(current, longest)`,
  `lastStudyDate = today`.
- Studied today already → no change.
- Gap > 1 day → reset `current = 1`, `longest = max(current, longest)`,
  `lastStudyDate = today`.

The "today" / "yesterday" determination uses `localDateForTimezone(now, timezone)`,
not UTC. A 11:30 PM IST session and a 12:30 AM IST session the next day are on
different local dates and contribute to two consecutive days of the streak.

### 8.3 Android NEVER submits durations or streaks

- Android calls `POST /api/study/sessions { roomId?, communityId?, mode? }` to start
  a session and receives `{ sessionId, startedAt }`.
- Android calls `POST /api/study/sessions/{sessionId}/stop` to stop.
- The server computes `durationMin`, `xpEarned`, `level`, streak, daily goal, and
  badges. Any `durationMin`, `xp`, or `streak` field sent by the client is ignored.
- A session capped at `MAX_SESSION_MIN = 480` minutes (8 hours) — longer sessions are
  truncated to defeat abuse.
- Sub-minute sessions are deleted (no XP, no streak bump).

---

## 9. Push notifications

### 9.1 Device registration (reserved)

The `POST /api/user-devices` endpoint is reserved (see §5.17). Android registers the
device on:

- App first launch after login.
- FCM token refresh.
- App version change.

### 9.2 Source of truth for notifications

- The `Notification` table is the source of truth. Android polls
  `GET /api/notifications?unread=true` on app launch and every 60 seconds while in
  the foreground.
- In production, FCM delivers a push for every new `Notification` row (planned). The
  push payload contains only `notificationId` and `type` — never the message body
  (which may contain PII). The Android app receives the push, fetches
  `GET /api/notifications/{id}` (or `GET /api/notifications?unread=true`), and renders
  locally.
- For the contract: the Android app MUST work without FCM. Polling is the
  fallback. FCM is an optimization.

### 9.3 Notification types

See §4 `notification.type`. Each type maps to an Android deep-link:

| Type               | Deep-link                                  |
| ------------------ | ------------------------------------------ |
| `friend_request`  | `sankalp://friends`                        |
| `friend_accept`   | `sankalp://friends`                        |
| `badge_earned`    | `sankalp://dashboard`                      |
| `goal_completed`  | `sankalp://dashboard`                      |
| `streak_milestone` | `sankalp://dashboard`                     |
| `room_invite`     | `sankalp://rooms/{roomId}` (planned)        |
| `system`          | `sankalp://notifications`                  |
| `report_update`   | `sankalp://admin/reports` (mods/admins only)|

The API's `link` field uses a web hash like `#/friends`; Android maps it to the
equivalent app deep-link.

---

## 10. Versioning & compatibility

### 10.1 Versioning strategy

- The API is currently **unversioned** (no `/v1` prefix). Android pins to the response
  shapes documented in this file.
- A breaking change (renamed field, removed field, changed type, changed semantics)
  requires a new major contract version served at `/api/v2/...`. The old `/api/...`
  endpoints remain available for at least one major Android release cycle.
- Non-breaking changes (new optional field, new endpoint) do not require a version
  bump. Android must ignore unknown fields in responses (forward-compat).

### 10.2 Deprecation policy

- A field marked deprecated in this doc is supported for at least 6 months. Android
  should migrate off it within that window.
- A removed endpoint returns `410 Gone` with `error.code = "DEPRECATED"` for 30 days
  after removal, then `404`.

### 10.3 Compatibility matrix

The contract author maintains a compatibility matrix in this file's git history: each
release tag (e.g. `contract-v1.2.0`) corresponds to a commit. Android locks its
`docs/mobile-contract.md` import to a specific commit SHA at build time.

---

## 11. Testing the contract (Android QA checklist)

The Android app is NOT allowed to ship to production until every item below passes
end-to-end against `https://api-staging.sankalp.in`. Each item is a checkbox the QA
engineer signs off on.

### 11.1 Auth & onboarding

- [ ] Signup with email/password returns 200, `token`, and a `user` with
      `onboardingComplete=false`.
- [ ] Login with the same creds returns 200 and the same `user.id`.
- [ ] Login with bad password returns `401 UNAUTHORIZED`.
- [ ] Login with a suspended account returns `ACCOUNT_SUSPENDED`.
- [ ] Google OAuth via Supabase returns a JWT; `GET /api/auth/me` with that JWT
      returns the user.
- [ ] `PATCH /api/onboarding` with a valid payload returns 200 and the user with
      `onboardingComplete=true`.
- [ ] `PATCH /api/onboarding` with a taken username returns `USERNAME_TAKEN`.
- [ ] `PATCH /api/onboarding` with an invalid `examGoal` returns `BAD_REQUEST`.

### 11.2 Communities

- [ ] `GET /api/communities` returns the 11 seeded communities.
- [ ] `GET /api/communities/gate` returns the community, rooms array, and
      `membership=null` (before joining).
- [ ] `POST /api/communities/gate/join` returns `{ "joined": true }`.
- [ ] Re-joining returns `ALREADY_MEMBER`.
- [ ] `POST /api/communities/gate/leave` returns `{ "left": true }`.
- [ ] Leaving when not a member returns `{ "left": false, "reason": "NOT_MEMBER" }`.

### 11.3 Rooms

- [ ] `POST /api/rooms` with valid fields returns 200 and a room with
      `livekitRoom` starting with `sankalp-`.
- [ ] `POST /api/rooms` with a 2-char name returns `BAD_REQUEST`.
- [ ] `GET /api/rooms?communityId=...&live=true` returns only live rooms in that
      community.
- [ ] `GET /api/rooms/{id}` returns the room, `participants`, and `timer`.
- [ ] `PATCH /api/rooms/{id}` as the owner updates `name`/`maxParticipants`.
- [ ] `PATCH /api/rooms/{id}` as a non-owner returns `FORBIDDEN`.
- [ ] `DELETE /api/rooms/{id}` as the owner sets `endedAt` and `isLive=false`.
- [ ] Re-`GET /api/rooms/{id}` after DELETE returns the closed room.

### 11.4 LiveKit token + connect

- [ ] `POST /api/rooms/{id}/token` returns `{ token, url, livekitRoom, identity,
      wsUrl }`.
- [ ] The token's base64-decoded payload has `video.roomJoin=true`,
      `video.room=<livekitRoom>`, `sub=<userId>`, `name=<displayName>`.
- [ ] Calling token on a full room returns `403 ROOM_FULL`.
- [ ] `room.connect(url, token)` succeeds (against a real LiveKit project in
      staging).
- [ ] Mic toggle via `setMicrophoneEnabled(true)` publishes audio; presence PATCH
      updates `micOn=true`.
- [ ] Camera toggle via `setCameraEnabled(true)` publishes video; presence PATCH
      updates `camOn=true`.
- [ ] Token re-request works after the SDK fires `reconnect_failure` due to expiry.

### 11.5 Presence + SSE

- [ ] `POST /api/rooms/{id}/presence` (join) returns `{ participant, count }`.
- [ ] SSE stream delivers `presence`, `history`, `timer` events on connect.
- [ ] A second participant joining causes a `presence` event on the first client's
      stream.
- [ ] Heartbeat every 20s keeps the participant in `presence`.
- [ ] Stopping heartbeats for >45s causes the participant to disappear from
      `presence` (reaped).
- [ ] `POST /api/rooms/{id}/presence { action: "leave" }` removes the participant
      and triggers a `presence` event.

### 11.6 Timer

- [ ] `POST /api/rooms/{id}/timer { action: "start", mode: "focus", minutes: 25 }`
      as the host returns 200 with `timer.mode="focus"`, `endsAt != null`.
- [ ] A `timer` SSE event is received by all clients.
- [ ] A `participant` calling timer start returns `BAD_REQUEST` `NOT_HOST`.
- [ ] `POST /api/rooms/{id}/timer { action: "stop" }` returns `timer.mode="idle"`,
      `endsAt=null`.

### 11.7 Chat

- [ ] `POST /api/rooms/{id}/messages { text: "hi" }` returns the message.
- [ ] A `message` SSE event is received by all clients (including the sender).
- [ ] Sending an empty text returns `BAD_REQUEST`.
- [ ] Sending as a non-member returns `FORBIDDEN` `NOT_MEMBER`.
- [ ] `GET /api/rooms/{id}/messages?limit=50` returns the persisted channel.

### 11.8 Study

- [ ] `POST /api/study/sessions { roomId }` returns `{ sessionId, startedAt }`.
- [ ] `POST /api/study/sessions/{id}/stop` returns `{ durationMin, xpEarned, level,
      streak, goal, awardedBadges }`.
- [ ] `GET /api/study/sessions` returns the ended session in the history.
- [ ] `GET /api/study/goals/today` returns `achievedMin` reflecting the session.
- [ ] `GET /api/study/streak` returns `current` incremented (or unchanged if same
      day).
- [ ] `GET /api/study/badges` shows `earned=true` for `first_session` after the first
      stop.
- [ ] Starting a new session while one is open auto-closes the old one (verify a
      `study_completed` event is recorded for the old session).
- [ ] Sub-minute sessions return `durationMin: 0` and are deleted.

### 11.9 Leaderboard

- [ ] `GET /api/leaderboard?scope=global&period=weekly` returns rows ordered by
      `minutes` desc.
- [ ] `GET /api/leaderboard?scope=friends&period=daily` (authed) returns rows only
      for the user and their accepted friends.

### 11.10 Social

- [ ] `POST /api/friends { username: "diya" }` returns `{ "requested": true }`.
- [ ] Diya receives a `friend_request` notification.
- [ ] `PATCH /api/friends/{fromUserId} { action: "accept" }` returns
      `{ "status": "accepted" }`.
- [ ] Both sides see each other in `GET /api/friends` `friends` array.
- [ ] `DELETE /api/friends/{id}` removes the friendship.
- [ ] `POST /api/blocks { username: "spammer" }` returns `{ "blocked": true }`,
      removes any friendship, and excludes the blocked user from
      `GET /api/search/users`.

### 11.11 Reports

- [ ] `POST /api/reports { reason: "spam", reportedUserId: "..." }` returns
      `{ "report": { ... } }`.
- [ ] A moderator receives a `report_update` notification.
- [ ] `GET /api/reports?status=open` (moderator) returns the report.
- [ ] `GET /api/reports` as a regular user returns `FORBIDDEN`.
- [ ] `PATCH /api/admin/reports/{id} { status: "resolved", resolution: "warning" }`
      (admin) returns the updated report and writes an `AuditLog`.

### 11.12 Notifications

- [ ] `GET /api/notifications` returns the list and `unreadCount`.
- [ ] `PATCH /api/notifications/{id}` marks one read.
- [ ] `PATCH /api/notifications` marks all read; `unreadCount` returns 0 next call.

### 11.13 Subscriptions

- [ ] `GET /api/subscriptions` returns `plan=free` initially.
- [ ] `POST /api/subscriptions { plan: "plus" }` returns the upgraded subscription
      with `renewsAt` set.
- [ ] In production, the Razorpay order is created and the webhook updates the
      subscription.

### 11.14 Profile & search

- [ ] `PATCH /api/profile { bio, displayName, timezone }` updates the profile.
- [ ] `GET /api/profile/aarav` returns the public profile with `isFriend`,
      `friendStatus`, `isBlocked`, `isMe`.
- [ ] `GET /api/search/users?q=diya` returns Diya's profile.
- [ ] `GET /api/search/users` after blocking Diya excludes her from results.

### 11.15 Admin

- [ ] `GET /api/admin/stats` (moderator) returns the platform stats.
- [ ] `GET /api/admin/users?q=...` (moderator) returns paginated users.
- [ ] `PATCH /api/admin/users/{id} { status: "suspended" }` suspends the user.
- [ ] The suspended user's next `GET /api/auth/me` returns `401 UNAUTHORIZED`
      (because `getAuth` rejects `status != "active"`).

### 11.16 Health

- [ ] `GET /api/health` returns `{ "status": "ok" }` with no auth header.

### 11.17 End-to-end study room session

- [ ] Signup → onboarding → join community → create room → request token → connect
      LiveKit → start session → toggle mic → start timer → send a chat → stop
      session → stop timer → leave room → disconnect LiveKit → verify XP, streak,
      leaderboard rank, and badges updated.

Every checkbox in this section must be green before each Android release.
