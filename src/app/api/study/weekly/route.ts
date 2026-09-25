import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, getAuth } from "@/lib/api"
import { localDateForTimezone } from "@/lib/study"

// GET /api/study/weekly
// Returns the user's study stats for the current ISO week (Mon→Sun) + the previous
// week for comparison, plus the "best day" highlight.
export async function GET(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const user = await db.user.findUnique({ where: { id: ctx.userId } })
  const tz = user?.timezone ?? "Asia/Kolkata"

  const today = localDateForTimezone(new Date(), tz)
  // roll back to Monday (getUTCDay: 0=Sun,1=Mon..)
  const dow = today.getUTCDay()
  const mondayOffset = dow === 0 ? 6 : dow - 1 // Mon=0
  const thisMonday = new Date(today.getTime() - mondayOffset * 86400000)
  const lastMonday = new Date(thisMonday.getTime() - 7 * 86400000)
  const nextMonday = new Date(thisMonday.getTime() + 7 * 86400000)

  const sessions = await db.studySession.findMany({
    where: { userId: ctx.userId, endedAt: { not: null }, startedAt: { gte: new Date(lastMonday.getTime() - 86400000), lt: new Date(nextMonday.getTime() + 86400000) } },
    select: { startedAt: true, durationMin: true, xpEarned: true, mode: true },
  })

  // build per-day buckets for this week + last week
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  const thisWeek: { day: string; date: string; minutes: number; sessions: number }[] = []
  const lastWeek: { day: string; minutes: number; sessions: number }[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(thisMonday.getTime() + i * 86400000)
    const key = d.toISOString().slice(0, 10)
    thisWeek.push({ day: days[i], date: key, minutes: 0, sessions: 0 })
    const ld = new Date(lastMonday.getTime() + i * 86400000)
    lastWeek.push({ day: days[i], minutes: 0, sessions: 0 })
  }
  const thisMap = new Map(thisWeek.map((d) => [d.date, d]))
  const lastMap = new Map(lastWeek.map((d, i) => [new Date(lastMonday.getTime() + i * 86400000).toISOString().slice(0, 10), d]))

  let thisTotal = 0
  let lastTotal = 0
  for (const s of sessions) {
    const d = localDateForTimezone(s.startedAt, tz).toISOString().slice(0, 10)
    if (thisMap.has(d)) {
      const bucket = thisMap.get(d)!
      bucket.minutes += s.durationMin
      bucket.sessions += 1
      thisTotal += s.durationMin
    } else if (lastMap.has(d)) {
      const bucket = lastMap.get(d)!
      bucket.minutes += s.durationMin
      bucket.sessions += 1
      lastTotal += s.durationMin
    }
  }

  // best day = max-minutes day this week (excluding zero days)
  const daysWithStudy = thisWeek.filter((d) => d.minutes > 0)
  const bestDay = daysWithStudy.length > 0
    ? daysWithStudy.reduce((a, b) => (b.minutes > a.minutes ? b : a))
    : null

  // today's index for "today so far"
  const todayKey = today.toISOString().slice(0, 10)
  const todayBucket = thisWeek.find((d) => d.date === todayKey)

  // streak vs goal
  const goal = await db.dailyGoal.findUnique({
    where: { userId_date: { userId: ctx.userId, date: today } },
    select: { targetMin: true, achievedMin: true, completed: true },
  })

  // change vs last week (percent)
  const changePct = lastTotal > 0 ? Math.round(((thisTotal - lastTotal) / lastTotal) * 100) : (thisTotal > 0 ? 100 : 0)

  return ok({
    thisWeek,
    lastWeek,
    thisTotal,
    lastTotal,
    changePct,
    bestDay: bestDay ? { day: bestDay.day, date: bestDay.date, minutes: bestDay.minutes, sessions: bestDay.sessions } : null,
    today: todayBucket ? { minutes: todayBucket.minutes, sessions: todayBucket.sessions } : { minutes: 0, sessions: 0 },
    dailyGoalMin: goal?.targetMin ?? 360,
    // Completion is derived from the same finalized-session total returned
    // above, rather than trusting a stale DailyGoal counter.
    goalCompletedToday: Boolean(goal && todayBucket && todayBucket.minutes >= goal.targetMin),
  })
}
