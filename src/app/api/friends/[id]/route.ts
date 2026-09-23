import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, notFound, badRequest, getAuth } from "@/lib/api"

// PATCH /api/friends/[id] — accept (action=accept) or decline (action=decline) a pending request
// [id] here is the fromUserId of the pending request.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const action = body?.action === "decline" ? "declined" : "accepted"

  const req_ = await db.friendship.findFirst({
    where: { fromUserId: id, toUserId: ctx.userId, status: "pending" },
  })
  if (!req_) return notFound("Pending request not found")
  await db.friendship.update({ where: { id: req_.id }, data: { status: action } })

  if (action === "accepted") {
    await db.notification.create({
      data: {
        userId: id,
        type: "friend_accept",
        title: "Friend request accepted",
        body: "You are now study buddies",
        link: "#/friends",
      },
    })
  }
  return ok({ status: action })
}

// DELETE /api/friends/[id] — unfriend / cancel request
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const { id } = await params
  await db.friendship.deleteMany({
    where: { OR: [{ fromUserId: ctx.userId, toUserId: id }, { toUserId: ctx.userId, fromUserId: id }] },
  })
  return ok({ removed: true })
}
