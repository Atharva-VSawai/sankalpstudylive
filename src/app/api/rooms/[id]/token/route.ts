import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, notFound, unauthorized, forbidden, badRequest, getAuth } from "@/lib/api"
import { createHmac } from "crypto"

// POST /api/rooms/[id]/token
// Issues a LiveKit access token. In the sandbox we build a real LiveKit-style JWT
// (signed with a placeholder secret) so the contract matches production exactly.
// Production swaps in the livekit-server-sdk with real LIVEKIT_API_KEY/SECRET.
// See docs/livekit.md.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const { id } = await params
  const room = await db.room.findUnique({
    where: { id },
    include: { owner: { include: { profile: true } } },
  })
  if (!room) return notFound("Room not found")

  const body = await req.json().catch(() => ({}))
  const canPublish = body?.canPublish !== false // camera/mic publish grant
  const canPublishData = Boolean(body?.canPublishData) // screen share etc.

  // Check capacity
  if (room.participantCount >= room.maxParticipants) return forbidden("Room is full", "ROOM_FULL")

  const profile = await db.profile.findUnique({ where: { userId: ctx.userId } })
  if (!profile) return badRequest("Profile missing")

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

  const token = buildLiveKitToken({
    apiKey,
    apiSecret,
    room: room.livekitRoom,
    identity,
    name,
    metadata,
    canPublish,
    canSubscribe: true,
    canPublishData,
  })

  return ok({
    token,
    url: process.env.LIVEKIT_URL || "wss://sankalp.livekit.cloud", // placeholder WS URL
    livekitRoom: room.livekitRoom,
    identity,
    wsUrl: process.env.LIVEKIT_URL || "wss://sankalp.livekit.cloud",
  })
}

// Minimal LiveKit-compatible JWT (HS256). Matches the `AccessToken` shape
// the livekit-server-sdk produces, so the Android client can use the real SDK.
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
