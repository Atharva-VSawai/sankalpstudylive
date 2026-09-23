import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, notFound, unauthorized, getAuth } from "@/lib/api"

// POST /api/communities/[slug]/leave
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const { slug } = await params
  const community = await db.community.findUnique({ where: { slug } })
  if (!community) return notFound("Community not found")

  const existing = await db.communityMember.findUnique({
    where: { communityId_userId: { communityId: community.id, userId: ctx.userId } },
  })
  if (!existing) return ok({ left: false, reason: "NOT_MEMBER" })

  await db.communityMember.delete({
    where: { communityId_userId: { communityId: community.id, userId: ctx.userId } },
  })
  await db.community.update({ where: { id: community.id }, data: { memberCount: { decrement: 1 } } })
  return ok({ left: true })
}
