import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, getAuth } from "@/lib/api"
import { localDateForTimezone } from "@/lib/study"

// GET /api/study/goals — last 14 days of goal history
export async function GET(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const user = await db.user.findUnique({ where: { id: ctx.userId } })
  const tz = user?.timezone ?? "Asia/Kolkata"
  const today = localDateForTimezone(new Date(), tz)
  const start = new Date(today.getTime() - 13 * 86400000)
  const goals = await db.dailyGoal.findMany({
    where: { userId: ctx.userId, date: { gte: start } },
    orderBy: { date: "asc" },
  })
  const sessions = await db.studySession.findMany({
    where: { userId: ctx.userId, endedAt: { not: null }, startedAt: { gte: new Date(start.getTime() - 86400000), lt: new Date(today.getTime() + 2 * 86400000) } },
    select: { startedAt: true, durationMin: true },
  })
  const totals = new Map<string, number>()
  for (const session of sessions) {
    const key = localDateForTimezone(session.startedAt, tz).toISOString().slice(0, 10)
    totals.set(key, (totals.get(key) ?? 0) + session.durationMin)
  }
  return ok({ goals: goals.map((goal) => {
    const achievedMin = totals.get(goal.date.toISOString().slice(0, 10)) ?? 0
    return { ...goal, achievedMin, completed: achievedMin >= goal.targetMin }
  }) })
}
