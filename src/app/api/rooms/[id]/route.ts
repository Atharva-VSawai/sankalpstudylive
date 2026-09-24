import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, notFound, unauthorized, forbidden, badRequest, getAuth, isModerator } from "@/lib/api"
import { clearRoom, listParticipants, getTimer, reapStale } from "@/lib/presence"
import { closeSession } from "@/app/api/study/sessions/route"
import { closeActiveLiveRoomSession } from "@/lib/entitlement"
import { closeLiveKitRoom } from "@/lib/livekit-admin"

// GET /api/rooms/[id]
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const room = await db.room.findUnique({
    where: { id },
    include: { community: true, owner: { include: { profile: true } }, members: true },
  })
  if (!room) return notFound("Room not found")

  reapStale(id)
  const participants = listParticipants(id)
  const activeSince = new Date(Date.now() - 60_000)
  const activeMemberCount = room.members.filter(
    (member) => member.leftAt === null && member.lastSeenAt > activeSince,
  ).length
  return ok({
    room: {
      id: room.id,
      name: room.name,
      description: room.description,
      isLive: room.isLive,
      isPrivate: room.isPrivate,
      isListed: room.isListed,
      isDefaultRoom: room.isDefaultRoom,
      focusMode: room.focusMode,
      participantCount: activeMemberCount,
      pomodoroConfig: safeParse(room.pomodoroConfig),
      tags: safeParse(room.tags),
      startedAt: room.startedAt,
      endedAt: room.endedAt,
      livekitRoom: room.livekitRoom,
      community: room.community ? { slug: room.community.slug, name: room.community.name, color: room.community.color, examGoal: room.community.examGoal } : null,
      owner: {
        id: room.owner.id,
        username: room.owner.profile?.username ?? null,
        displayName: room.owner.profile?.displayName ?? null,
        avatarUrl: room.owner.profile?.avatarUrl ?? null,
      },
    },
    participants,
    timer: getTimer(id),
  })
}

// PATCH /api/rooms/[id] — update room settings (owner/mod only)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const { id } = await params
  const room = await db.room.findUnique({ where: { id } })
  if (!room) return notFound("Room not found")
  if (room.ownerId !== ctx.userId && !isModerator(ctx)) return forbidden()

  const body = await req.json().catch(() => null)
  const data: any = {}
  if (typeof body?.name === "string" && body.name.trim().length >= 3) data.name = body.name.trim()
  if (typeof body?.description === "string") data.description = body.description
  if (typeof body?.isListed === "boolean") data.isListed = body.isListed
  if (typeof body?.focusMode === "boolean") data.focusMode = body.focusMode
  if (typeof body?.isLive === "boolean") data.isLive = body.isLive
  if (typeof body?.maxParticipants === "number") data.maxParticipants = Math.min(50, Math.max(2, body.maxParticipants))
  if (Array.isArray(body?.tags)) data.tags = JSON.stringify(body.tags.map(String).slice(0, 6))

  const updated = await db.room.update({ where: { id }, data })
  return ok({ room: updated })
}

// DELETE /api/rooms/[id] — close room (owner/mod/admin)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const { id } = await params
  const room = await db.room.findUnique({ where: { id } })
  if (!room) return notFound("Room not found")
  if (room.ownerId !== ctx.userId && !isModerator(ctx)) return forbidden()

  const participants = listParticipants(id)
  const participantIds = Array.from(new Set([ctx.userId, ...participants.map((p) => p.userId)]))
  const endedAt = new Date()

  await db.room.update({
    where: { id },
    data: { isLive: false, isListed: false, endedAt, participantCount: 0 },
  })
  clearRoom(id)
  await db.roomMember.updateMany({
    where: { roomId: id, leftAt: null },
    data: { leftAt: endedAt, lastSeenAt: endedAt },
  })

  // Close every active server-side study session associated with the room.
  // This prevents an owner ending a room from leaving other participants'
  // timers/allowances running until their next heartbeat.
  await Promise.all(participantIds.map(async (userId) => {
    const [user, session] = await Promise.all([
      db.user.findUnique({ where: { id: userId }, select: { timezone: true } }),
      db.studySession.findFirst({ where: { userId, roomId: id, endedAt: null }, orderBy: { startedAt: "desc" } }),
    ])
    if (session) await closeSession(session.id, user?.timezone ?? "Asia/Kolkata", endedAt)
    await closeActiveLiveRoomSession(userId)
  }))

  // LiveKit is the media authority. Delete the corresponding LiveKit room so
  // all connected clients receive a server disconnect, even if the owner tab
  // disappears before its client-side cleanup request completes.
  try {
    await closeLiveKitRoom(room.livekitRoom)
  } catch (error) {
    // Database/presence cleanup remains successful if LiveKit is temporarily
    // unavailable; the next room cleanup/reaper can retry the media teardown.
    console.error("[livekit] failed to close room", room.livekitRoom, error)
  }

  return ok({ closed: true, participantCount: 0 })
}

function safeParse(s: string) {
  try { return JSON.parse(s) } catch { return {} }
}
