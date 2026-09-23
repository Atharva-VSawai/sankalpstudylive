import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, getAuth } from "@/lib/api"
import { localDateForTimezone } from "@/lib/study"

// GET /api/study/heatmap?weeks=12
// Returns per-day study minutes for the last N weeks (GitHub-style contribution graph).
export async function GET(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const url = new URL(req.url)
  const weeks = Math.min(26, Math.max(4, Number(url.searchParams.get("weeks") || 12)))
  const user = await db.user.findUnique({ where: { id: ctx.userId } })
  const tz = user?.timezone ?? "Asia/Kolkata"

  const today = localDateForTimezone(new Date(), tz)
  // start from the Sunday of (weeks-1) weeks ago
  const start = new Date(today.getTime() - (weeks * 7 - 1) * 86400000)
  // roll back to Sunday
  const startDow = start.getUTCDay()
  const startDate = new Date(start.getTime() - startDow * 86400000)

  const sessions = await db.studySession.findMany({
    where: { userId: ctx.userId, endedAt: { not: null }, startedAt: { gte: startDate } },
    select: { startedAt: true, durationMin: true },
  })

  const dayMap = new Map<string, number>()
  for (const s of sessions) {
    const d = localDateForTimezone(s.startedAt, tz).toISOString().slice(0, 10)
    dayMap.set(d, (dayMap.get(d) ?? 0) + s.durationMin)
  }

  // build full grid including today
  const days: { date: string; minutes: number }[] = []
  const totalDays = weeks * 7
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(startDate.getTime() + i * 86400000)
    const key = d.toISOString().slice(0, 10)
    days.push({ date: key, minutes: dayMap.get(key) ?? 0 })
  }
  const total = days.reduce((a, b) => a + b.minutes, 0)
  const activeDays = days.filter((d) => d.minutes > 0).length
  return ok({ weeks, days, totalMinutes: total, activeDays, startDate: startDate.toISOString() })
}
