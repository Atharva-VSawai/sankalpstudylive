import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, getAuth } from "@/lib/api"

// GET /api/study/badges — badges earned by the authed user (with full badge metadata)
export async function GET(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const all = await db.badge.findMany({ orderBy: { tier: "asc" } })
  const mine = await db.userBadge.findMany({ where: { userId: ctx.userId }, select: { badgeId: true, awardedAt: true } })
  const earned = new Map(mine.map((m) => [m.badgeId, m.awardedAt]))
  return ok({
    badges: all.map((b) => ({
      id: b.id,
      slug: b.slug,
      name: b.name,
      description: b.description,
      tier: b.tier,
      xpReward: b.xpReward,
      earned: earned.has(b.id),
      awardedAt: earned.get(b.id) ?? null,
    })),
  })
}
