import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { hashPassword, newSessionToken } from "@/lib/auth"
import { ok, badRequest } from "@/lib/api"
import { rateLimit } from "@/lib/ratelimit"
import { loadMe } from "@/lib/me"

// POST /api/auth/signup
export async function POST(req: NextRequest) {
  const rl = rateLimit(req, { limit: 10, windowMs: 60000, key: "signup" })
  if (!rl.ok) return badRequest("Too many signups. Try again later.", "RATE_LIMITED")

  const body = await req.json().catch(() => null)
  const email = String(body?.email || "").trim().toLowerCase()
  const password = String(body?.password || "")
  const referralCode = body?.referralCode ? String(body.referralCode) : null
  if (!email || !email.includes("@")) return badRequest("A valid email is required")
  if (password.length < 8) return badRequest("Password must be at least 8 characters")

  const existing = await db.user.findUnique({ where: { email } })
  if (existing) return badRequest("An account with this email already exists", "EMAIL_TAKEN")

  const user = await db.user.create({ data: { email, passwordHash: hashPassword(password) } })

  const baseUsername = email.split("@")[0].replace(/[^a-z0-9_]/gi, "").slice(0, 18) || "studenter"
  let username = baseUsername
  let n = 1
  while (await db.profile.findUnique({ where: { username } })) username = `${baseUsername}${n++}`
  await db.profile.create({
    data: { userId: user.id, username, displayName: baseUsername, onboardingComplete: false },
  })
  await db.streak.create({ data: { userId: user.id } })
  await db.subscription.create({ data: { userId: user.id, plan: "free" } })
  // Start the user's single global 30-minute allowance at signup. The
  // allowance is shared by every room and its 24-hour window is enforced by
  // the server, so reloads, logouts, and room changes cannot restart it.
  await db.freeRoomAllowance.create({ data: { userId: user.id } })

  // Referral tracking
  if (referralCode) {
    const ref = await db.referral.findUnique({ where: { code: referralCode } })
    if (ref && ref.referredUserId === null) {
      await db.referral.update({ where: { id: ref.id }, data: { referredUserId: user.id, status: "signed_up" } })
    }
  }
  // Create the user's own referral code
  await db.referral.create({
    data: { code: `${username}-${user.id.slice(0, 4)}`, referrerId: user.id, status: "pending" },
  })

  const token = newSessionToken(user.id)
  const me = await loadMe(user.id)
  return ok({ token, user: me })
}
