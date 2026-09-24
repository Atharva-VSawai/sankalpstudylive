import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, getAuth } from "@/lib/api"
import { localDateForTimezone } from "@/lib/study"

// GET /api/study/heatmap?weeks=12 or ?year=2026&month=9
// Returns per-day study minutes for the requested period.
export async function GET(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const url = new URL(req.url)
  const weeks = Math.min(26, Math.max(4, Number(url.searchParams.get("weeks") || 12)))
  const requestedYear = Number(url.searchParams.get("year"))
  const requestedMonth = Number(url.searchParams.get("month"))
  const hasMonth = Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= 2100 && Number.isInteger(requestedMonth) && requestedMonth >= 1 && requestedMonth <= 12
  const user = await db.user.findUnique({ where: { id: ctx.userId } })
  const tz = user?.timezone ?? "Asia/Kolkata"

  const today = localDateForTimezone(new Date(), tz)
  let startDate: Date
  let endDate: Date | null = null
  if (hasMonth) {
    // Dates are represented as UTC midnights after timezone conversion. Query
    // a small boundary around the month, then filter by the mapped local date.
    startDate = new Date(Date.UTC(requestedYear, requestedMonth - 1, 1))
    endDate = new Date(Date.UTC(requestedYear, requestedMonth, 1))
  } else {
    // start from the Sunday of (weeks-1) weeks ago
    const start = new Date(today.getTime() - (weeks * 7 - 1) * 86400000)
    const startDow = start.getUTCDay()
    startDate = new Date(start.getTime() - startDow * 86400000)
  }
  const queryStart = hasMonth ? new Date(startDate.getTime() - 2 * 86400000) : startDate
  const queryEnd = endDate ? new Date(endDate.getTime() + 2 * 86400000) : undefined

  const sessions = await db.studySession.findMany({
    where: { userId: ctx.userId, endedAt: { not: null }, startedAt: { gte: queryStart, ...(queryEnd ? { lt: queryEnd } : {}) } },
    select: { startedAt: true, durationMin: true },
  })

  const dayMap = new Map<string, number>()
  for (const s of sessions) {
    const d = localDateForTimezone(s.startedAt, tz).toISOString().slice(0, 10)
    if (hasMonth && (d < startDate.toISOString().slice(0, 10) || d >= endDate!.toISOString().slice(0, 10))) continue
    dayMap.set(d, (dayMap.get(d) ?? 0) + s.durationMin)
  }

  // build full grid including today
  const days: { date: string; minutes: number }[] = []
  const totalDays = hasMonth ? new Date(Date.UTC(requestedYear, requestedMonth, 0)).getUTCDate() : weeks * 7
  for (let i = 0; i < totalDays; i++) {
    const d = new Date(startDate.getTime() + i * 86400000)
    const key = d.toISOString().slice(0, 10)
    days.push({ date: key, minutes: dayMap.get(key) ?? 0 })
  }
  const total = days.reduce((a, b) => a + b.minutes, 0)
  const activeDays = days.filter((d) => d.minutes > 0).length
  return ok({ weeks: hasMonth ? undefined : weeks, year: hasMonth ? requestedYear : undefined, month: hasMonth ? requestedMonth : undefined, days, totalMinutes: total, activeDays, startDate: startDate.toISOString() })
}
