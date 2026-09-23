import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, notFound, unauthorized, getAuth } from "@/lib/api"
import { joinRoom, leaveRoom, listParticipants, heartbeat, reapStale, updateParticipant } from "@/lib/presence"

// GET /api/rooms/[id]/presence
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  reapStale(id)
  return ok({ participants: listParticipants(id) })
}

// POST /api/rooms/[id]/presence — join (register in presence) + heartbeat
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const { id } = await params
  const room = await db.room.findUnique({ where: { id } })
  if (!room) return notFound("Room not found")

  const profile = await db.profile.findUnique({ where: { userId: ctx.userId } })
  if (!profile) return notFound("Profile missing")

  const body = await req.json().catch(() => ({}))
  const member = await db.roomMember.findUnique({
    where: { roomId_userId: { roomId: id, userId: ctx.userId } },
  })
  const role = member?.role ?? "participant"

  if (body?.action === "leave") {
    leaveRoom(id, ctx.userId)
    await db.roomMember.updateMany({
      where: { roomId: id, userId: ctx.userId, leftAt: null },
      data: { leftAt: new Date() },
    })
    const remaining = listParticipants(id).length
    await db.room.update({ where: { id }, data: { participantCount: Math.max(0, remaining) } })
    return ok({ left: true, remaining })
  }

  if (body?.action === "heartbeat") {
    heartbeat(id, ctx.userId)
    reapStale(id)
    return ok({ ok: true })
  }

  // ── SILENT STUDY ROOM: micOn is always false ──
  // The client may send micOn but we force it to false — rooms are silent.
  const p = joinRoom(id, {
    userId: ctx.userId,
    username: profile.username,
    displayName: profile.displayName,
    avatarUrl: profile.avatarUrl ?? undefined,
    micOn: false, // SILENT — no audio publication
    camOn: body?.camOn ?? false,
    isSpeaking: false,
    role: role as any,
    joinedAt: Date.now(),
  })

  const count = listParticipants(id).length
  await db.room.update({ where: { id }, data: { participantCount: count } })
  return ok({ participant: p, count })
}

// PATCH /api/rooms/[id]/presence — update camOn only (mic is always off)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  // In the silent study room, only camOn can be toggled. micOn is always false.
  const patch: any = {}
  if (typeof body?.camOn === "boolean") patch.camOn = body.camOn
  // micOn is forced to false — rooms are silent
  patch.micOn = false
  const p = updateParticipant(id, ctx.userId, patch)
  if (!p) return notFound("Not in room")
  return ok({ participant: p })
}
