import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, getAuth } from "@/lib/api"
import { localDateForTimezone } from "@/lib/study"

// GET /api/leaderboard?scope=global|community&communitySlug=&period=daily|weekly|monthly|alltime&limit=50
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const scope = url.searchParams.get("scope") || "global" // global | community | friends
  const communitySlug = url.searchParams.get("communitySlug")
  const period = url.searchParams.get("period") || "weekly"
  const limit = Math.min(100, Math.max(10, Number(url.searchParams.get("limit") || 50)))

  const now = new Date()
  let since: Date | null = null
  if (period === "daily") since = new Date(now.getTime() - 24 * 3600000)
  else if (period === "weekly") since = new Date(now.getTime() - 7 * 86400000)
  else if (period === "monthly") since = new Date(now.getTime() - 30 * 86400000)

  // Aggregate study session minutes per user, optionally filtered by community.
  const where: any = {}
  if (since) where.startedAt = { gte: since }
  if (scope === "community" && communitySlug) {
    const community = await db.community.findUnique({ where: { slug: communitySlug } })
    if (!community) return ok({ rows: [] })
    where.communityId = community.id
  }

  // friends scope requires auth
  let friendIds: string[] | null = null
  if (scope === "friends") {
    const ctx = await getAuth(req)
    if (!ctx) return ok({ rows: [] })
    const accepted = await db.friendship.findMany({
      where: { status: "accepted", OR: [{ fromUserId: ctx.userId }, { toUserId: ctx.userId }] },
    })
    friendIds = accepted.map((f) => (f.fromUserId === ctx.userId ? f.toUserId : f.fromUserId))
    where.userId = { in: [...friendIds, ctx.userId] }
  }

  const sessions = await db.studySession.findMany({
    where: { ...where, endedAt: { not: null } },
    select: { userId: true, durationMin: true, xpEarned: true },
  })

  const agg = new Map<string, { minutes: number; xp: number }>()
  // Demo weekly snapshots are database-backed fixtures for local/demo
  // environments. They never affect personal study totals, goals, XP, or
  // streaks; real finalized sessions are added on top dynamically.
  if (scope === "global" && period === "weekly") {
    const demoRows = await db.leaderboardSnapshot.findMany({
      where: { scope: "global_demo", period: "weekly" },
      select: { userId: true, minutes: true, xp: true },
    })
    for (const row of demoRows) agg.set(row.userId, { minutes: row.minutes, xp: row.xp })
  }
  for (const s of sessions) {
    const cur = agg.get(s.userId) ?? { minutes: 0, xp: 0 }
    cur.minutes += s.durationMin
    cur.xp += s.xpEarned
    agg.set(s.userId, cur)
  }

  const ranked = Array.from(agg.entries())
    .map(([userId, v]) => ({ userId, minutes: v.minutes, xp: v.xp }))
    .sort((a, b) => b.minutes - a.minutes || b.xp - a.xp)
    .slice(0, limit)

  const users = await db.profile.findMany({
    where: { userId: { in: ranked.map((r) => r.userId) } },
    select: { userId: true, username: true, displayName: true, avatarUrl: true, examGoal: true, level: true },
  })
  const byUser = new Map(users.map((u) => [u.userId, u]))

  const rows = ranked.map((r, i) => {
    const u = byUser.get(r.userId)
    return {
      rank: i + 1,
      userId: r.userId,
      username: u?.username ?? "anon",
      displayName: u?.displayName ?? "Anon",
      avatarUrl: u?.avatarUrl ?? null,
      examGoal: u?.examGoal ?? null,
      level: u?.level ?? 1,
      minutes: r.minutes,
      xp: r.xp,
    }
  })
  return ok({ scope, period, rows })
}
