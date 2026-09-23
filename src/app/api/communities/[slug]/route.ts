import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, notFound, getAuth } from "@/lib/api"

// GET /api/communities/[slug]
export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const community = await db.community.findUnique({ where: { slug } })
  if (!community) return notFound("Community not found")

  const rooms = await db.room.findMany({
    where: { communityId: community.id, isListed: true },
    orderBy: [{ isLive: "desc" }, { participantCount: "desc" }, { createdAt: "desc" }],
    take: 30,
    include: { owner: { include: { profile: true } } },
  })

  // membership status if authed
  let membership: { role: string; joinedAt: Date } | null = null
  const ctx = await getAuth(req)
  if (ctx) {
    const m = await db.communityMember.findUnique({
      where: { communityId_userId: { communityId: community.id, userId: ctx.userId } },
    })
    if (m) membership = { role: m.role, joinedAt: m.joinedAt }
  }

  return ok({
    community: {
      ...community,
      tags: safeParse(community.tags),
    },
    rooms: rooms.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isLive: r.isLive,
      isPrivate: r.isPrivate,
      participantCount: r.participantCount,
      maxParticipants: r.maxParticipants,
      focusMode: r.focusMode,
      tags: safeParse(r.tags),
      owner: {
        id: r.owner.id,
        username: r.owner.profile?.username,
        displayName: r.owner.profile?.displayName,
        avatarUrl: r.owner.profile?.avatarUrl ?? null,
      },
    })),
    membership,
  })
}

function safeParse(s: string) {
  try { return JSON.parse(s) } catch { return [] }
}
