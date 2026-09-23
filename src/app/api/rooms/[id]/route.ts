import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, notFound, unauthorized, forbidden, badRequest, getAuth, isModerator } from "@/lib/api"
import { listParticipants, getTimer } from "@/lib/presence"

// GET /api/rooms/[id]
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const room = await db.room.findUnique({
    where: { id },
    include: { community: true, owner: { include: { profile: true } }, members: true },
  })
  if (!room) return notFound("Room not found")

  const participants = listParticipants(id)
  return ok({
    room: {
      id: room.id,
      name: room.name,
      description: room.description,
      isLive: room.isLive,
      isPrivate: room.isPrivate,
      isListed: room.isListed,
      focusMode: room.focusMode,
      participantCount: room.participantCount,
      maxParticipants: room.maxParticipants,
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

  await db.room.update({
    where: { id },
    data: { isLive: false, isListed: false, endedAt: new Date() },
  })
  return ok({ closed: true })
}

function safeParse(s: string) {
  try { return JSON.parse(s) } catch { return {} }
}
