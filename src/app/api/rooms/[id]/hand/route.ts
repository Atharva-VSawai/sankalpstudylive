import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, notFound, unauthorized, badRequest, forbidden, getAuth } from "@/lib/api"
import { updateParticipant, postMessage } from "@/lib/presence"

// POST /api/rooms/[id]/hand
// Self toggle: { raised: boolean }
// Host lowers someone else: { userId: "<targetUserId>", raised: false }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const { id } = await params
  const room = await db.room.findUnique({ where: { id } })
  if (!room) return notFound("Room not found")
  const member = await db.roomMember.findUnique({
    where: { roomId_userId: { roomId: id, userId: ctx.userId } },
  })
  if (!member) return badRequest("Join the room first", "NOT_MEMBER")

  const body = await req.json().catch(() => ({}))
  const targetUserId = body?.userId ? String(body.userId) : null

  // Host lowering someone else's hand
  if (targetUserId && targetUserId !== ctx.userId) {
    const isHost = room.ownerId === ctx.userId || member.role === "host" || member.role === "co_host"
    if (!isHost) return forbidden("Only the host can lower others' hands")
    const raised = Boolean(body?.raised)
    if (raised) return badRequest("You can only lower others' hands, not raise them")
    const updated = await updateParticipant(id, targetUserId, { handRaised: false, handRaisedAt: null })
    if (!updated) return notFound("Target not in room")
    const targetProfile = await db.profile.findUnique({ where: { userId: targetUserId } })
    const hostProfile = await db.profile.findUnique({ where: { userId: ctx.userId } })
    postMessage(
      id,
      "system",
      "System",
      `${hostProfile?.displayName ?? "Host"} lowered ${targetProfile?.displayName ?? "a participant"}'s hand`,
      true
    )
    return ok({ handRaised: false, handRaisedAt: null, targetUserId })
  }

  // Self toggle (default)
  const raised = Boolean(body?.raised)
  const now = Date.now()
  const updated = await updateParticipant(id, ctx.userId, {
    handRaised: raised,
    handRaisedAt: raised ? now : null,
  })
  if (!updated) return notFound("Not in room")

  const profile = await db.profile.findUnique({ where: { userId: ctx.userId } })
  const name = profile?.displayName ?? "Someone"
  postMessage(id, "system", "System", raised ? `${name} raised their hand ✋` : `${name} lowered their hand`, true)

  return ok({ handRaised: raised, handRaisedAt: updated.handRaisedAt })
}
