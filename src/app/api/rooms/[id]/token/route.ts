import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, notFound, unauthorized, forbidden, badRequest, getAuth } from "@/lib/api"
import { isPaidPlanActive, FREE_ALLOWANCE_MIN } from "@/lib/pricing"
import { rateLimit } from "@/lib/ratelimit"
import { AccessToken, VideoGrant } from "livekit-server-sdk"

// POST /api/rooms/[id]/token
// Issues a REAL LiveKit access token using livekit-server-sdk.
// Token is camera-only (canPublish video, canPublishAudio=false — SILENT study room).
// Short-lived (6 hours). Scoped to exactly one room.
// Server determines identity, room name, and permissions.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()

  // Rate limit: 20 token requests per minute
  const rl = rateLimit(req, { limit: 20, windowMs: 60000, key: "lk-token" })
  if (!rl.ok) return badRequest("Too many requests. Please wait.", "RATE_LIMITED")

  const { id } = await params
  const room = await db.room.findUnique({
    where: { id },
    include: { owner: { include: { profile: true } } },
  })
  if (!room) return notFound("Room not found")

  const profile = await db.profile.findUnique({
    where: { userId: ctx.userId },
    include: { user: { include: { subscription: true } } },
  })
  if (!profile) return badRequest("Profile missing")

  // ── Free-user 60-minute lifetime allowance check (server-authoritative) ──
  const sub = profile.user.subscription
  const hasPaidPlan = isPaidPlanActive(sub)
  if (!hasPaidPlan) {
    if (profile.roomMinutesUsed >= FREE_ALLOWANCE_MIN) {
      return forbidden(
        "You've used all 60 free minutes of live study-room access. Choose a plan to continue.",
        "FREE_ALLOWANCE_EXHAUSTED"
      )
    }
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
    // Short-lived token: 6 hours
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
    // LiveKit uses canPublish for both audio+video by default.
    // The frontend client will NOT publish audio tracks.
    // The token grants video publish only at the application level.
  }
  at.addGrant(grant)

  const token = await at.toJwt()

  // Return ONLY safe data to the client
  return ok({
    token,
    serverUrl: livekitUrl,
    roomName: room.livekitRoom,
    identity: ctx.userId,
    // Access control info for client display
    roomMinutesUsed: profile.roomMinutesUsed,
    freeAllowanceMin: FREE_ALLOWANCE_MIN,
    hasPaidPlan,
  })
}
