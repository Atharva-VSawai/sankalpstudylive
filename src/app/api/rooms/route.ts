import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, badRequest, forbidden, getAuth } from "@/lib/api"
import { randomBytes } from "crypto"
import { communityOrderIndex } from "@/lib/community-order"

// GET /api/rooms — discover live + listed rooms
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const communityId = url.searchParams.get("communityId")
  const onlyLive = url.searchParams.get("live") === "true"
  const q = url.searchParams.get("q")?.toLowerCase()
  const page = Math.max(1, Number(url.searchParams.get("page") || 1))
  const limit = Math.min(40, Math.max(1, Number(url.searchParams.get("limit") || 20)))

  // Public discovery: only show DEFAULT (official) and CUSTOM (user-created) rooms.
  // TEST rooms are excluded from public discovery.
  const where: any = { isListed: true, roomType: { not: "TEST" } }
  if (communityId) where.communityId = communityId
  if (onlyLive) where.isLive = true
  if (q) where.name = { contains: q }

  const [rooms, total] = await Promise.all([
    db.room.findMany({
      where,
      orderBy: [{ isLive: "desc" }, { participantCount: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * limit,
      take: limit,
      include: { community: true, owner: { include: { profile: true } } },
    }),
    db.room.count({ where }),
  ])

  const mappedRooms = rooms.map((r) => ({
      id: r.id,
      name: r.name,
      description: r.description,
      isLive: r.isLive,
      isPrivate: r.isPrivate,
      isDefaultRoom: r.isDefaultRoom,
      roomType: r.roomType,
      focusMode: r.focusMode,
      participantCount: r.participantCount,
      tags: safeParse(r.tags),
      startedAt: r.startedAt,
      community: r.community ? { slug: r.community.slug, name: r.community.name, color: r.community.color } : null,
      owner: {
        id: r.owner.id,
        username: r.owner.profile?.username ?? null,
        displayName: r.owner.profile?.displayName ?? null,
        avatarUrl: r.owner.profile?.avatarUrl ?? null,
      },
    })).sort((a, b) => {
      const communityRank = communityOrderIndex(a.community?.slug) - communityOrderIndex(b.community?.slug)
      if (communityRank !== 0) return communityRank
      if (a.isLive !== b.isLive) return a.isLive ? -1 : 1
      if (a.participantCount !== b.participantCount) return b.participantCount - a.participantCount
      return new Date(b.startedAt ?? 0).getTime() - new Date(a.startedAt ?? 0).getTime()
    })

  return ok({
    rooms: mappedRooms,
    page,
    limit,
    total,
  })
}

// POST /api/rooms — create a new room
export async function POST(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const profile = await db.profile.findUnique({ where: { userId: ctx.userId }, select: { onboardingComplete: true } })
  if (!profile?.onboardingComplete) return forbidden("Complete onboarding before creating rooms.", "ONBOARDING_REQUIRED")
  const body = await req.json().catch(() => null)
  const name = String(body?.name || "").trim()
  const description = body?.description ? String(body.description) : null
  const communitySlug = body?.communitySlug ? String(body.communitySlug) : null
  const isPrivate = Boolean(body?.isPrivate)
  const maxParticipants = Math.min(500, Math.max(2, Number(body?.maxParticipants || 500)))
  const focusMode = body?.focusMode !== false
  const tags = Array.isArray(body?.tags) ? body.tags.map(String).slice(0, 6) : []
  const pomodoroConfig = {
    focusMin: Number(body?.pomodoroConfig?.focusMin || 25),
    breakMin: Number(body?.pomodoroConfig?.breakMin || 5),
    longBreakMin: Number(body?.pomodoroConfig?.longBreakMin || 15),
    rounds: Number(body?.pomodoroConfig?.rounds || 4),
  }

  if (!name || name.length < 3) return badRequest("Room name must be at least 3 characters")
  if (name.length > 80) return badRequest("Room name must be under 80 characters")

  let communityId: string | null = null
  const targetCommunitySlug = communitySlug || "general"
  const community = await db.community.findUnique({ where: { slug: targetCommunitySlug } })
  if (!community) return badRequest("Unknown community")
  if (targetCommunitySlug !== "general") {
    const membership = await db.communityMember.findUnique({
      where: { communityId_userId: { communityId: community.id, userId: ctx.userId } },
      select: { id: true },
    })
    if (!membership) return forbidden("Join this community before creating a room for it.", "NOT_MEMBER")
  }
  communityId = community.id

  const livekitRoom = `sankalp-${randomBytes(6).toString("hex")}`
  const room = await db.room.create({
    data: {
      name,
      description,
      ownerId: ctx.userId,
      communityId,
      livekitRoom,
      isLive: true,
      isListed: !isPrivate,
      isPrivate,
      isDefaultRoom: false,
      roomType: "CUSTOM",
      maxParticipants,
      focusMode,
      pomodoroConfig: JSON.stringify(pomodoroConfig),
      tags: JSON.stringify(tags),
      startedAt: new Date(),
    },
    include: { community: true, owner: { include: { profile: true } } },
  })

  // Make the owner a host member of the room
  await db.roomMember.create({
    data: { roomId: room.id, userId: ctx.userId, role: "host", muted: true, cameraOff: true },
  })
  await db.room.update({ where: { id: room.id }, data: { participantCount: 1 } })

  return ok({
    room: {
      id: room.id,
      name: room.name,
      description: room.description,
      isLive: room.isLive,
      isPrivate: room.isPrivate,
      isDefaultRoom: room.isDefaultRoom,
      focusMode: room.focusMode,
      participantCount: 1,
      pomodoroConfig,
      tags,
      livekitRoom: room.livekitRoom,
      community: room.community ? { slug: room.community.slug, name: room.community.name, color: room.community.color } : null,
      owner: {
        id: room.owner.id,
        username: room.owner.profile?.username ?? null,
        displayName: room.owner.profile?.displayName ?? null,
        avatarUrl: room.owner.profile?.avatarUrl ?? null,
      },
    },
  })
}

function safeParse(s: string) {
  try { return JSON.parse(s) } catch { return [] }
}
