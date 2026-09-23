import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, getAuth } from "@/lib/api"
import { localDateForTimezone } from "@/lib/study"

// GET /api/study/achievements
// Returns the user's achievements from the last 7 days: badges earned, streak
// milestones crossed, goal-hit days, total XP gained, longest session.
export async function GET(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const user = await db.user.findUnique({ where: { id: ctx.userId } })
  const tz = user?.timezone ?? "Asia/Kolkata"
  const since = new Date(Date.now() - 7 * 86400000)

  // badges earned this week
  const recentBadges = await db.userBadge.findMany({
    where: { userId: ctx.userId, awardedAt: { gte: since } },
    include: { badge: true },
    orderBy: { awardedAt: "desc" },
  })

  // sessions this week (for longest session + total xp + goal-hit days)
  const sessions = await db.studySession.findMany({
    where: { userId: ctx.userId, endedAt: { not: null }, startedAt: { gte: since } },
    select: { startedAt: true, durationMin: true, xpEarned: true, mode: true },
  })
  const totalXp = sessions.reduce((a, s) => a + s.xpEarned, 0)
  const longestSession = sessions.reduce((a, s) => Math.max(a, s.durationMin), 0)

  // goal-hit days (distinct calendar days with completed goals)
  const goals = await db.dailyGoal.findMany({
    where: { userId: ctx.userId, completed: true, date: { gte: new Date(since.getTime() - 1 * 86400000) } },
    select: { date: true },
  })
  const goalHitDays = new Set(goals.map((g) => g.date.toISOString().slice(0, 10))).size

  // streak milestone (current streak crossed a multiple of 7)
  const streak = await db.streak.findUnique({ where: { userId: ctx.userId } })
  const streakMilestone = streak && streak.current > 0 && streak.current % 7 === 0 ? streak.current : null

  return ok({
    badges: recentBadges.map((b) => ({
      slug: b.badge.slug,
      name: b.badge.name,
      description: b.badge.description,
      tier: b.badge.tier,
      awardedAt: b.awardedAt,
    })),
    totalXp,
    longestSession,
    goalHitDays,
    streakMilestone,
    sessionCount: sessions.length,
  })
}
