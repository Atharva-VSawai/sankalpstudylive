import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, badRequest, getAuth } from "@/lib/api"

// GET /api/profile — current user's profile (full)
// PATCH /api/profile — update profile
export async function GET(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const user = await db.user.findUnique({
    where: { id: ctx.userId },
    include: { profile: true, streak: true, subscription: true, badges: { include: { badge: true } } },
  })
  return ok({
    id: user!.id,
    email: user!.email,
    role: user!.role,
    timezone: user!.timezone,
    profile: {
      ...user!.profile,
      badges: (user!.badges ?? []).map((b) => ({
        slug: b.badge.slug,
        name: b.badge.name,
        description: b.badge.description,
        tier: b.badge.tier,
        awardedAt: b.awardedAt,
      })),
    },
    streak: user!.streak,
    subscription: user!.subscription,
  })
}

export async function PATCH(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const body = await req.json().catch(() => ({}))
  const data: any = {}
  if (typeof body?.displayName === "string" && body.displayName.trim().length >= 2) data.displayName = body.displayName.trim()
  if (typeof body?.bio === "string") data.bio = body.bio.slice(0, 500)
  if (typeof body?.avatarUrl === "string") data.avatarUrl = body.avatarUrl
  if (typeof body?.username === "string") {
    const username = body.username.trim().toLowerCase().replace(/[^a-z0-9_]/g, "")
    if (username.length < 3) return badRequest("Username must be at least 3 characters")
    const taken = await db.profile.findFirst({ where: { username, userId: { not: ctx.userId } } })
    if (taken) return badRequest("That username is taken", "USERNAME_TAKEN")
    data.username = username
  }
  if (body?.examGoal) data.examGoal = String(body.examGoal)
  if (body?.targetYear) data.targetYear = Number(body.targetYear)
  if (body?.studyHoursGoal) data.studyHoursGoal = Math.min(1440, Math.max(15, Number(body.studyHoursGoal)))
  if (body?.sessionTimeoutMin !== undefined) {
    const t = Number(body.sessionTimeoutMin)
    if (Number.isFinite(t) && t >= 0 && t <= 1440) data.sessionTimeoutMin = t
  }
  if (body?.timezone) data.timezone = String(body.timezone)
  if (typeof body?.timezone === "string") {
    await db.user.update({ where: { id: ctx.userId }, data: { timezone: body.timezone } })
  }
  const profile = await db.profile.update({ where: { userId: ctx.userId }, data })
  return ok({ profile })
}
