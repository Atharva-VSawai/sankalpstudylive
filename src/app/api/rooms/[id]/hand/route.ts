import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, notFound, unauthorized, badRequest, getAuth } from "@/lib/api"
import { updateParticipant, postMessage } from "@/lib/presence"

// POST /api/rooms/[id]/hand — toggle your raised hand
// Body: { raised: boolean }
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
  const raised = Boolean(body?.raised)
  const now = Date.now()
  const updated = await updateParticipant(id, ctx.userId, {
    handRaised: raised,
    handRaisedAt: raised ? now : null,
  })
  if (!updated) return notFound("Not in room")

  // system message so everyone knows
  const profile = await db.profile.findUnique({ where: { userId: ctx.userId } })
  const name = profile?.displayName ?? "Someone"
  postMessage(id, "system", raised ? `${name} raised their hand ✋` : `${name} lowered their hand`, true)

  return ok({ handRaised: raised, handRaisedAt: updated.handRaisedAt })
}
