import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, forbidden, getAuth, isModerator } from "@/lib/api"

export async function GET(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  if (!isModerator(ctx)) return forbidden()
  const badges = await db.badge.findMany({ orderBy: { tier: "asc" }, include: { awards: { select: { userId: true, awardedAt: true } } } })
  return ok({
    badges: badges.map((b) => ({
      id: b.id, slug: b.slug, name: b.name, description: b.description, tier: b.tier, xpReward: b.xpReward,
      earnedCount: b.awards.length, recentAwards: b.awards.slice(-5).map((a) => ({ userId: a.userId, awardedAt: a.awardedAt })),
    })),
  })
}
