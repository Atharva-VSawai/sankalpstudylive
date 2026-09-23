# Sankalp — Database

> Production target DDL and Supabase RLS strategy for the Sankalp PostgreSQL schema.
> Source of truth for entities and fields is `prisma/schema.prisma`. This document describes the
> production PostgreSQL/Supabase representation and how the SQLite sandbox maps to it.

## 1. Prisma ↔ PostgreSQL mapping

The Prisma schema in this repo is written against SQLite so the product is runnable in the sandbox.
Production runs on PostgreSQL via Supabase with the following type mapping:

| Prisma (sandbox)                          | PostgreSQL (production)                          |
| ---------------------------------------- | ------------------------------------------------ |
| `String @id @default(cuid())`            | `uuid primary key default gen_random_uuid()`     |
| `DateTime` (SQLite TEXT)                | `timestamptz` (UTC)                              |
| `String` + comment "user \| moderator \| admin" | `user_role` enum                          |
| `String` holding JSON (`tags`, `pomodoroConfig`, `metadata`) | `jsonb`                          |
| `Boolean`                                | `boolean`                                        |
| `Int`                                    | `integer`                                        |
| `String?`                                | `text` (nullable)                                |
| `@unique([a, b])`                        | `unique (a, b)` constraint                       |
| `@@index([a])` / `@@index([a, b])`       | `create index` (single or composite)            |
| `@relation(... onDelete: Cascade)`       | `foreign key ... on delete cascade`             |
| (Prisma-level validation only)          | `check` constraints for ranges / enum membership |

Production uses native PG enums for every "string-typed" enum in the schema (roles, statuses, modes, tiers, etc.). The API validates the same set of values in the sandbox, so the contract is identical.

All timestamps are stored as `timestamptz` in UTC. The application computes "today" in the user's timezone (`localDateForTimezone()` in `src/lib/study.ts`) before reading/writing rows keyed by date — e.g. `DailyGoal.date` is stored as midnight UTC of the user's local calendar date.

## 2. Production PostgreSQL DDL reference

The order below reflects dependency ordering (parents before children). All enums are created first.

```sql
-- ── Enum types ──────────────────────────────────────────────────────────
create type user_role          as enum ('user', 'moderator', 'admin');
create type user_status        as enum ('active', 'suspended', 'banned');
create type community_role     as enum ('member', 'moderator', 'owner');
create type room_member_role   as enum ('host', 'co_host', 'participant', 'viewer');
create type session_mode       as enum ('focus', 'pomodoro', 'break');
create type timer_mode         as enum ('focus', 'break', 'idle');
create type friendship_status  as enum ('pending', 'accepted', 'declined', 'blocked');
create type report_reason     as enum ('spam', 'harassment', 'cheating', 'nsfw', 'other');
create type report_status     as enum ('open', 'reviewing', 'resolved', 'dismissed');
create type report_resolution as enum ('warning', 'mute', 'kick', 'ban', 'no_action');
create type subscription_plan as enum ('free', 'plus', 'pro');
create type subscription_status as enum ('active', 'canceled', 'past_due');
create type payment_status    as enum ('pending', 'paid', 'failed', 'refunded');
create type device_platform   as enum ('web', 'android', 'ios');
create type referral_status   as enum ('pending', 'signed_up', 'first_session', 'rewarded');
create type badge_tier        as enum ('bronze', 'silver', 'gold', 'platinum');
create type notification_type as enum ('friend_request', 'friend_accept', 'badge_earned',
                                       'goal_completed', 'streak_milestone',
                                       'room_invite', 'system', 'report_update');
create type leaderboard_scope as enum ('global', 'community', 'friends');
create type leaderboard_period as enum ('daily', 'weekly', 'monthly', 'alltime');

-- ── users ──────────────────────────────────────────────────────────────
create table users (
  id               uuid primary key default gen_random_uuid(),
  email            text not null unique,
  password_hash    text,                              -- null when OAuth-only
  google_sub       text unique,
  email_verified_at timestamptz,
  timezone         text not null default 'Asia/Kolkata',
  role             user_role not null default 'user',
  status           user_status not null default 'active',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  last_login_at    timestamptz
);
create index users_role_idx   on users(role);
create index users_status_idx on users(status);

-- ── profiles ──────────────────────────────────────────────────────────
create table profiles (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null unique references users(id) on delete cascade,
  username            text not null unique,
  display_name        text not null,
  avatar_url          text,
  bio                 text,
  exam_goal           text,
  target_year         integer,
  study_hours_goal    integer not null default 360,  -- minutes/day; 15..1440
  onboarding_complete boolean not null default false,
  streak_count        integer not null default 0,
  total_minutes       integer not null default 0,
  total_xp            integer not null default 0,
  level               integer not null default 1,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (study_hours_goal between 15 and 1440),
  check (level >= 1),
  check (char_length(username) >= 3)
);
create index profiles_exam_goal_idx on profiles(exam_goal);
create index profiles_username_idx   on profiles(username);

-- ── auth_sessions (sandbox-only; production uses Supabase Auth) ───────
create table auth_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  token       text not null unique,
  user_agent  text,
  ip          inet,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  revoked_at  timestamptz
);
create index auth_sessions_user_id_idx   on auth_sessions(user_id);
create index auth_sessions_expires_at_idx on auth_sessions(expires_at);

-- ── communities ───────────────────────────────────────────────────────
create table communities (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  name         text not null,
  description  text not null,
  exam_goal    text not null,
  color        text not null default '#10b981',
  icon_url     text,
  tags         jsonb not null default '[]',
  member_count integer not null default 0,
  is_featured  boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (member_count >= 0)
);
create index communities_exam_goal_idx  on communities(exam_goal);
create index communities_is_featured_idx on communities(is_featured);

create table community_members (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  user_id      uuid not null references users(id)      on delete cascade,
  role         community_role not null default 'member',
  joined_at    timestamptz not null default now(),
  unique (community_id, user_id)
);
create index community_members_user_id_idx on community_members(user_id);

-- ── rooms ─────────────────────────────────────────────────────────────
create table rooms (
  id                uuid primary key default gen_random_uuid(),
  community_id      uuid references communities(id),
  name              text not null,
  description       text,
  owner_id          uuid not null references users(id),
  livekit_room      text not null unique,
  is_live           boolean not null default false,
  is_listed         boolean not null default true,
  is_private        boolean not null default false,
  max_participants  integer not null default 20,
  participant_count integer not null default 0,
  focus_mode        boolean not null default true,
  pomodoro_config   jsonb not null default
                       '{"focusMin":25,"breakMin":5,"longBreakMin":15,"rounds":4}',
  tags              jsonb not null default '[]',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  started_at        timestamptz,
  ended_at          timestamptz,
  check (max_participants between 2 and 50),
  check (participant_count >= 0)
);
create index rooms_community_id_idx  on rooms(community_id);
create index rooms_is_live_idx       on rooms(is_live);
create index rooms_is_listed_idx     on rooms(is_listed);
create index rooms_owner_id_idx      on rooms(owner_id);

create table room_members (
  id          uuid primary key default gen_random_uuid(),
  room_id     uuid not null references rooms(id) on delete cascade,
  user_id     uuid not null references users(id) on delete cascade,
  role        room_member_role not null default 'participant',
  muted       boolean not null default true,        -- mic defaults OFF
  camera_off  boolean not null default true,
  joined_at   timestamptz not null default now(),
  left_at     timestamptz,
  last_seen_at timestamptz not null default now(),
  unique (room_id, user_id)
);
create index room_members_user_id_idx     on room_members(user_id);
create index room_members_last_seen_at_idx on room_members(last_seen_at);

-- ── study engine ─────────────────────────────────────────────────────
create table study_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id)       on delete cascade,
  room_id      uuid references rooms(id),
  community_id uuid references communities(id),
  started_at   timestamptz not null default now(),
  ended_at     timestamptz,
  duration_min integer not null default 0,             -- server-computed; 0..480
  xp_earned    integer not null default 0,
  mode         session_mode not null default 'focus',
  is_verified  boolean not null default true,
  created_at   timestamptz not null default now(),
  check (duration_min between 0 and 480),
  check (xp_earned >= 0)
);
create index study_sessions_user_id_idx    on study_sessions(user_id);
create index study_sessions_room_id_idx     on study_sessions(room_id);
create index study_sessions_started_at_idx  on study_sessions(user_id, started_at);

create table daily_goals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  date         timestamptz not null,                   -- midnight UTC of user's local day
  target_min   integer not null default 360,
  achieved_min integer not null default 0,
  completed    boolean not null default false,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, date),
  check (target_min between 15 and 1440),
  check (achieved_min >= 0)
);
create index daily_goals_date_idx on daily_goals(date);

create table streaks (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null unique references users(id) on delete cascade,
  current        integer not null default 0,
  longest        integer not null default 0,
  last_study_date timestamptz,
  updated_at     timestamptz not null default now(),
  check (current >= 0),
  check (longest >= 0)
);
create index streaks_current_idx on streaks(current);

create table badges (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name        text not null,
  description text not null,
  icon_url    text,
  tier        badge_tier not null default 'bronze',
  xp_reward   integer not null default 0,
  created_at  timestamptz not null default now(),
  check (xp_reward >= 0)
);

create table user_badges (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id)  on delete cascade,
  badge_id   uuid not null references badges(id),
  awarded_at timestamptz not null default now(),
  unique (user_id, badge_id)
);
create index user_badges_badge_id_idx on user_badges(badge_id);

create table leaderboard_snapshots (
  id          uuid primary key default gen_random_uuid(),
  scope       leaderboard_scope  not null,
  period      leaderboard_period not null,
  user_id     uuid not null references users(id) on delete cascade,
  rank        integer not null,
  minutes     integer not null,
  xp          integer not null,
  captured_at timestamptz not null default now(),
  check (rank >= 1)
);
create index leaderboard_snapshots_scope_period_captured_at_idx
  on leaderboard_snapshots(scope, period, captured_at);
create index leaderboard_snapshots_user_id_idx on leaderboard_snapshots(user_id);

-- ── social ────────────────────────────────────────────────────────────
create table friendships (
  id          uuid primary key default gen_random_uuid(),
  from_user_id uuid not null references users(id) on delete cascade,
  to_user_id   uuid not null references users(id) on delete cascade,
  status       friendship_status not null default 'pending',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (from_user_id, to_user_id),
  check (from_user_id <> to_user_id)
);
create index friendships_to_user_id_status_idx on friendships(to_user_id, status);

create table blocks (
  id          uuid primary key default gen_random_uuid(),
  blocker_id  uuid not null references users(id) on delete cascade,
  blocked_id  uuid not null references users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
create index blocks_blocked_id_idx on blocks(blocked_id);

create table reports (
  id                  uuid primary key default gen_random_uuid(),
  reporter_id         uuid not null references users(id)        on delete cascade,
  reported_id         uuid references users(id),
  reported_room_id    uuid references rooms(id),
  reported_message_id uuid,
  reason              report_reason not null,
  detail              text,
  status              report_status not null default 'open',
  resolution          report_resolution,
  created_at          timestamptz not null default now(),
  resolved_at         timestamptz,
  resolved_by_id      uuid references users(id),
  check (reported_id is not null
      or reported_room_id is not null
      or reported_message_id is not null)
);
create index reports_status_idx           on reports(status);
create index reports_reported_id_idx      on reports(reported_id);
create index reports_reported_room_id_idx on reports(reported_room_id);

create table room_messages (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references rooms(id) on delete cascade,
  user_id    uuid not null references users(id) on delete cascade,
  text       text not null,
  is_system  boolean not null default false,
  is_deleted boolean not null default false,
  created_at timestamptz not null default now(),
  check (char_length(text) between 1 and 500)
);
create index room_messages_room_id_created_at_idx on room_messages(room_id, created_at);
create index room_messages_user_id_idx             on room_messages(user_id);

create table notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users(id) on delete cascade,
  type       notification_type not null,
  title      text not null,
  body       text,
  link       text,
  read       boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_id_read_idx on notifications(user_id, read);
create index notifications_created_at_idx   on notifications(created_at);

-- ── monetization, devices, referrals, audit ───────────────────────────
create table subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null unique references users(id) on delete cascade,
  plan       subscription_plan   not null default 'free',
  status     subscription_status not null default 'active',
  started_at timestamptz not null default now(),
  renews_at  timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table payments (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  amount       integer not null,                   -- paise (INR)
  currency     text not null default 'INR',
  plan         subscription_plan not null,
  provider     text not null default 'razorpay',
  provider_ref text,
  status       payment_status not null default 'pending',
  created_at   timestamptz not null default now(),
  check (amount >= 0)
);
create index payments_user_id_idx on payments(user_id);
create index payments_status_idx   on payments(status);

create table user_devices (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references users(id) on delete cascade,
  platform    device_platform not null,
  push_token  text,
  app_version text,
  last_seen_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  unique (user_id, platform)
);
create index user_devices_user_id_idx on user_devices(user_id);

create table referrals (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  referrer_id       uuid not null references users(id) on delete cascade,
  referred_user_id  uuid unique references users(id),
  status            referral_status not null default 'pending',
  created_at        timestamptz not null default now(),
  completed_at      timestamptz
);
create index referrals_referrer_id_idx on referrals(referrer_id);

create table audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references users(id),
  action      text not null,
  target_type text,
  target_id   uuid,
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index audit_logs_action_idx    on audit_logs(action);
create index audit_logs_created_at_idx on audit_logs(created_at);
```

## 3. Index reference (complete list)

Single-column indexes:
- `users(role)`, `users(status)`
- `profiles(exam_goal)`, `profiles(username)`
- `auth_sessions(user_id)`, `auth_sessions(expires_at)`
- `communities(exam_goal)`, `communities(is_featured)`
- `rooms(community_id)`, `rooms(is_live)`, `rooms(is_listed)`, `rooms(owner_id)`
- `study_sessions(user_id)`, `study_sessions(room_id)`
- `daily_goals(date)`
- `streaks(current)`
- `user_badges(badge_id)`
- `leaderboard_snapshots(user_id)`
- `blocks(blocked_id)`
- `reports(status)`, `reports(reported_id)`, `reports(reported_room_id)`
- `room_messages(user_id)`
- `notifications(created_at)`
- `payments(user_id)`, `payments(status)`
- `user_devices(user_id)`
- `referrals(referrer_id)`
- `audit_logs(action)`, `audit_logs(created_at)`

Composite / unique indexes (hot paths):
- `community_members(community_id, user_id)` — **unique**; powers join/leave upserts.
- `room_members(room_id, user_id)` — **unique**; powers token issuance + member lookup.
- `room_members(last_seen_at)` — reaper job scans for stale rows.
- `study_sessions(user_id, started_at)` — history + leaderboard aggregation.
- `room_messages(room_id, created_at)` — chat history pagination in ascending time.
- `notifications(user_id, read)` — unread count + inbox listing.
- `leaderboard_snapshots(scope, period, captured_at)` — period leaderboard read.
- `friendships(to_user_id, status)` — incoming-pending lookup; `(from_user_id, to_user_id)` unique.
- `daily_goals(user_id, date)` — **unique**; upsert for today's goal.
- `blocks(blocker_id, blocked_id)` — **unique**.
- `user_badges(user_id, badge_id)` — **unique**; idempotent grant.
- `user_devices(user_id, platform)` — **unique**.
- `referrals(code)` and `referrals(referred_user_id)` — **unique**.

## 4. Supabase RLS strategy

Supabase exposes two keys:
- **anon key** — public-safe, used by web/Android clients. Subject to RLS.
- **service-role key** — bypasses RLS. **Server-only.** Used by FastAPI for cross-user writes (e.g. granting a badge to another user, writing audit logs).

RLS is **enabled on every table**. The default policy is `deny all`. Public-readable discovery is granted narrowly:

```sql
-- communities: readable by anon (for landing page discovery)
alter table communities enable row level security;
create policy "communities_public_read" on communities
  for select to anon, authenticated using (true);

-- rooms: only listed rooms are readable by anon; owner + mods can read private
alter table rooms enable row level security;
create policy "rooms_listed_read" on rooms
  for select to anon, authenticated using (is_listed = true);
create policy "rooms_owner_all" on rooms
  for all to authenticated using (owner_id = auth.uid());

-- profiles: anyone can read; only the owner can update
alter table profiles enable row level security;
create policy "profiles_public_read" on profiles
  for select to anon, authenticated using (true);
create policy "profiles_owner_update" on profiles
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- study_sessions: only the owner can read or stop their own sessions
alter table study_sessions enable row level security;
create policy "sessions_owner_read" on study_sessions
  for select to authenticated using (user_id = auth.uid());
-- writes go through the service-role key (server), so no insert/update policy is granted to anon/authenticated

-- daily_goals, streaks, badges awarded, subscriptions, payments, notifications,
-- user_devices, blocks, friendships, audit_logs: owner-only read; writes via service-role only
alter table daily_goals enable row level security;
create policy "daily_goals_owner_read" on daily_goals
  for select to authenticated using (user_id = auth.uid());

-- community_members: members of the community can read; self can insert (join)
alter table community_members enable row level security;
create policy "cmembers_self_join" on community_members
  for insert to authenticated with check (user_id = auth.uid());
create policy "cmembers_self_leave" on community_members
  for delete to authenticated using (user_id = auth.uid());
create policy "cmembers_community_read" on community_members
  for select to authenticated using (
    exists (select 1 from community_members cm
            where cm.community_id = community_members.community_id
              and cm.user_id = auth.uid())
  );

-- reports: a user can read only their own reports; mods via service-role
alter table reports enable row level security;
create policy "reports_reporter_read" on reports
  for select to authenticated using (reporter_id = auth.uid());
```

Email is never exposed via RLS-backed reads — `profiles` carries display info but not the email column; `users.email` is only readable via the service-role key from admin endpoints.

## 5. Migration workflow

1. **Edit schema**: change `prisma/schema.prisma` (sandbox). Keep SQLite-friendly types so `bun run db:push` works locally.
2. **Mirror to PG**: regenerate the corresponding `sqlx`/`alembic` migration in the FastAPI project (or run `prisma migrate diff` against a PG shadow DB) — converting `cuid()` → `gen_random_uuid()`, string enums → PG enums, `DateTime` → `timestamptz`, JSON strings → `jsonb`.
3. **Apply to Supabase**: `supabase db push` (or `alembic upgrade head`) in a staging project first; run the seed (`prisma/seed.ts`) against staging.
4. **Verify RLS**: `supabase db lint` confirms RLS is enabled on every table; an integration test signs in as two different users and asserts cross-user reads fail.
5. **Promote**: deploy FastAPI; flip `DATABASE_URL` to the production Supabase pooler.

Notes:
- UUIDs: when migrating, replace existing `cuid()` IDs with `gen_random_uuid()` defaults. Existing sandbox rows can be re-seeded in staging; production starts fresh.
- `timestamptz`: every `DateTime` column becomes `timestamptz`. Existing ISO strings are forward-compatible.
- Enum mapping: each Prisma "string-typed enum" becomes a PG enum. The API already validates the same value set, so no client-side change is required.
- JSON columns (`tags`, `pomodoro_config`, `metadata`) become `jsonb`; queries that filter on tags use `@>` operators.

## 6. Sandbox note (SQLite)

The runnable sandbox uses SQLite for portability:
- IDs are `cuid()` strings, not UUIDs. Shape is identical (opaque string).
- Enum columns are plain `TEXT` validated at the API layer (see `src/app/api/admin/users/[id]/route.ts` for role/status validation, `src/app/api/reports/route.ts` for reason validation). The set of allowed values is identical to the PG enums above.
- `DateTime` is stored as SQLite TEXT (ISO 8601, UTC).
- JSON-typed fields (`tags`, `pomodoroConfig`, `metadata`) are stored as TEXT and parsed with `JSON.parse` in the route handlers (`safeParse` helpers).
- No native `check` constraints — the API enforces them (e.g. `studyHoursGoal` 15..1440 in `/api/onboarding` and `/api/profile`).
- No native RLS — authorization is enforced in route handlers via `getAuth()` + ownership checks + `isModerator()` / `isAdmin()`.

The schema and the API contract are designed so the same Android client works against either runtime without changes (see `AGENTS.md`).
