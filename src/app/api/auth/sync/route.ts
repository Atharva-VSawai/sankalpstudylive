import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, getAuth, badRequest } from "@/lib/api"
import { hashPassword } from "@/lib/auth"

// POST /api/auth/sync
// Called by the frontend after Supabase Auth signup/login to ensure
// the user has a Profile + Streak + Subscription in our database.
// The Supabase JWT is verified by getAuth (which checks the Bearer token).
//
// Body: { email: string, supabaseId?: string }
export async function POST(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()

  const body = await req.json().catch(() => ({}))
  const email = String(body?.email || ctx.user?.email || "").trim().toLowerCase()
  if (!email) return badRequest("Email required")

  // Check if user already exists
  let user = await db.user.findFirst({
    where: {
      OR: [{ email }, { googleSub: body?.supabaseId }]
    },
    include: { profile: true }
  })

  if (!user) {
    // Create new user in our DB (linked to Supabase Auth)
    const baseUsername = email.split("@")[0].replace(/[^a-z0-9_]/gi, "").slice(0, 18) || "studenter"
    let username = baseUsername
    let n = 1
    while (await db.profile.findUnique({ where: { username } })) {
      username = `${baseUsername}${n++}`
    }

    user = await db.user.create({
      data: {
        email,
        googleSub: body?.supabaseId || null,
        emailVerifiedAt: new Date(),
        role: "user",
        status: "active",
      },
      include: { profile: true }
    })

    await db.profile.create({
      data: {
        userId: user.id,
        username,
        displayName: baseUsername,
        onboardingComplete: false,
      },
    })

    await db.streak.create({ data: { userId: user.id } })
    await db.subscription.create({ data: { userId: user.id, plan: "free" } })
    await db.referral.create({
      data: { code: `${username}-${user.id.slice(0, 4)}`, referrerId: user.id, status: "pending" },
    })
  } else if (!user.profile) {
    // User exists but no profile — create one
    const baseUsername = email.split("@")[0].replace(/[^a-z0-9_]/gi, "").slice(0, 18) || "studenter"
    let username = baseUsername
    let n = 1
    while (await db.profile.findUnique({ where: { username } })) {
      username = `${baseUsername}${n++}`
    }
    await db.profile.create({
      data: {
        userId: user.id,
        username,
        displayName: baseUsername,
        onboardingComplete: false,
      },
    })
    await db.streak.create({ data: { userId: user.id } }).catch(() => {})
    await db.subscription.create({ data: { userId: user.id, plan: "free" } }).catch(() => {})
  }

  // Update last login
  await db.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  })

  // Return the full user context (same as /auth/me)
  const fullUser = await db.user.findUnique({
    where: { id: user.id },
    include: { profile: true, streak: true },
  })

  return ok({
    id: fullUser!.id,
    email: fullUser!.email,
    role: fullUser!.role,
    status: fullUser!.status,
    profile: fullUser!.profile,
    streak: fullUser!.streak
      ? {
          current: fullUser!.streak.current,
          longest: fullUser!.streak.longest,
          lastStudyDate: fullUser!.streak.lastStudyDate,
          freezesAvailable: fullUser!.streak.freezesAvailable,
          freezesUsed: fullUser!.streak.freezesUsed,
          lastFreezeDate: fullUser!.streak.lastFreezeDate,
        }
      : null,
  })
}
