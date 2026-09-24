import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, notFound, unauthorized, forbidden, badRequest, getAuth } from "@/lib/api"
import { isPaidPlanActive } from "@/lib/pricing"
import { rateLimit } from "@/lib/ratelimit"
import { AccessToken, VideoGrant } from "livekit-server-sdk"
import { canJoinLiveRoom, beginLiveRoomSession, entitlementToResponse } from "@/lib/entitlement"
import { isGeneralStudyRoom, isUnassignedNonGeneralRoom } from "@/lib/room-access"

// POST /api/rooms/[id]/token
// Issues a REAL LiveKit access token using livekit-server-sdk.
// Token is camera-only (canPublish video, canPublishAudio=false — SILENT study room).
// Short-lived (6 hours). Scoped to exactly one room.
// Server determines identity, room name, and permissions.
//
// ── FREE ALLOWANCE ENFORCEMENT ──
// The server is the source of truth for the free live-room allowance
// (30 min / rolling 24h, global across all rooms). Before issuing a token,
// the server checks the user's entitlement. If the user is free AND their
// global remaining seconds <= 0, the token is REFUSED with
// FREE_ALLOWANCE_EXHAUSTED — no LiveKit token is issued. This is the
// authoritative gate; the frontend cannot bypass it by manipulating state.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()

  // Rate limit: 20 token requests per minute. Token requests do NOT reset or
  // replenish free time — they only check it.
  const rl = rateLimit(req, { limit: 20, windowMs: 60000, key: "lk-token" })
  if (!rl.ok) return badRequest("Too many requests. Please wait.", "RATE_LIMITED")

  const { id } = await params
  const room = await db.room.findUnique({
    where: { id },
    include: { owner: { include: { profile: true } }, community: true },
  })
  if (!room) return notFound("Room not found")
  if (!room.isLive) return badRequest("This room has ended.", "ROOM_ENDED")

  const profile = await db.profile.findUnique({
    where: { userId: ctx.userId },
    include: { user: { include: { subscription: true } } },
  })
  if (!profile) return badRequest("Profile missing")
  const generalStudyRoom = isGeneralStudyRoom(room)
  if (isUnassignedNonGeneralRoom(room)) {
    return forbidden("This room is not assigned to a community.", "ROOM_ACCESS_NOT_CONFIGURED")
  }
  if (!profile.onboardingComplete && room.communityId !== null && !generalStudyRoom) {
    return forbidden("Complete onboarding before joining community rooms.", "ONBOARDING_REQUIRED")
  }

  // Community rooms are gated by the persisted CommunityMember relation. The
  // browser cannot override this with communityId, isMember, or local state.
  if (room.communityId !== null && !generalStudyRoom) {
    const membership = await db.communityMember.findUnique({
      where: { communityId_userId: { communityId: room.communityId, userId: ctx.userId } },
      select: { id: true },
    })
    if (!membership) return forbidden("Join this community before entering its focus room.", "NOT_MEMBER")
  }

  // ── Server-authoritative free allowance check ──
  const { allowed, entitlement } = await canJoinLiveRoom(ctx.userId)
  if (!allowed) {
    return forbidden(
      "Your 30 minutes of free study time are over. Get back to your study room with a plan.",
      "FREE_ALLOWANCE_EXHAUSTED",
      entitlementToResponse(entitlement)
    )
  }

  // ── Validate LiveKit env vars ──
  const livekitUrl = process.env.LIVEKIT_URL
  const livekitApiKey = process.env.LIVEKIT_API_KEY
  const livekitApiSecret = process.env.LIVEKIT_API_SECRET
  if (!livekitUrl || !livekitApiKey || !livekitApiSecret) {
    console.error("[livekit] Missing env vars: LIVEKIT_URL, LIVEKIT_API_KEY, or LIVEKIT_API_SECRET")
    return badRequest("LiveKit is not configured. Contact the administrator.", "LIVEKIT_NOT_CONFIGURED")
  }

  // ── Create a RoomMember row for the participant ──
  await db.roomMember.upsert({
    where: { roomId_userId: { roomId: id, userId: ctx.userId } },
    create: {
      roomId: id,
      userId: ctx.userId,
      role: room.ownerId === ctx.userId ? "host" : "participant",
      muted: true,    // SILENT — mic always off
      cameraOff: true, // camera defaults off, user can toggle
    },
    update: { leftAt: null, lastSeenAt: new Date() },
  })

  // ── Start the server-side study session + register it as the active live-room session ──
  // The StudySession row is created here (not separately by the client) so the
  // token endpoint is the single entry point for joining a room. This avoids a
  // race where the client creates a session but the token request fails (or
  // vice versa). beginLiveRoomSession also closes any prior active session.
  let studySession: { id: string } | null = null
  try {
    studySession = await db.studySession.create({
      data: {
        userId: ctx.userId,
        roomId: room.id,
        communityId: generalStudyRoom ? null : room.communityId,
        mode: "pomodoro",
        startedAt: new Date(),
      },
    })
  } catch (e) {
    console.error("[livekit] failed to create study session:", e)
    return badRequest("Failed to start study session.", "SESSION_ERROR")
  }

  // Register the session as the user's active live-room session. This also
  // closes any prior active session (multi-tab protection: only one active
  // session per user; the previous tab's session is accrued and ended).
  const updatedEnt = await beginLiveRoomSession(ctx.userId, studySession.id, room.id)

  // ── Generate REAL LiveKit access token ──
  // Identity: Sankalp user ID (opaque, stable)
  // Name: display name for UI
  // Room: stable LiveKit room name from DB
  const at = new AccessToken(livekitApiKey, livekitApiSecret, {
    identity: ctx.userId,
    name: profile.displayName,
    metadata: JSON.stringify({
      username: profile.username,
      avatarUrl: profile.avatarUrl ?? null,
    }),
    // Short-lived token: 6 hours. For free users, the server-side allowance
    // still kicks them out at 00:00 regardless of token TTL — the heartbeat
    // endpoint refuses to issue further presence and the client is told to
    // disconnect.
    ttl: 6 * 3600,
  })

  // ── Camera-only grant: canPublish video, canSubscribe, NO audio ──
  const grant: VideoGrant = {
    roomJoin: true,
    room: room.livekitRoom,
    canPublish: true,         // camera video publish
    canSubscribe: true,        // see other participants
    canPublishData: false,     // no screen share / data
    // SILENT STUDY ROOM: audio publish is disabled
  }
  at.addGrant(grant)

  const token = await at.toJwt()

  // Return ONLY safe data to the client. The entitlement is included so the
  // frontend can show the countdown, but the server NEVER accepts these values
  // back as authoritative.
  return ok({
    token,
    serverUrl: livekitUrl,
    roomName: room.livekitRoom,
    identity: ctx.userId,
    entitlement: entitlementToResponse(updatedEnt),
    hasPaidPlan: updatedEnt.isPaid,
  })
}
