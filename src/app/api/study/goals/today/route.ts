import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, getAuth } from "@/lib/api"
import { localDateForTimezone } from "@/lib/study"

// GET /api/study/goals/today — today's daily goal for the authed user
// PATCH /api/study/goals/today — update today's target minutes
export async function GET(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const user = await db.user.findUnique({ where: { id: ctx.userId }, include: { profile: true } })
  const tz = user?.timezone ?? "Asia/Kolkata"
  const date = localDateForTimezone(new Date(), tz)
  const goal = await db.dailyGoal.upsert({
    where: { userId_date: { userId: ctx.userId, date } },
    create: { userId: ctx.userId, date, targetMin: user?.profile?.studyHoursGoal ?? 360 },
    update: {},
    include: { user: { include: { streak: true } } },
  })
  // Daily progress is derived from finalized StudySession rows so live-room
  // and solo sessions are combined exactly once. DailyGoal is a target/cache,
  // not the source of truth for achieved study time.
  const todaySessions = await db.studySession.findMany({
    where: {
      userId: ctx.userId,
      endedAt: { not: null },
      startedAt: { gte: new Date(date.getTime() - 86400000), lt: new Date(date.getTime() + 2 * 86400000) },
    },
    select: { startedAt: true, durationMin: true },
  })
  const achievedMin = todaySessions
    .filter((session) => localDateForTimezone(session.startedAt, tz).getTime() === date.getTime())
    .reduce((total, session) => total + session.durationMin, 0)
  const completed = achievedMin >= goal.targetMin
  if (goal.achievedMin !== achievedMin || goal.completed !== completed) {
    await db.dailyGoal.update({ where: { id: goal.id }, data: { achievedMin, completed, completedAt: completed ? (goal.completedAt ?? new Date()) : null } })
  }
  return ok({
    date,
    targetMin: goal.targetMin,
    achievedMin,
    completed,
    completedAt: completed ? (goal.completedAt ?? new Date()) : null,
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
