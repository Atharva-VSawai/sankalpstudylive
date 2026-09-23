import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, getAuth } from "@/lib/api"
import { localDateForTimezone } from "@/lib/study"

// GET /api/study/goals/today — today's daily goal for the authed user
// PATCH /api/study/goals/today — update today's target minutes
export async function GET(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const user = await db.user.findUnique({ where: { id: ctx.userId } })
  const tz = user?.timezone ?? "Asia/Kolkata"
  const date = localDateForTimezone(new Date(), tz)
  const goal = await db.dailyGoal.upsert({
    where: { userId_date: { userId: ctx.userId, date } },
    create: { userId: ctx.userId, date, targetMin: user?.profile?.studyHoursGoal ?? 360 },
    update: {},
    include: { user: { include: { streak: true } } },
  })
  return ok({
    date,
    targetMin: goal.targetMin,
    achievedMin: goal.achievedMin,
    completed: goal.completed,
    completedAt: goal.completedAt,
    streak: goal.user.streak
      ? { current: goal.user.streak.current, longest: goal.user.streak.longest, lastStudyDate: goal.user.streak.lastStudyDate }
      : null,
  })
}

export async function PATCH(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const user = await db.user.findUnique({ where: { id: ctx.userId }, include: { profile: true } })
  const tz = user?.timezone ?? "Asia/Kolkata"
  const date = localDateForTimezone(new Date(), tz)
  const body = await req.json().catch(() => ({}))
  const targetMin = Number(body?.targetMin)
  if (!Number.isFinite(targetMin) || targetMin < 15 || targetMin > 1440) {
    return ok({ error: { code: "BAD_REQUEST", message: "targetMin must be 15–1440" } }, 400) as any
  }
  await db.profile.update({ where: { userId: ctx.userId }, data: { studyHoursGoal: targetMin } })
  const goal = await db.dailyGoal.upsert({
    where: { userId_date: { userId: ctx.userId, date } },
    create: { userId: ctx.userId, date, targetMin, achievedMin: 0, completed: false },
    update: { targetMin },
  })
  return ok({ goal })
}
