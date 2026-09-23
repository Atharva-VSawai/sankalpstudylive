import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { verifyPassword, newSessionToken } from "@/lib/auth"
import { ok, badRequest, unauthorized } from "@/lib/api"
import { rateLimit } from "@/lib/ratelimit"
import { loadMe } from "@/lib/me"

// POST /api/auth/login
export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { limit: 10, windowMs: 60000, key: "login" })
  if (!rl.ok) return badRequest("Too many attempts. Try again later.", "RATE_LIMITED")

  const body = await req.json().catch(() => null)
  const email = String(body?.email || "").trim().toLowerCase()
  const password = String(body?.password || "")
  if (!email || !password) return badRequest("Email and password are required")

  const user = await db.user.findUnique({ where: { email }, include: { profile: true } })
  if (!user || !user.passwordHash) return unauthorized()
  if (!verifyPassword(password, user.passwordHash)) return unauthorized()
  if (user.status !== "active") return badRequest("Your account is suspended. Contact support.", "ACCOUNT_SUSPENDED")

  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  const token = newSessionToken(user.id)
  const me = await loadMe(user.id)
  return ok({ token, user: me })
}
