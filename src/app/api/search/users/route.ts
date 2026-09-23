import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, getAuth } from "@/lib/api"

// GET /api/search/users?q=&limit=10
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const q = url.searchParams.get("q")?.toLowerCase()
  if (!q || q.length < 1) return ok({ users: [] })
  const limit = Math.min(20, Math.max(1, Number(url.searchParams.get("limit") || 10)))

  const profiles = await db.profile.findMany({
    where: {
      OR: [{ username: { contains: q } }, { displayName: { contains: q } }],
      onboardingComplete: true,
    },
    take: limit,
    select: { userId: true, username: true, displayName: true, avatarUrl: true, examGoal: true, level: true },
  })

  // exclude blocked users if authed
  const ctx = await getAuth(req)
  let blockedIds = new Set<string>()
  if (ctx) {
    const blocks = await db.block.findMany({ where: { blockerId: ctx.userId }, select: { blockedId: true } })
    blockedIds = new Set(blocks.map((b) => b.blockedId))
  }
  return ok({ users: profiles.filter((p) => !blockedIds.has(p.userId)) })
}
