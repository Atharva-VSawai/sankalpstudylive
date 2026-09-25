import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, notFound, unauthorized, forbidden, getAuth } from "@/lib/api"
import { joinRoom, leaveRoom, listParticipants, heartbeat, reapStale, updateParticipant } from "@/lib/presence"
import { isGeneralStudyRoom, isUnassignedNonGeneralRoom } from "@/lib/room-access"
import { closeSession } from "@/app/api/study/sessions/route"
import { beginLiveRoomSession, canJoinLiveRoom, closeActiveLiveRoomSession, entitlementToResponse, FreeAllowanceExhaustedError, LiveRoomAlreadyActiveError } from "@/lib/entitlement"

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
  const room = await db.room.findUnique({ where: { id }, include: { community: true } })
  if (!room) return notFound("Room not found")

  const profile = await db.profile.findUnique({ where: { userId: ctx.userId } })
  if (!profile) return notFound("Profile missing")

  const body = await req.json().catch(() => ({}))
  const member = await db.roomMember.findUnique({
    where: { roomId_userId: { roomId: id, userId: ctx.userId } },
  })
  const role = member?.role ?? "participant"

  if (body?.action === "leave") {
    const allowance = await db.freeRoomAllowance.findUnique({ where: { userId: ctx.userId } })
    // A delayed leave from an older tab must never close a newer session in
    // the same room. New clients send the session id they are closing; old
    // clients without it can still leave ephemeral presence, but heartbeat
    // timeout is the safe fallback for allowance finalization.
    const requestedSessionId = typeof body?.sessionId === "string" ? body.sessionId : null
    const activeId = allowance?.activeRoomId === id && allowance.activeSessionId === requestedSessionId
      ? requestedSessionId
      : null
    if (activeId) {
      const user = await db.user.findUnique({ where: { id: ctx.userId }, select: { timezone: true } })
      await closeSession(activeId, user?.timezone ?? "Asia/Kolkata")
      await closeActiveLiveRoomSession(ctx.userId)
    }
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
    const allowance = await db.freeRoomAllowance.findUnique({ where: { userId: ctx.userId } })
    if (allowance?.activeRoomId === id) {
      await db.roomMember.updateMany({ where: { roomId: id, userId: ctx.userId, leftAt: null }, data: { lastSeenAt: new Date() } })
    }
    reapStale(id)
    return ok({ ok: true })
  }

  const generalStudyRoom = isGeneralStudyRoom(room)
  if (isUnassignedNonGeneralRoom(room)) {
    return forbidden("This room is not assigned to a community.", "ROOM_ACCESS_NOT_CONFIGURED")
  }
  if (!profile.onboardingComplete && room.communityId !== null && !generalStudyRoom) {
    return forbidden("Complete onboarding before joining community rooms.", "ONBOARDING_REQUIRED")
  }
  if (room.communityId !== null && !generalStudyRoom) {
    const membership = await db.communityMember.findUnique({
      where: { communityId_userId: { communityId: room.communityId, userId: ctx.userId } },
      select: { id: true },
    })
    if (!membership) return forbidden("Join this community before entering its focus room.", "NOT_MEMBER")
  }

  // Presence is an independent join boundary after LiveKit token issuance.
  // Enforce the allowance here too so it cannot be bypassed or raced.
  const { allowed, entitlement: currentEntitlement } = await canJoinLiveRoom(ctx.userId)
  if (!allowed) {
    return forbidden(
      "Your 30 minutes of free study time are over. Get a pass to continue in live rooms.",
      "FREE_ALLOWANCE_EXHAUSTED",
      entitlementToResponse(currentEntitlement),
    )
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

  // Only verified application presence starts a live study session. Token
  // issuance and room existence are intentionally not time boundaries.
  const previous = await db.studySession.findFirst({ where: { userId: ctx.userId, endedAt: null }, orderBy: { startedAt: "desc" } })
  if (previous) {
    const user = await db.user.findUnique({ where: { id: ctx.userId }, select: { timezone: true } })
    await closeSession(previous.id, user?.timezone ?? "Asia/Kolkata")
  }
  const session = await db.studySession.create({
    data: {
      userId: ctx.userId,
      activeKey: ctx.userId,
      roomId: id,
      communityId: generalStudyRoom ? null : room.communityId,
      mode: "pomodoro",
    },
  })
  let entitlement: Awaited<ReturnType<typeof beginLiveRoomSession>>
  try {
    // beginLiveRoomSession performs a second check after closing any previous
    // session, preventing the final seconds from being bypassed by a race.
    entitlement = await beginLiveRoomSession(ctx.userId, session.id, id)
  } catch (error) {
    if (error instanceof LiveRoomAlreadyActiveError) {
      await db.studySession.deleteMany({ where: { id: session.id, endedAt: null } })
      leaveRoom(id, ctx.userId)
      await db.roomMember.updateMany({ where: { roomId: id, userId: ctx.userId, leftAt: null }, data: { leftAt: new Date() } })
      return forbidden("This account is already connected to a live room.", "LIVE_ROOM_ALREADY_ACTIVE")
    }
    if (!(error instanceof FreeAllowanceExhaustedError)) throw error
    await db.studySession.update({ where: { id: session.id }, data: { endedAt: new Date() } })
    leaveRoom(id, ctx.userId)
    await db.roomMember.updateMany({ where: { roomId: id, userId: ctx.userId, leftAt: null }, data: { leftAt: new Date() } })
    await db.room.update({ where: { id }, data: { participantCount: listParticipants(id).length } })
    const current = await canJoinLiveRoom(ctx.userId)
    return forbidden(
      "Your 30 minutes of free study time are over. Get a pass to continue in live rooms.",
      "FREE_ALLOWANCE_EXHAUSTED",
      entitlementToResponse(current.entitlement),
    )
  }
  await db.roomMember.updateMany({ where: { roomId: id, userId: ctx.userId, leftAt: null }, data: { lastSeenAt: new Date() } })

  const count = listParticipants(id).length
  await db.room.update({ where: { id }, data: { participantCount: count } })
  return ok({ participant: p, count, sessionId: session.id, startedAt: session.startedAt, entitlement: entitlementToResponse(entitlement) })
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
