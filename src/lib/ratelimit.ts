import { NextRequest } from "next/server"

// Naive sliding-window in-memory rate limiter (sandbox stand-in for Redis).
// Production: replace with a Redis-backed limiter (token bucket) — see docs/security.md.

type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()

export function rateLimit(
  req: NextRequest,
  opts: { limit: number; windowMs: number; key?: string }
): { ok: boolean; remaining: number; resetAt: number } {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "anon"
  const key = opts.key ? `${ip}:${opts.key}` : ip
  const now = Date.now()
  const b = buckets.get(key)
  if (!b || b.resetAt < now) {
    const fresh = { count: 1, resetAt: now + opts.windowMs }
    buckets.set(key, fresh)
    return { ok: true, remaining: opts.limit - 1, resetAt: fresh.resetAt }
  }
  if (b.count >= opts.limit) {
    return { ok: false, remaining: 0, resetAt: b.resetAt }
  }
  b.count++
  return { ok: true, remaining: opts.limit - b.count, resetAt: b.resetAt }
}
