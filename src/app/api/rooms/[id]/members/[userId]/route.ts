import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, notFound, unauthorized, forbidden, badRequest, getAuth, isModerator } from "@/lib/api"
import { leaveRoom, postMessage } from "@/lib/presence"

// PATCH /api/rooms/[id]/members/[userId] — mute/unmute or change role (host/mod only)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const { id, userId } = await params
  const room = await db.room.findUnique({ where: { id } })
  if (!room) return notFound("Room not found")

  const requester = await db.roomMember.findUnique({
    where: { roomId_userId: { roomId: id, userId: ctx.userId } },
  })
  const isHost = room.ownerId === ctx.userId || requester?.role === "host" || requester?.role === "co_host"
  if (!isHost && !isModerator(ctx)) return forbidden("Only the host or a moderator can do that")

  const body = await req.json().catch(() => ({}))
  const target = await db.roomMember.findUnique({
    where: { roomId_userId: { roomId: id, userId } },
  })
  if (!target) return notFound("Member not in room")

  const data: any = {}
  if (typeof body?.muted === "boolean") data.muted = body.muted
  if (typeof body?.role === "string" && ["host", "co_host", "participant", "viewer"].includes(body.role)) {
    if (userId === room.ownerId) return badRequest("Cannot change the owner's role")
    data.role = body.role
  }
  await db.roomMember.update({ where: { id: target.id }, data })

  if (data.muted === true) {
    const profile = await db.profile.findUnique({ where: { userId } })
    postMessage(id, "system", "System", `${profile?.displayName ?? "A participant"} was muted by the host`, true)
  }
  return ok({ member: { userId, ...data } })
}

// DELETE /api/rooms/[id]/members/[userId] — kick (host/mod only)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; userId: string }> }) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const { id, userId } = await params
  const room = await db.room.findUnique({ where: { id } })
  if (!room) return notFound("Room not found")

  const requester = await db.roomMember.findUnique({
    where: { roomId_userId: { roomId: id, userId: ctx.userId } },
  })
  const isHost = room.ownerId === ctx.userId || requester?.role === "host" || requester?.role === "co_host"
  if (!isHost && !isModerator(ctx)) return forbidden("Only the host or a moderator can do that")
  if (userId === room.ownerId) return badRequest("Cannot kick the room owner")

  leaveRoom(id, userId)
  await db.roomMember.updateMany({
    where: { roomId: id, userId, leftAt: null },
    data: { leftAt: new Date() },
  })
  const profile = await db.profile.findUnique({ where: { userId } })
  postMessage(id, "system", "System", `${profile?.displayName ?? "A participant"} was removed`, true)
  return ok({ kicked: true })
}
