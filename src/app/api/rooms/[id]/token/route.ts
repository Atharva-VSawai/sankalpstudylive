import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, notFound, unauthorized, forbidden, badRequest, getAuth } from "@/lib/api"
import { createHmac } from "crypto"
import { isPaidPlanActive, FREE_ALLOWANCE_MIN } from "@/lib/pricing"

// POST /api/rooms/[id]/token
// Issues a LiveKit access token for a SILENT STUDY ROOM.
// Audio publication is DISABLED — rooms are silent. Camera is enabled.
//
// Free-user enforcement: free users get 60 LIFETIME minutes across all rooms.
// Paid plans (plus/pro) bypass this. The server checks roomMinutesUsed on the
// profile + subscription status. This is server-authoritative and cannot be
// bypassed by the client.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
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
        "You've used all 60 free minutes of live study-room access. Choose a plan below to continue.",
        "FREE_ALLOWANCE_EXHAUSTED"
      )
    }
  }

  // Ensure a RoomMember row exists for the participant
  const member = await db.roomMember.upsert({
    where: { roomId_userId: { roomId: id, userId: ctx.userId } },
    create: { roomId: id, userId: ctx.userId, role: room.ownerId === ctx.userId ? "host" : "participant", muted: true, cameraOff: true },
    update: { leftAt: null, lastSeenAt: new Date() },
  })

  const apiKey = process.env.LIVEKIT_API_KEY || "sankalp-demo-key"
  const apiSecret = process.env.LIVEKIT_API_SECRET || "sankalp-demo-secret-change-me"
  const identity = ctx.userId
  const name = profile.displayName
  const metadata = JSON.stringify({ username: profile.username, avatarUrl: profile.avatarUrl ?? null, role: member.role })

  // ── SILENT ROOM: audio publish DISABLED, camera publish ENABLED ──
  const token = buildLiveKitToken({
    apiKey,
    apiSecret,
    room: room.livekitRoom,
    identity,
    name,
    metadata,
    canPublish: true,        // camera video
    canSubscribe: true,       // see others
    canPublishData: false,    // no screen share / data
    // Audio is disabled at the application level: canPublishAudio = false
    canPublishAudio: false,   // SILENT STUDY ROOM
  })

  return ok({
    token,
    url: process.env.LIVEKIT_URL || "wss://sankalp.livekit.cloud",
    livekitRoom: room.livekitRoom,
    identity,
    wsUrl: process.env.LIVEKIT_URL || "wss://sankalp.livekit.cloud",
    // Inform the client about room-usage status
    roomMinutesUsed: profile.roomMinutesUsed,
    freeAllowanceMin: FREE_ALLOWANCE_MIN,
    hasPaidPlan,
  })
}

// Minimal LiveKit-compatible JWT (HS256). Matches the `AccessToken` shape
// the livekit-server-sdk produces, so the Android client can use the real SDK.
// Added canPublishAudio flag for silent-room enforcement.
function buildLiveKitToken(opts: {
  apiKey: string
  apiSecret: string
  room: string
  identity: string
  name?: string
  metadata?: string
  canPublish: boolean
  canSubscribe: boolean
  canPublishData: boolean
  canPublishAudio?: boolean
}) {
  const now = Math.floor(Date.now() / 1000)
  const exp = now + 6 * 3600
  const header = { alg: "HS256", typ: "JWT" }
  const payload = {
    iss: opts.apiKey,
    sub: opts.identity,
    iat: now,
    exp,
    nbf: now,
    video: {
      roomJoin: true,
      room: opts.room,
      canPublish: opts.canPublish,
      canSubscribe: opts.canSubscribe,
      canPublishData: opts.canPublishData,
      // Silent study room: audio publication disabled at the token level.
      // LiveKit SDK reads this to decide whether to allow mic publish.
      canPublishAudio: opts.canPublishAudio ?? false,
      hidden: false,
      recorder: false,
    },
    name: opts.name,
    metadata: opts.metadata,
  }
  const b64url = (s: string) => Buffer.from(s).toString("base64url")
  const headerEnc = b64url(JSON.stringify(header))
  const payloadEnc = b64url(JSON.stringify(payload))
  const sig = createHmac("sha256", opts.apiSecret).update(`${headerEnc}.${payloadEnc}`).digest("base64url")
  return `${headerEnc}.${payloadEnc}.${sig}`
}
