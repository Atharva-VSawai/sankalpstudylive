import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok } from "@/lib/api"
import { communityOrderIndex } from "@/lib/community-order"

// GET /api/communities — list all communities
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const q = url.searchParams.get("q")?.toLowerCase()
  const featured = url.searchParams.get("featured") === "true"
  const activeSince = new Date(Date.now() - 60_000)

  const where: any = {}
  if (q) {
    where.OR = [
      { name: { contains: q } },
      { description: { contains: q } },
      { slug: { contains: q } },
    ]
  }
  if (featured) where.isFeatured = true

  const communities = await db.community.findMany({
    where,
    orderBy: [{ memberCount: "desc" }],
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      examGoal: true,
      color: true,
      iconUrl: true,
      memberCount: true,
      isFeatured: true,
      tags: true,
      rooms: {
        where: { isLive: true },
        select: {
          _count: {
            select: {
              members: { where: { leftAt: null, lastSeenAt: { gt: activeSince } } },
            },
          },
        },
      },
    },
  })

  return ok({
    communities: communities.map(({ rooms, ...c }) => ({
      ...c,
      tags: safeParse(c.tags),
      // A room is live in discovery only when it has at least one participant
      // with a recent server heartbeat. The persisted isLive flag alone can
      // remain true after a browser/app disconnects unexpectedly.
      liveRooms: rooms.filter((room) => room._count.members > 0).length,
    })).sort((a, b) => communityOrderIndex(a.slug) - communityOrderIndex(b.slug)),
  })
}

function safeParse(s: string) {
  try { return JSON.parse(s) } catch { return [] }
}
