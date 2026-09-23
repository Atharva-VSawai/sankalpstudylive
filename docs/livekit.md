# LiveKit — Live Study Rooms

This document is the **binding contract** for how Sankalp uses [LiveKit](https://livekit.io/) for live
video/audio study rooms. The web SPA and the future Android app MUST consume LiveKit through the
exact flow described here. Nothing in this contract differs between the sandbox runtime
(Next.js API routes + simulated token) and production (FastAPI + `livekit-server-sdk`).

Related: `docs/mobile-contract.md` §6 (LiveKit token flow), `docs/architecture.md`,
`AGENTS.md` §1 (the Android app reuses this backend).

---

## 1. Overview

Sankalp uses LiveKit Cloud for the real-time media plane of every live study room.

- Each Sankalp `Room` row (see `prisma/schema.prisma`) carries a unique `livekitRoom` name of the
  form `sankalp-<12 hex chars>`, generated server-side when the room is created
  (`POST /api/rooms`).
- The `livekitRoom` name is opaque to clients. Clients never mint it. They learn it from the
  `POST /api/rooms/{id}/token` response.
- All media (microphone, camera, screen-share) flows through LiveKit's WebRTC SFU. Sankalp's
  backend never terminates media — it only mints access tokens and records room metadata.
- Persistent room metadata (name, description, members, messages history, timer) lives in
  Postgres/Supabase. Ephemeral presence (mic/cam/active-speaker) lives in Redis in production
  (in-memory map in the sandbox — see `src/lib/presence.ts`).

---

## 2. Token flow (the binding contract)

This is the only way any client (web or Android) joins a LiveKit room.

```
┌─────────┐   POST /api/rooms/{id}/token          ┌────────────┐
│ Client  │ ─────────────────────────────────────▶│ Sankalp API │
│ (Web/   │   Authorization: Bearer <Supabase JWT>│            │
│ Android)│                                       │ 1. Verify  │
└─────────┘                                       │    auth    │
     ▲                                             │ 2. Load    │
     │ { token, url, livekitRoom, identity, wsUrl }│    room+   │
     │                                             │    profile │
     │                                             │ 3. Capacity│
     │                                             │    check   │
     │                                             │ 4. Upsert  │
     │                                             │  RoomMember│
     │                                             │ 5. Mint JWT│
     └─────────────────────────────────────────────┴────────────┘
                          │
                          ▼
            room.connect(url, token)  ← official LiveKit SDK
```

### 2.1 Request

```
POST /api/rooms/{id}/token
Authorization: Bearer <Supabase JWT>
Content-Type: application/json

{
  "canPublish": true,      // optional, default true. Set false for viewer-only tokens.
  "canPublishData": true   // optional, default false. Set true to allow screen-share / data messages.
}
```

### 2.2 Response (200 OK)

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.<payload>.<sig>",
  "url": "wss://sankalp.livekit.cloud",
  "livekitRoom": "sankalp-9f3a2c1b4d8e",
  "identity": "ckpq7v8m0... cuid",
  "wsUrl": "wss://sankalp.livekit.cloud"
}
```

`url` and `wsUrl` are the same value (kept under both keys for client SDK compatibility). The
value is `process.env.LIVEKIT_URL`. In the sandbox the URL is the placeholder
`wss://sankalp.livekit.cloud`; in production it is the project's LiveKit Cloud URL.

### 2.3 Error codes

| Status | Code          | When                                              |
| ------ | ------------- | ------------------------------------------------- |
| 401    | `UNAUTHORIZED`| Missing/invalid Bearer token.                      |
| 400    | `BAD_REQUEST` | Profile missing (user has not completed onboarding).|
| 403    | `ROOM_FULL`   | `room.participantCount >= room.maxParticipants`.    |
| 404    | `NOT_FOUND`   | Room does not exist.                              |

### 2.4 JWT shape (HS256)

The token is a standard LiveKit access token. Its payload, base64url-decoded:

```json
{
  "iss": "<LIVEKIT_API_KEY>",
  "sub": "<userId>",
  "iat": 1700000000,
  "exp": 1700021600,
  "nbf": 1700000000,
  "video": {
    "roomJoin": true,
    "room": "sankalp-9f3a2c1b4d8e",
    "canPublish": true,
    "canSubscribe": true,
    "canPublishData": false,
    "hidden": false,
    "recorder": false
  },
  "name": "Aarav Sharma",
  "metadata": "{\"username\":\"aarav\",\"avatarUrl\":null,\"role\":\"participant\"}"
}
```

- `sub` / `identity` = the Sankalp `User.id` (cuid in sandbox, `gen_random_uuid()` in Postgres).
- `name` = `Profile.displayName`. Shown by the LiveKit SDK in the participant list.
- `metadata` = a JSON-encoded string of `{ username, avatarUrl, role }`. Clients parse this
  to render participant tiles without an extra API round-trip.
- TTL: **6 hours** (`exp = iat + 6*3600`). Clients must re-request a fresh token before expiry;
  the LiveKit SDK emits a reconnection failure when the token expires.

---

## 3. Sandbox vs. production signing

| Concern               | Sandbox                                            | Production                                     |
| --------------------- | -------------------------------------------------- | ---------------------------------------------- |
| Signing library        | Hand-rolled HS256 in `src/app/api/rooms/[id]/token/route.ts` | `livekit-server-sdk` `AccessToken`            |
| API key                | `sankalp-demo-key` (env override: `LIVEKIT_API_KEY`) | Real LiveKit Cloud API key in Vercel/Railway env |
| API secret             | `sankalp-demo-secret-change-me` (env: `LIVEKIT_API_SECRET`) | Real LiveKit Cloud secret, server-only       |
| LiveKit URL            | `wss://sankalp.livekit.cloud` (placeholder)        | Project's LiveKit Cloud wss URL                |
| JWT structure          | Identical to `livekit-server-sdk` output           | Identical                                      |
| Android SDK            | Works against the same JWT shape                   | Works against the same JWT shape               |

**The API contract does not change between sandbox and production.** A token minted in the
sandbox will be rejected by LiveKit Cloud (the secret is different) but is byte-for-byte
the same shape. This means a client built against the sandbox can be repointed at the
production endpoint with zero code changes.

In production, swap the `buildLiveKitToken` helper for:

```ts
import { AccessToken } from "livekit-server-sdk"
const at = new AccessToken(apiKey, apiSecret, { identity, name, metadata, ttl: "6h" })
at.addGrant({ roomJoin: true, room, canPublish, canSubscribe, canPublishData })
const token = await at.toJwt()
```

---

## 4. Media defaults

| Setting              | Default on join | How to change                                            |
| -------------------- | --------------- | -------------------------------------------------------- |
| Microphone           | **OFF** (muted)  | `LocalParticipant.setMicrophoneEnabled(true)`             |
| Camera               | **OFF**          | `LocalParticipant.setCameraEnabled(true)`                |
| Screen share         | OFF             | Requires `canPublishData: true` on the token request       |
| Subscribing to others| ON              | Always `canSubscribe: true` in the token grant           |

These defaults are encoded twice so the client and server agree:

1. **Persistent** — `RoomMember.muted = true` and `RoomMember.cameraOff = true` on join
   (see `src/app/api/rooms/[id]/token/route.ts` and `src/app/api/rooms/route.ts`).
2. **Ephemeral** — the presence participant also starts with `micOn: false, camOn: false`
   (see `src/lib/presence.ts` `joinRoom`).

A participant toggles their mic/cam via `PATCH /api/rooms/{id}/presence` with
`{ micOn, camOn }`, which updates the in-memory presence row and broadcasts a `presence`
event on the SSE stream. The LiveKit SDK also mirrors this directly when the client calls
`setMicrophoneEnabled` / `setCameraEnabled`.

The host can mute **others** via `PATCH /api/rooms/{id}/members/{userId}` with
`{ muted: true }`. This updates `RoomMember.muted` and emits a system chat message. The
LiveKit SDK itself does not enforce server-side mute; the muted client is expected to honor
the `muted` flag locally. A future server-side enforcement can use LiveKit's
`RoomService.UpdateParticipant` to revoke the `canPublish` grant.

---

## 5. Active-speaker detection

LiveKit provides active-speaker detection natively: each participant's `AudioTrack` exposes
`isSpeaking` (true while the participant's audio energy crosses a threshold). The web client
uses this directly.

In the sandbox, where LiveKit is not actually connected, the client instead drives
active-speaker via the presence PATCH endpoint:

```
PATCH /api/rooms/{id}/presence
Authorization: Bearer <jwt>
Content-Type: application/json

{ "isSpeaking": true }
```

This updates the presence row and broadcasts a `presence` SSE event so other tiles can show
the speaking indicator. In production the Android client should rely on LiveKit's
`Room.activeSpeakers` callback and **not** spam the presence PATCH on every audio frame —
the presence channel is for slow-changing metadata (mic/cam/role), not per-frame audio.

---

## 6. Reconnect

Two independent reconnect layers:

1. **LiveKit SDK reconnect.** The official SDKs (web `livekit-client`, Android
   `io.livekit:livekit-android`) auto-reconnect on network drops, ICE restarts, and SFU
   failover. Tokens remain valid for 6 hours; the SDK reconnects transparently within that
   window. If the token has expired, the SDK fires a `reconnecting` → `reconnect_failure`
   sequence; the client must re-request `POST /api/rooms/{id}/token`.
2. **Presence heartbeat.** Each client must `POST /api/rooms/{id}/presence` with
   `{ "action": "heartbeat" }` every **20 seconds**. The server reaps participants whose
   `lastSeenAt` is older than **45 seconds** (`reapStale` in `src/lib/presence.ts`). On reaping,
   a `presence` event is broadcast so the remaining clients prune the stale tile.

The heartbeat cadence (20s) and reap window (45s) are chosen so that two missed heartbeats
indicate a real disconnect rather than jitter.

---

## 7. Moderation

Hosts, co-hosts, moderators, and admins can manage other participants:

| Action          | Method & path                                  | Body                          | Effect                                            |
| --------------- | ---------------------------------------------- | ----------------------------- | ------------------------------------------------- |
| Mute a participant | `PATCH /api/rooms/{id}/members/{userId}`     | `{ "muted": true }`           | Sets `RoomMember.muted=true`, posts a system message.|
| Change role     | `PATCH /api/rooms/{id}/members/{userId}`     | `{ "role": "co_host" }`       | Promotes/demotes within `host|co_host|participant|viewer`. Cannot change the room owner. |
| Kick            | `DELETE /api/rooms/{id}/members/{userId}`     | —                             | Removes the participant from presence, sets `leftAt`, posts a system message. Cannot kick the owner. |

Authorization: the requester must be the room owner, a `host` or `co_host` RoomMember, or
a platform `moderator`/`admin` (see `src/app/api/rooms/[id]/members/[userId]/route.ts`).

A future production hardening can additionally call LiveKit's `RoomService.RemoveParticipant`
to physically eject the user from the LiveKit room. The current contract handles only the
Sankalp-side membership state; well-behaved clients must honor the kicked flag and disconnect.

---

## 8. Capacity

- `Room.maxParticipants` defaults to **20**, can be set at creation between **2 and 50**
  (see `POST /api/rooms` body field `maxParticipants`).
- `Room.participantCount` is maintained server-side from the presence channel length.
- Token issuance refuses when `participantCount >= maxParticipants` with
  `403 ROOM_FULL` (see `src/app/api/rooms/[id]/token/route.ts`).
- The owner can change `maxParticipants` after creation via `PATCH /api/rooms/{id}`
  (capped at 50).

A higher cap requires a LiveKit Cloud plan that allows it — the 50 cap is a Sankalp
policy, not a LiveKit limit.

---

## 9. Performance: rendering rules (NON-NEGOTIABLE)

Live study rooms can have up to 50 participants. Rendering 50 high-resolution WebRTC
streams on a single device will overheat the GPU, exhaust the decoder, and stutter the
audio. Both web and Android clients MUST follow this rule:

> **Render a grid of low-resolution participant tiles plus a single high-resolution
> "speaker" tile. Do NOT render unlimited high-res streams.**

Concretely:

1. Connect with **adaptive streaming** enabled (the default in the official SDKs). LiveKit
   will layer each published track at multiple spatial/Temporal qualities and the
   subscriber chooses per-tile quality based on the on-screen size of that tile.
2. For tiles displayed at < 200×200 px, subscribe only to the **low layer** (sub-VGA).
3. Maintain a single "spotlight" participant — the active speaker (or the host's pinned
   participant) — and subscribe to its **high layer** (720p) only.
4. When a participant stops being the active speaker, downgrade their subscription back to
   the low layer.
5. For a room of N participants, the client should subscribe to N−1 low layers + 1 high
   layer — never N high layers.
6. Screen-share tracks (`canPublishData`) are always subscribed at high resolution, but
   there is at most one screen-share per room at a time.

On the web, this is achieved with `Room.connect` + per-track `TrackPublication.setSubscribedQuality`.
On Android, use `Room.connect` + `RemoteParticipant.getTrackPublication` and the
`RemoteTrackPublication.setSubscribedQuality` API. Both SDKs auto-subscribe at low quality
by default when adaptive streaming is on; explicit quality pinning is for the spotlight.

This rule is also enforced via `Room.focusMode = true` (the default), which on the server
tells the SDK to fan out only the spotlight participant's high-res track to everyone else.

---

## 10. Room lifecycle

```
create ──▶ live ──▶ close
```

| Stage  | Trigger                                                                 | State in DB                                          |
| ------ | ---------------------------------------------------------------------- | ---------------------------------------------------- |
| create | `POST /api/rooms` by an authed user.                                   | `Room.isLive=true`, `startedAt=now`, `isListed=!isPrivate`. Owner becomes `host` RoomMember. |
| live   | Participants join via token + presence POST.                           | `participantCount` increments; `RoomMember.leftAt=null`. |
| close  | `DELETE /api/rooms/{id}` by owner/mod/admin, **or** the host leaves.   | `isLive=false`, `isListed=false`, `endedAt=now`.      |

Closing does not delete the room row; it ends it. Historical messages and session records
remain queryable. A future cleanup job may archive rooms with `endedAt` older than 30 days.

A LiveKit room is not explicitly destroyed server-side at Sankalp close time — LiveKit
auto-destroys the room when its last participant leaves. If a moderator force-closes the
room, the Sankalp-side `endedAt` is set and the LiveKit room will reap when clients
disconnect (their token is still valid but the next presence POST will 404).

---

## 11. Shared timer (Pomodoro)

The room timer is **server-authoritative**. Clients never agree on a timer locally; they
read from the SSE stream and issue control commands through `POST /api/rooms/{id}/timer`.

### 11.1 Start / stop

```
POST /api/rooms/{id}/timer
Authorization: Bearer <jwt>
Content-Type: application/json

{ "action": "start", "mode": "focus", "minutes": 25 }   // or "break"
{ "action": "stop" }
```

Only the room owner, host, or co-host can control the timer (`participant`/`viewer` get
`400 NOT_HOST`). Starting a timer also posts a system chat message ("Aarav started a 25 min
focus timer").

### 11.2 Timer state shape

Returned by `POST /api/rooms/{id}/timer`, by `GET /api/rooms/{id}`, and broadcast on the SSE
stream as `{ type: "timer", timer: {...} }`:

```json
{
  "mode": "focus",          // "focus" | "break" | "idle"
  "endsAt": 1700001500000,  // epoch ms; null when idle
  "round": 3,               // focus-round counter
  "focusMin": 25,
  "breakMin": 5,
  "startedBy": "ckpq7v8m0..."
}
```

### 11.3 Broadcast

When the timer changes, every listener on the SSE stream
(`GET /api/rooms/{id}/events`) receives a `timer` event. Clients render the remaining time
by computing `endsAt - Date.now()` locally; they do not poll. When `endsAt` passes, the
client should treat the timer as elapsed and wait for the next `timer` event (which will
either start a new round or go `idle`).

Android must connect to the same SSE (or, in production, the equivalent WebSocket — see
`docs/architecture.md`) for timer state. The Android client never invents a timer.

### 11.4 Pomodoro config

`Room.pomodoroConfig` (JSON) holds `{ focusMin, breakMin, longBreakMin, rounds }`. Defaults
are 25/5/15/4. The config is set at room creation and is advisory — the host can start any
length of focus/break between 1 and 180 minutes per request.

---

## 12. Chat

In-room chat is persisted (in Postgres via `RoomMessage`) and also broadcast live on the
SSE stream.

```
POST /api/rooms/{id}/messages
Authorization: Bearer <jwt>
Content-Type: application/json

{ "text": "Let's do 50 minutes of DSA." }
```

- Requires the caller to be a `RoomMember` of the room (`403 NOT_MEMBER` otherwise).
- Text is trimmed to 500 characters.
- The message is broadcast as a `message` event on the SSE stream and is also retrievable
  via `GET /api/rooms/{id}/messages?limit=50`.

Android reads chat from the same SSE channel and writes via the same POST. There is no
separate "mobile chat" endpoint.

---

## 13. Security

- The `LIVEKIT_API_SECRET` is server-only. It is never bundled into the web client or
  the Android app. The token mint endpoint is the only place that touches the secret.
- Tokens are scoped: a token issued for room `sankalp-9f3a2c1b4d8e` cannot be used to join
  any other room (the `video.room` grant pins it). The LiveKit server enforces this.
- Token TTL is **6 hours**, deliberately shorter than the 30-day session token. This
  limits replay value if a token leaks.
- `canPublish` defaults to true; `canPublishData` defaults to false. The Android app
  requests `canPublishData: true` only when the user explicitly starts screen-share.
- The metadata blob is small (≤ 1KB) and carries no PII — only username, avatarUrl, role.
- See `docs/security.md` for the broader threat model.

---

## 14. End-to-end join sequence (Android reference)

```
1. POST /api/auth/login                 → Bearer <jwt>
2. POST /api/rooms  { name, communitySlug, maxParticipants: 20 }   → { room: { id, ... } }
3. POST /api/communities/{slug}/join    → membership established
4. POST /api/rooms/{id}/token           → { token, url, livekitRoom, identity }
5. POST /api/rooms/{id}/presence  { micOn:false, camOn:false }     → { participant, count }
6. GET  /api/rooms/{id}/events?token=<jwt>  → SSE stream
7. room.connect(url, token)             → LiveKit SDK joins
8. POST /api/study/sessions  { roomId } → { sessionId, startedAt }
   ... every 20s ...
9. POST /api/rooms/{id}/presence { action:"heartbeat" }
   ... when user stops ...
10. POST /api/study/sessions/{sessionId}/stop   → { durationMin, xpEarned, level, streak, ... }
11. POST /api/rooms/{id}/presence { action:"leave" }
12. room.disconnect()
```

Steps 4, 5, 7, 9, 11 are LiveKit-specific. Steps 1–3, 6, 8, 10 are Sankalp REST and are
documented exhaustively in `docs/mobile-contract.md`.
