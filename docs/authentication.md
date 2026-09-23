# Sankalp — Authentication

> How Sankalp authenticates users and authorizes requests in production, and how the sandbox
> simulates the same contract. Read alongside `docs/security.md` and `docs/api.md`.

## 1. Production: Supabase Auth

The production target uses **Supabase Auth** as the identity provider.

- **Signup**: email + password (bcrypt-hashed server-side by Supabase) **or** Google OAuth via Supabase's Google provider.
- **JWT**: Supabase issues a signed JWT (`HS256`/`RS256` depending on project config) with the user's `sub` (UUID), `email`, `role` (`authenticated` / `anon`), `exp`, `iat`, and a JTI. The token is valid for ~1h and is paired with a long-lived refresh token.
- **Verification**: FastAPI middleware fetches Supabase's published JWK set (`<SUPABASE_URL>/auth/v1/.well-known/jwks.json`) and verifies every incoming JWT signature + `exp` + `audience`. Failed verification → `401`.
- **Refresh**: the client stores the refresh token and exchanges it for a fresh access token on 401 responses. Production exposes `POST /api/auth/refresh` that proxies Supabase's refresh endpoint.
- **RLS**: the same JWT is used by the PostgREST/Supabase client when the web app reads public discovery tables directly (e.g. `communities`). RLS policies enforce the rules in `docs/database.md §4`.

The user's application-level role (`user` / `moderator` / `admin`) lives in the `users.role` column and is **not** in the Supabase JWT. FastAPI loads it from PostgreSQL on every request after JWT verification (a cheap indexed `select role, status from users where id = $1`). This keeps role changes immediate (no token reissue needed).

Account status (`active` / `suspended` / `banned`) is checked the same way; a suspended user's requests return `403` with `ACCOUNT_SUSPENDED` even with a valid JWT.

## 2. Sandbox: signed HMAC session token

The sandbox ships a small stand-in for Supabase Auth (`src/lib/auth.ts`) so the product is runnable without external provider configuration.

### Token format

```
base64url(payload).signature
```

- `payload` = JSON `{ uid: <user id>, exp: <unix seconds>, jti: <8-byte hex> }`
- `signature` = `HMAC-SHA256(payload, SESSION_SECRET)` encoded as `base64url`
- `SESSION_SECRET` = `process.env.SESSION_SECRET` (default `"sankalp-dev-secret-change-me-in-production"` — must be rotated in production)

Verification (`verifyToken()`):
1. Split on `.`; require exactly 2 parts.
2. Recompute the expected HMAC and compare **constant-time** (`timingSafeEqual`).
3. Parse the JSON payload and check `exp > now()`.

Tokens are minted by `newSessionToken(userId, days = 30)` and live for 30 days by default. They are passed as `Authorization: Bearer <token>` or in a `sankalp_session` cookie (whichever is present — see `getAuth()` in `src/lib/api.ts`).

### Password hashing

The sandbox uses an SHA-256-based salted hash (`hashPassword()` in `src/lib/auth.ts`):
```
pbkdf2_sha256$<16-byte hex salt>$<sha256(salt + password + SESSION_SECRET)>
```

This is intentionally simple to keep the sandbox dependency-free. **Production replaces this entirely** with Supabase Auth (bcrypt-hashed passwords managed by Supabase) — the Sankalp backend never sees the plaintext password. **No API contract changes** — the response shape of `/api/auth/signup` and `/api/auth/login` is the same.

> The `AuthSession` table is a sandbox-only artifact for recording issued tokens. Production uses Supabase's `auth.sessions` table; no row is written by Sankalp code.

## 3. Google OAuth

### Production flow
1. Client redirects to `https://<project>.supabase.co/auth/v1/authorize?provider=google` with the appropriate `redirect_to`.
2. User consents on Google; Supabase exchanges the code, mints a JWT, redirects back to the app with the session.
3. The app stores the JWT (see §4) and uses it for all subsequent requests.

### Sandbox flow (`POST /api/auth/google-demo`)
Because the sandbox cannot run a real OAuth provider without external config, this endpoint simulates the post-redirect step:
- If the supplied `email` already exists, it logs that user in.
- If not, it creates an OAuth-only `User` (no `password_hash`, `google_sub = "demo-<ts>"`, `emailVerifiedAt = now()`) plus a Profile, Streak, Subscription, and self-Referral — exactly as `/api/auth/signup` would.
- It then mints the same signed session token and returns `{ token, user: Me }` — identical to login.

The Android client and the production web client must use the real Supabase Google provider instead. **The endpoint `/api/auth/google-demo` is removed in production** (or kept gated behind an admin-only flag for E2E tests).

## 4. Role-based access control (RBAC)

Three application roles on `users.role`:

| Role        | Capabilities                                                                       |
| ----------- | ---------------------------------------------------------------------------------- |
| `user`      | Default. Create rooms, study, friend/block, report, manage own profile.            |
| `moderator` | Everything a user can do, plus: read mod queue (`GET /api/reports`), update room settings, kick/mute room members, view admin stats and users list. |
| `admin`     | Everything a moderator can do, plus: resolve reports, suspend/ban users, force-close rooms, manage communities. |

Checks are done in route handlers via helpers in `src/lib/api.ts`:

```ts
const ctx = await getAuth(req)         // returns AuthContext | null
if (!ctx) return unauthorized()        // 401
if (!isModerator(ctx)) return forbidden()  // 403 — covers both moderator and admin
if (!isAdmin(ctx)) return forbidden()   // 403 — admin only
```

`getAuth()` returns `null` when:
- No bearer token and no cookie token, OR
- Token fails HMAC verification, OR
- Token `exp` < now, OR
- The user row is missing or `status !== 'active'`.

Per-resource ownership checks are layered on top of RBAC: a room's `owner_id === ctx.userId` grants host-like rights; a `RoomMember` row grants "in the room" rights; a `CommunityMember` row grants "in the community" rights. The most common pattern is:

```ts
if (room.ownerId !== ctx.userId && !isModerator(ctx)) return forbidden()
```

## 5. Token storage

- **Web** (this SPA): the token lives in `localStorage` under the key `sankalp_token` (`src/lib/api-client.ts`). It is sent as `Authorization: Bearer <token>` on every fetch. On logout, the key is removed.
  - In production, prefer a SameSite=Strict, Secure, HttpOnly cookie set by the server to limit XSS exposure. The current sandbox uses `localStorage` because the SPA is a pure client app with hash-based routing and no server-rendered session handling.
- **Android** (future): store the token in `EncryptedSharedPreferences` (Jetpack Security) or the Android Keystore. Never in plain `SharedPreferences` or a SQLite row. Attach it via OkHttp interceptor as `Authorization: Bearer <jwt>`.
- **Server-only secrets** (`SUPABASE_SERVICE_ROLE_KEY`, `LIVEKIT_API_SECRET`, `SESSION_SECRET`) are **never** shipped to either client. They live only in the server process environment.

## 6. Security properties

- **Account status**: every authenticated request re-checks `users.status === 'active'` (see `getAuth()`). A suspended or banned user gets `401` even with a valid token.
- **Email verification**: the sandbox sets `emailVerifiedAt` during onboarding completion. Production gates sensitive actions (creating a room, sending a friend request) behind `email_verified_at IS NOT NULL` via Supabase's email confirmation flow.
- **Rate limits** (see `docs/security.md`): signup 10/min, login 10/min per IP. The login route returns `401` (not `400`) for bad passwords to avoid leaking which emails exist; `EMAIL_TAKEN` on signup is the one place we reveal account existence, which is acceptable and standard.
- **No token in URLs** — except the SSE endpoint (`/api/rooms/[id]/events?token=…`), which is required because `EventSource` cannot set request headers. The SSE handler accepts the token only from `query.token` and treats it identically to a Bearer header. Production should consider short-lived single-use SSE tokens minted off the main session token.
- **Audit trail**: admin actions (`PATCH /api/admin/users/[id]`, `PATCH /api/admin/reports/[id]`, `PATCH /api/admin/rooms/[id]`) write an `AuditLog` row with `actor_id`, `action`, `target_id`, and a JSON `metadata` of the diff. See `src/app/api/admin/users/[id]/route.ts`.
- **Logout**: in the sandbox, the client deletes its local token. Production adds `POST /api/auth/logout` that adds the JWT's `jti` to a Redis blacklist (`session-blacklist:<jti>`) with TTL = the JWT's remaining lifetime, so the same token can no longer be used.

## 7. FastAPI middleware (production)

The production FastAPI app installs an auth dependency on every router except `/api/health` and the public discovery routes:

```python
# pseudo-code
from fastapi import Depends, HTTPException, Request
from supabase import create_client, Client

supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async def current_user(request: Request) -> AuthContext:
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(401, {"error": {"code": "UNAUTHORIZED", "message": "Authentication required"}})
    jwt = auth[7:]
    try:
        claims = await verify_supabase_jwt(jwt)        # JWK fetch + signature + exp + aud
    except JWTError:
        raise HTTPException(401, {"error": {"code": "INVALID_TOKEN", "message": "Token invalid or expired"}})
    row = await db.fetch_one(
        "select id, email, role, status from users where id = $1", claims["sub"]
    )
    if not row or row["status"] != "active":
        raise HTTPException(401, {"error": {"code": "ACCOUNT_SUSPENDED", "message": "Account suspended"}})
    return AuthContext(user_id=row["id"], role=row["role"], status=row["status"])
```

`verify_supabase_jwt` caches the JWK set in-process with a 5-minute TTL so we don't re-fetch keys on every request. Role/admin checks (`isModerator`, `isAdmin`) compose on top of `current_user` as FastAPI dependencies.

The middleware runs **before** business logic and **after** the rate-limit middleware. Order matters: rate-limit by IP first (so unauthenticated floods are dropped before we touch the JWK cache), then auth.

## 8. Client integration flow

Web (this repo, `src/lib/api-client.ts`):
1. `POST /api/auth/login` with email + password → `{ token, user }`.
2. Store `token` in `localStorage["sankalp_token"]`.
3. Every subsequent request: `Authorization: Bearer <token>`.
4. On `401`: clear the token, redirect to `#/login`.
5. On logout: delete the token, redirect to `#/login`. (No server call in sandbox.)

Android (future):
1. Same login call via OkHttp interceptor.
2. Store token in `EncryptedSharedPreferences` keyed by `sankalp_token`.
3. Interceptor attaches `Authorization: Bearer <token>` to every request.
4. On `401`: clear, navigate to login screen.
5. On logout: `POST /api/auth/logout` (server blacklists the JTI in Redis), then clear local storage.

Both clients treat the token as an opaque bearer string. The server-side format (HMAC vs JWK-signed JWT) is invisible to the client.

## 9. Migration path (sandbox → production)

| Concern              | Sandbox                                                | Production                                                          |
| -------------------- | ------------------------------------------------------ | ------------------------------------------------------------------- |
| Token signing        | `HMAC-SHA256(SESSION_SECRET)`                          | Supabase JWT (verified via JWK)                                     |
| Password hashing     | `sha256(salt + password + SESSION_SECRET)`             | bcrypt (managed by Supabase Auth)                                   |
| Google OAuth         | `POST /api/auth/google-demo`                           | Supabase Google provider redirect → JWT                             |
| Token storage (web)  | `localStorage["sankalp_token"]`                        | HttpOnly Secure SameSite cookie (recommended)                       |
| Token storage (Android) | `EncryptedSharedPreferences` (same in both)         | `EncryptedSharedPreferences`                                         |
| Logout               | client deletes token                                   | `POST /api/auth/logout` → Redis JTI blacklist                        |
| Role source          | `users.role` column                                    | Same — loaded from PostgreSQL after JWT verification                 |
| API contract         | identical                                              | identical                                                           |

The Android client built later (per `AGENTS.md`) consumes the production column without any changes to its HTTP calls — only the JWT format and the issuance path differ, both transparent to a client that just sends `Authorization: Bearer <jwt>`.
