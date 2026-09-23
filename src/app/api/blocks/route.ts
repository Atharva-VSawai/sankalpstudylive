import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, badRequest, getAuth } from "@/lib/api"

// POST /api/blocks — block a user { username }
// DELETE /api/blocks — unblock { username }
export async function POST(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const body = await req.json().catch(() => ({}))
  const username = String(body?.username || "").trim().toLowerCase()
  if (!username) return badRequest("Username required")
  const target = await db.profile.findUnique({ where: { username }, include: { user: true } })
  if (!target) return ok({ error: { code: "NOT_FOUND", message: "User not found" } }, 404) as any
  if (target.userId === ctx.userId) return badRequest("You can't block yourself")
  await db.block.upsert({
    where: { blockerId_blockedId: { blockerId: ctx.userId, blockedId: target.userId } },
    create: { blockerId: ctx.userId, blockedId: target.userId },
    update: {},
  })
  // Also remove any existing friendship
  await db.friendship.deleteMany({
    where: { OR: [{ fromUserId: ctx.userId, toUserId: target.userId }, { toUserId: ctx.userId, fromUserId: target.userId }] },
  })
  return ok({ blocked: true })
}

export async function DELETE(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const body = await req.json().catch(() => ({}))
  const username = String(body?.username || "").trim().toLowerCase()
  const target = await db.profile.findUnique({ where: { username } })
  if (!target) return ok({ unblocked: false })
  await db.block.deleteMany({ where: { blockerId: ctx.userId, blockedId: target.userId } })
  return ok({ unblocked: true })
}
