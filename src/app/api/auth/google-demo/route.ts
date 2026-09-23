import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { newSessionToken } from "@/lib/auth"
import { ok } from "@/lib/api"
import { loadMe } from "@/lib/me"

// POST /api/auth/google-demo
// Simulated Google OAuth for the sandbox. Production: Supabase Auth Google provider
// returns a real JWT after redirect. See docs/authentication.md.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const requestedEmail = body?.email ? String(body.email).trim().toLowerCase() : null

  let email = requestedEmail || `google-demo-${Math.random().toString(36).slice(2, 8)}@gmail.com`
  let user = await db.user.findUnique({ where: { email }, include: { profile: true } })
  if (!user) {
    user = await db.user.create({
      data: {
        email,
        googleSub: `demo-${Date.now()}`,
        emailVerifiedAt: new Date(),
      },
      include: { profile: true },
    })
    const baseUsername = email.split("@")[0].replace(/[^a-z0-9_]/gi, "").slice(0, 18) || "studenter"
    let username = baseUsername
    let n = 1
    while (await db.profile.findUnique({ where: { username } })) username = `${baseUsername}${n++}`
    await db.profile.create({
      data: { userId: user.id, username, displayName: baseUsername, onboardingComplete: false },
    })
    await db.streak.create({ data: { userId: user.id } })
    await db.subscription.create({ data: { userId: user.id, plan: "free" } })
    await db.referral.create({
      data: { code: `${username}-${user.id.slice(0, 4)}`, referrerId: user.id, status: "pending" },
    })
  }
  if (user.status !== "active") {
    return ok({ error: { code: "ACCOUNT_SUSPENDED", message: "Account suspended" } }, 403) as any
  }
  await db.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
  const token = newSessionToken(user.id)
  const me = await loadMe(user.id)
  return ok({ token, user: me })
}
