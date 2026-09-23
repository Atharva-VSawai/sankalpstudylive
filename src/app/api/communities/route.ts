import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok } from "@/lib/api"

// GET /api/communities — list all communities
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const q = url.searchParams.get("q")?.toLowerCase()
  const featured = url.searchParams.get("featured") === "true"

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
    orderBy: [{ isFeatured: "desc" }, { memberCount: "desc" }],
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
      _count: { select: { rooms: { where: { isLive: true } } } },
    },
  })

  return ok({
    communities: communities.map((c) => ({
      ...c,
      tags: safeParse(c.tags),
      liveRooms: c._count.rooms,
    })),
  })
}

function safeParse(s: string) {
  try { return JSON.parse(s) } catch { return [] }
}
