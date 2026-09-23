# Analytics

This document defines the **canonical Sankalp analytics event vocabulary** and the rules for
firing each event. The web SPA and the future Android app MUST emit these events using the
exact event names and property shapes below so dashboards, funnels, and retention cohorts
are consistent across platforms.

Related: `docs/mobile-contract.md` (REST contract), `docs/security.md` (PII rules),
`docs/architecture.md` (PostHog + Sentry wiring).

---

## 1. Tools

| Concern                  | Tool                       | Where it runs                                  |
| ------------------------ | -------------------------- | ---------------------------------------------- |
| Product analytics        | PostHog (Cloud or self-host) | Server-side (FastAPI → `posthog-python`) **and** client-side (web → `posthog-js`, Android → `posthog-android`) |
| Error + perf monitoring  | Sentry                     | Next.js (`@sentry/nextjs`), Android (`sentry-android`), FastAPI (`sentry-sdk`) |
| Liveness / uptime        | UptimeRobot or BetterStack | Probes `GET /api/health` every 60s             |
| Identity resolution      | PostHog `$identify` / alias | On `signup_completed` the anonymous `distinct_id` is aliased to the user's UUID. |

PostHog receives two streams of events:

- **Server-side events** for state-changing actions that the server is the source of truth
  for (study completion, badge awarded, payment succeeded, room token issued). These are
  fired by the `trackEvent(userId, event, props)` helper (see `src/lib/study.ts`). In
  production that helper calls `posthog.capture(distinct_id=userId, event=event,
  properties=props)`. The sandbox version is a no-op.
- **Client-side events** for UI interactions that the server never sees (page views,
  button taps, scroll depth, modal opens, feature-flag impressions). These are emitted
  from the web SPA via the `posthog-js` SDK and from Android via the `posthog-android`
  SDK. They share the same `distinct_id` as the server events.

The full event list below covers **both** streams. Each event entry notes where it fires.

---

## 2. Identity

- `distinct_id` is the Sankalp `User.id` (cuid in sandbox, UUID in Postgres production)
  for any event emitted after signup.
- Before signup, the web SPA and the Android app generate a stable anonymous
  `distinct_id` (e.g. a generated UUID stored in `localStorage` /
  `SharedPreferences`). Landing-page views and signup-form interactions use this anonymous
  id.
- On `signup_completed`, the client calls PostHog `$alias` (or `posthog.alias`) so the
  anonymous id and the user UUID resolve to the same person. From that point on, both
  client and server use the user UUID as `distinct_id`.
- The `email` field is never sent to PostHog. Username is also omitted from client-side
  events. Server-side events include only `userId` and the documented properties below.

---

## 3. Activation, retention, funnel

### 3.1 Activation definition

A user is **"activated"** when **both** of these happen:

1. `onboarding_completed` fires (PATCH `/api/onboarding` succeeded), AND
2. `study_started` fires for the first time (POST `/api/study/sessions` returned a
   `sessionId`).

A user who signs up but does not complete onboarding is "signed_up" but not "activated".

### 3.2 Retention definitions

- **D1 retention** — user has a `study_completed` event on the calendar day after their
  first `study_completed`.
- **D7 retention** — user has a `study_completed` event on the 7th calendar day after
  their first `study_completed`.
- **D30 retention** — same, 30th calendar day.
- **Weekly streak retention** — user fires `streak_milestone` at week N for weeks 1..N.
  The `streak` property on `streak_milestone` is the streak count; the cohort chart groups
  by `streak mod 7 == 0`.

### 3.3 Core funnel

```
landing_visit
  └─▶ signup_completed
       └─▶ onboarding_completed
            └─▶ community_joined
                 └─▶ room_joined
                      └─▶ study_started
                           └─▶ study_completed
                                └─▶ goal_completed
```

Each arrow is a conversion step in the PostHog funnel. The expected drop-off is heaviest
between `landing_visit` → `signup_completed` and between `room_joined` → `study_started`.

---

## 4. Canonical event list

The table below is the single source of truth. The web SPA, the Android app, and the
FastAPI backend MUST use these exact event names. Adding a new event requires bumping
this doc and is a contract change for Android (see `docs/mobile-contract.md` §10).

| Event                     | Trigger                                                                                                       | Where it fires                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `signup_completed`        | `POST /api/auth/signup` 201                                                                                   | Server                             |
| `onboarding_completed`    | `PATCH /api/onboarding` 200                                                                                    | Server                             |
| `community_joined`        | `POST /api/communities/{slug}/join` 200, or auto-join during onboarding                                       | Server                             |
| `room_joined`             | `POST /api/rooms/{id}/presence` 200 (action != leave)                                                         | Server                             |
| `study_started`           | `POST /api/study/sessions` 201                                                                                | Server                             |
| `study_completed`         | `POST /api/study/sessions/{id}/stop` 200 (or auto-close of a dangling session in `closeSession`)              | Server                             |
| `study_duration`          | Same as `study_completed`, with the duration in minutes                                                       | Server                             |
| `goal_completed`          | `bumpDailyGoal` flips `completed` to true                                                                      | Server                             |
| `streak_created`          | First-ever `bumpStreak` for a user (`Streak.lastStudyDate` was null)                                          | Server                             |
| `streak_milestone`        | `bumpStreak` raises the streak to a multiple of 7                                                              | Server                             |
| `badge_earned`             | `evaluateBadges` grants a new badge (per badge)                                                              | Server                             |
| `friend_request_sent`     | `POST /api/friends` 200                                                                                        | Server                             |
| `friend_accepted`         | `PATCH /api/friends/{id}` with `action=accept` 200                                                            | Server                             |
| `notification_opened`     | Client observes the user opening a notification row (PATCH `/api/notifications/{id}` is called)               | Client (web + Android)             |
| `report_created`          | `POST /api/reports` 200                                                                                        | Server                             |
| `referral_signup`         | New user signs up with a `referralCode` and the referral row is bound                                         | Server                             |
| `referral_first_session`  | Referred user completes first `study_completed` (referral status flips to `first_session`)                    | Server                             |
| `subscription_started`    | `POST /api/subscriptions` 200, plus a `Payment` row with `status=paid`                                        | Server                             |
| `payment_succeeded`        | `Payment.status` flips to `paid`                                                                               | Server                             |
| `room_created`            | `POST /api/rooms` 201                                                                                         | Server                             |
| `user_blocked`            | `POST /api/blocks` 200                                                                                       | Server                             |
| `room_token_issued`       | `POST /api/rooms/{id}/token` 200                                                                              | Server                             |

### 4.1 Property schemas

For each event below, the listed properties MUST be included on every capture. Server
events also include a server-set `$lib` of `sankalp-api` and the Sankalp release tag;
client events include the SDK's default.

#### `signup_completed`
```json
{
  "userId": "ckpq7v8m0...",
  "method": "email" | "google",
  "referralCode": "aarav-1a2b" | null,
  "anonymousId": "anon-uuid-from-client"
}
```
The `anonymousId` is the PostHog anonymous `distinct_id` from before signup; the server
emits an `$alias` call so the two resolve to the same person.

#### `onboarding_completed`
```json
{
  "userId": "ckpq7v8m0...",
  "examGoal": "GATE",
  "targetYear": 2026,
  "studyHoursGoal": 360,
  "timezone": "Asia/Kolkata"
}
```

#### `community_joined`
```json
{
  "userId": "ckpq7v8m0...",
  "communitySlug": "gate",
  "examGoal": "GATE",
  "source": "onboarding" | "discover" | "search" | "deeplink"
}
```
The `source` is recorded from a client-supplied header/query (best-effort) so growth
experiments can attribute joins.

#### `room_joined`
```json
{
  "userId": "ckpq7v8m0...",
  "roomId": "ckpq8n2k0...",
  "livekitRoom": "sankalp-9f3a2c1b4d8e",
  "communitySlug": "gate" | null,
  "role": "host" | "co_host" | "participant" | "viewer"
}
```

#### `study_started`
```json
{
  "userId": "ckpq7v8m0...",
  "sessionId": "ckpq9o3m1...",
  "mode": "focus" | "pomodoro",
  "roomId": "ckpq8n2k0..." | null,
  "communityId": "ckpq1m2k0..." | null
}
```

#### `study_completed`
```json
{
  "userId": "ckpq7v8m0...",
  "sessionId": "ckpq9o3m1...",
  "durationMin": 50,
  "xp": 500,
  "mode": "focus" | "pomodoro" | "break",
  "roomId": "ckpq8n2k0..." | null,
  "communityId": "ckpq1m2k0..." | null
}
```
`durationMin` is server-computed (`Math.min(8*60, round((endedAt - startedAt)/60000))`).
Sub-minute sessions are deleted and do NOT fire `study_completed`.

#### `study_duration`
A convenience duplicate of `study_completed` for cohort queries:
```json
{ "userId": "...", "durationMin": 50, "mode": "focus" }
```

#### `goal_completed`
```json
{
  "userId": "ckpq7v8m0...",
  "date": "2024-05-12",
  "targetMin": 360,
  "achievedMin": 380
}
```
Fires only on the transition from `completed=false` to `completed=true` (not on every
session that overshoots the goal).

#### `streak_created`
```json
{ "userId": "ckpq7v8m0...", "current": 1 }
```

#### `streak_milestone`
```json
{ "userId": "ckpq7v8m0...", "streak": 7 }
```
Fires when the new `streak.current` is a positive multiple of 7 (7, 14, 21, ...).

#### `badge_earned`
```json
{
  "userId": "ckpq7v8m0...",
  "slug": "first_session",
  "tier": "bronze",
  "xpReward": 50
}
```
Fires once per badge award (per-user per-badge).

#### `friend_request_sent`
```json
{
  "userId": "ckpq7v8m0...",
  "toUserId": "ckpq2m2k0..."
}
```
The target's `username` is intentionally omitted.

#### `friend_accepted`
```json
{
  "userId": "ckpq7v8m0...",
  "byUserId": "ckpq2m2k0..."
}
```

#### `notification_opened` (client-side)
```json
{
  "userId": "ckpq7v8m0...",
  "notificationId": "ckpq3k1m0...",
  "type": "friend_request" | "badge_earned" | ...
}
```

#### `report_created`
```json
{
  "userId": "ckpq7v8m0...",
  "reportId": "ckpq4r2m0...",
  "reason": "spam" | "harassment" | "cheating" | "nsfw" | "other",
  "targetType": "user" | "room" | "message"
}
```
`detail` is never sent to PostHog (free text may contain PII).

#### `referral_signup`
```json
{
  "userId": "ckpq7v8m0...",
  "referrerId": "ckpq9m2k0...",
  "referralCode": "aarav-1a2b"
}
```

#### `referral_first_session`
```json
{
  "userId": "ckpq9o3m1...",
  "referrerId": "ckpq9m2k0..."
}
```

#### `subscription_started`
```json
{
  "userId": "ckpq7v8m0...",
  "plan": "plus" | "pro",
  "amountPaise": 29900,
  "currency": "INR",
  "provider": "razorpay"
}
```

#### `payment_succeeded`
```json
{
  "userId": "ckpq7v8m0...",
  "paymentId": "ckpq8n2k0...",
  "plan": "plus",
  "amountPaise": 29900,
  "currency": "INR",
  "provider": "razorpay",
  "providerRef": "pay_..."
}
```

#### `room_created`
```json
{
  "userId": "ckpq7v8m0...",
  "roomId": "ckpq8n2k0...",
  "livekitRoom": "sankalp-9f3a2c1b4d8e",
  "communitySlug": "gate" | null,
  "maxParticipants": 20,
  "isPrivate": false,
  "focusMode": true
}
```

#### `user_blocked`
```json
{
  "userId": "ckpq7v8m0...",
  "blockedId": "ckpq2m2k0..."
}
```

#### `room_token_issued`
```json
{
  "userId": "ckpq7v8m0...",
  "roomId": "ckpq8n2k0...",
  "livekitRoom": "sankalp-9f3a2c1b4d8e",
  "canPublish": true,
  "canPublishData": false
}
```

### 4.2 Client-only UI events (small set, name-spaced)

These are emitted by the web/Android SDKs only (no server event):

| Event                    | Properties                                   | Trigger                                 |
| ------------------------ | -------------------------------------------- | ---------------------------------------- |
| `landing_visit`          | `{ referrer: document.referrer }`             | Landing page mount                       |
| `signup_form_started`    | `{}`                                          | User focuses any signup form field       |
| `room_create_clicked`   | `{ communitySlug: ... | null }`              | User taps "Create room"                  |
| `timer_start_clicked`    | `{ roomId, mode }`                            | User taps start on the Pomodoro control  |
| `mic_toggled`            | `{ roomId, micOn }`                           | User toggles mic                         |
| `cam_toggled`            | `{ roomId, camOn }`                           | User toggles camera                      |
| `share_room_copied`     | `{ roomId }`                                  | User taps "copy invite link"             |

Add new UI events sparingly. Each new event is a contract change for Android.

---

## 5. PostHog integration

### 5.1 Server-side (FastAPI)

```python
from posthog import Posthog
posthog = Posthog(project_api_key=os.environ["POSTHOG_KEY"], host=os.environ.get("POSTHOG_HOST"))

def track_event(user_id: str | None, event: str, props: dict | None = None):
    posthog.capture(
        distinct_id=user_id or "anonymous",
        event=event,
        properties=props or {},
    )
```

- `POSTHOG_KEY` is **server-only**; never bundled into the Android app.
- Calls are fire-and-forget; the SDK batches and retries on the posthog-python
  background thread.
- The SDK is initialized at FastAPI startup; shutdown flushes the queue.

### 5.2 Client-side (web SPA, `posthog-js`)

```ts
import posthog from "posthog-js"
posthog.init(import.meta.env.NEXT_PUBLIC_POSTHOG_KEY, {
  api_host: import.meta.env.NEXT_PUBLIC_POSTHOG_HOST,
  autocapture: false,           // we capture events explicitly to keep PII out
  disable_session_recording: true,
})
posthog.identify(user.id, { examGoal: user.profile.examGoal, level: user.profile.level })
```

- `NEXT_PUBLIC_POSTHOG_KEY` is exposed to the client (it is a public key by design).
- `autocapture: false` — we opt out of automatic DOM capture to keep PII out.
- `disable_session_recording: true` until we have an explicit opt-in flow.

### 5.3 Client-side (Android, `posthog-android`)

```kotlin
val posthog = PostHog.Builder(context)
  .apiKey(BuildConfig.POSTHOG_KEY)
  .host(BuildConfig.POSTHOG_HOST)
  .captureScreenViews(false)
  .build()
posthog.identify(user.id, mapOf("examGoal" to user.examGoal, "level" to user.level))
posthog.capture("mic_toggled", mapOf("roomId" to roomId, "micOn" to micOn))
```

`POSTHOG_KEY` for Android is the **same public key** as the web. It is safe to ship in the
APK; it only allows capture, never project admin actions.

---

## 6. Sentry

### 6.1 Web (Next.js)

```ts
import * as Sentry from "@sentry/nextjs"
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  release: process.env.NEXT_PUBLIC_RELEASE_TAG,    // git SHA, set by CI
  tracesSampleRate: 0.1,
})
```

- Set `NEXT_PUBLIC_RELEASE_TAG` in CI to the commit SHA so Sentry groups issues by release.
- Wrap the SPA top-level render in `Sentry.ErrorBoundary` so a React crash is captured
  without losing the page.

### 6.2 Android

```kotlin
SentryAndroid.init(context) { options ->
  options.dsn = BuildConfig.SENTRY_DSN
  options.release = BuildConfig.SENTRY_RELEASE   // git SHA, set by CI
}
```

- Capture exceptions in the LiveKit SDK callbacks (`onFailure`, `onTrackSubscriptionFailed`)
  with `Sentry.captureException` and a tag `livekit=true`.
- Set the user with `Sentry.configureScope { it.user = User(user.id) }` after login.

### 6.3 API (FastAPI)

```python
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
sentry_sdk.init(dsn=os.environ["SENTRY_DSN"], release=os.environ["RELEASE_TAG"],
  traces_sample_rate=0.1, integrations=[FastApiIntegration()])
```

Release tagging uses the same git SHA across web, Android, and API so cross-stack
regressions are correlated in Sentry.

---

## 7. Privacy

- **No PII in analytics.** PostHog events never include email, display name, bio, address,
  phone, or free text from chat/report bodies. The `report_created` event includes only
  the enum `reason`, never `detail`.
- **Identifiers are stable UUIDs.** `distinct_id` = `User.id`. Sentry's `User.id` is the
  same UUID. Sentry's `User.email` is intentionally left unset.
- **Opt-out.** A user can opt out of analytics from their profile screen. The opt-out flag
  lives on `User` (planned field `analyticsOptOut: Boolean @default(false)`); the
  `trackEvent` helper short-circuits when set. On the client, `posthog.opt_out()` is
  called on app launch when the flag is true.
- **Data residency.** PostHog Cloud EU is preferred for India users (data stored in EU).
  The `posthog-android` SDK batches events locally and flushes on a 30s timer or on app
  background.
- **Children.** Sankalp targets 17+ exam aspirants. The signup form requires the user to
  confirm they are 16+. Analytics is disabled for users below the age threshold (planned).
- **Retention.** Event data is retained in PostHog for 13 months; raw event rows are
  aggregated into weekly snapshots after that.

---

## 8. Naming and evolution rules

- Event names are `snake_case`, lowercase, past-tense for one-shot events (`*_completed`,
  `*_created`, `*_earned`) and present-tense for state events (`*_started`, `*_succeeded`).
- Once an event is shipped to either client, its name and property keys are frozen. A
  breaking change requires a new event (`*_v2`) and a migration period; the old event is
  kept for one release cycle.
- Adding a new optional property to an existing event is non-breaking and does not require
  a version bump.
- Removing a property is breaking and requires the `_v2` path.

---

## 9. Dashboards and alerts

The PostHog project ships with these saved views (maintained by the growth engineer):

| Dashboard                | Panels                                                                 |
| ------------------------ | --------------------------------------------------------------------- |
| Acquisition              | landing_visit → signup_completed → onboarding_completed funnel         |
| Activation               | signup → study_started funnel; D1/D7/D30 of study_completed            |
| Engagement               | daily/weekly/monthly active users, study minutes per active user      |
| Live rooms               | room_created count, room_joined count, avg participants per room      |
| Monetization             | subscription_started count, MRR (sum of amountPaise), payment_succeeded rate |
| Referrals                | referral_signup count, referral_first_session conversion              |
| Moderation               | report_created count by reason, user_blocked count                     |

Alerts (Slack):

- `payment_succeeded` rate drops >50% week-over-week.
- `study_completed` rate drops >30% day-over-day.
- `room_token_issued` 5xx error rate >1% over 1 hour.
