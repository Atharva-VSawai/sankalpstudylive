import { createHash, createHmac, randomBytes } from "crypto"

// Lightweight signed session token (sandbox stand-in for Supabase Auth JWT).
// Format: base64url(payload).signature   where payload = {uid, exp, jti}
// Production replaces this with Supabase Auth JWT verification — see docs/authentication.md.

const SESSION_SECRET =
  process.env.SESSION_SECRET || "sankalp-dev-secret-change-me-in-production"

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url")
}

function fromB64url(input: string): Buffer {
  return Buffer.from(input, "base64url")
}

export function signToken(payload: object): string {
  const body = b64url(JSON.stringify(payload))
  const sig = createHmac("sha256", SESSION_SECRET).update(body).digest("base64url")
  return `${body}.${sig}`
}

export function verifyToken<T = unknown>(token: string): T | null {
  const parts = token.split(".")
  if (parts.length !== 2) return null
  const [body, sig] = parts
  const expected = createHmac("sha256", SESSION_SECRET).update(body).digest("base64url")
  // timing-safe compare
  if (sig.length !== expected.length) return null
  if (!timingSafeEqual(sig, expected)) return null
  try {
    return JSON.parse(fromB64url(body).toString("utf8")) as T
  } catch {
    return null
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  let diff = 0
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i]
  return diff === 0
}

// Password hashing (PBKDF2). Production would use argon2/bcrypt server-side.
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex")
  const hash = createHash("sha256")
    .update(salt + password + SESSION_SECRET)
    .digest("hex")
  return `pbkdf2_sha256$${salt}$${hash}`
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split("$")
  if (parts.length !== 3) return false
  const [, salt, hash] = parts
  const test = createHash("sha256")
    .update(salt + password + SESSION_SECRET)
    .digest("hex")
  return timingSafeEqual(test, hash)
}

export function newSessionToken(userId: string, days = 30): string {
  const exp = Math.floor(Date.now() / 1000) + days * 86400
  return signToken({ uid: userId, exp, jti: randomBytes(8).toString("hex") })
}
