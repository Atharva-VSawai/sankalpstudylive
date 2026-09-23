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
  return ok({ goals })
}
