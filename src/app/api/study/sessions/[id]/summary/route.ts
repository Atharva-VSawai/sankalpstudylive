import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getAuth, notFound, ok, unauthorized } from "@/lib/api"
import { localDateForTimezone } from "@/lib/study"

// GET /api/study/sessions/[id]/summary
// Returns only the authenticated user's finalized, server-owned session data.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const { id } = await params

  const user = await db.user.findUnique({
    where: { id: ctx.userId },
    select: {
      timezone: true,
      profile: { select: { studyHoursGoal: true } },
      streak: { select: { current: true, longest: true } },
    },
  })
  const session = await db.studySession.findFirst({
    where: { id, userId: ctx.userId, endedAt: { not: null } },
    include: {
      room: { select: { id: true, name: true } },
      community: { select: { slug: true, name: true } },
    },
  })
  if (!user || !session) return notFound("Finalized study session not found")

  const today = localDateForTimezone(new Date(), user.timezone)
  const goal = await db.dailyGoal.findUnique({
    where: { userId_date: { userId: ctx.userId, date: today } },
    select: { targetMin: true, achievedMin: true, completed: true },
  })
  const todaySessions = await db.studySession.findMany({
    where: {
      userId: ctx.userId,
      endedAt: { not: null },
      startedAt: { gte: new Date(today.getTime() - 86400000), lt: new Date(today.getTime() + 2 * 86400000) },
    },
    select: { startedAt: true, durationMin: true },
  })
  const todayTotal = todaySessions
    .filter((item) => localDateForTimezone(item.startedAt, user.timezone).getTime() === today.getTime())
    .reduce((total, item) => total + item.durationMin, 0)

  return ok({
    session: {
      id: session.id,
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      durationMin: session.durationMin,
      xpEarned: session.xpEarned,
      mode: session.mode,
      room: session.room,
      community: session.community,
      date: today,
    },
    today: {
      totalMinutes: todayTotal,
      goalMin: goal?.targetMin ?? user.profile?.studyHoursGoal ?? 360,
      achievedMin: goal?.achievedMin ?? todayTotal,
      completed: goal?.completed ?? false,
    },
    streak: user.streak,
    // Participant peaks and completed Pomodoro rounds are not persisted
    // reliably, so they are intentionally not fabricated here.
  })
}
