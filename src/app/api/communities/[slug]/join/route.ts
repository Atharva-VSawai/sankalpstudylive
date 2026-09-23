import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, notFound, unauthorized, badRequest, getAuth } from "@/lib/api"

// POST /api/communities/[slug]/join
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const { slug } = await params
  const community = await db.community.findUnique({ where: { slug } })
  if (!community) return notFound("Community not found")

  const existing = await db.communityMember.findUnique({
    where: { communityId_userId: { communityId: community.id, userId: ctx.userId } },
  })
  if (existing) return badRequest("You are already a member", "ALREADY_MEMBER")

  await db.communityMember.create({ data: { communityId: community.id, userId: ctx.userId, role: "member" } })
  await db.community.update({ where: { id: community.id }, data: { memberCount: { increment: 1 } } })
  return ok({ joined: true })
}
