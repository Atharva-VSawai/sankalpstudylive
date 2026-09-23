import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, getAuth } from "@/lib/api"

// GET /api/friends/online
// Returns the set of friend userIds who are currently active in any room,
// based on the in-memory presence store. (Production: Redis presence scan.)
export async function GET(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()

  const rels = await db.friendship.findMany({
    where: { status: "accepted", OR: [{ fromUserId: ctx.userId }, { toUserId: ctx.userId }] },
    select: { fromUserId: true, toUserId: true },
  })
  const friendIds = new Set(rels.map((r) => (r.fromUserId === ctx.userId ? r.toUserId : r.fromUserId)))

  // Scan the in-memory presence store for active room members.
  const { listAllPresence } = await import("@/lib/presence-store")
  const online = await listAllPresence() // { userId, roomId }[]
  const onlineFriendIds = online.filter((p) => friendIds.has(p.userId)).map((p) => p.userId)

  // Hydrate with profile + room info
  const profiles = await db.profile.findMany({
    where: { userId: { in: onlineFriendIds } },
    select: { userId: true, username: true, displayName: true, avatarUrl: true, examGoal: true, level: true },
  })
  const rooms = await db.room.findMany({
    where: { id: { in: online.map((p) => p.roomId) } },
    select: { id: true, name: true, isLive: true },
  })
  const roomMap = new Map(rooms.map((r) => [r.id, r]))
  const onlineMap = new Map(online.map((p) => [p.userId, p]))

  const result = profiles.map((p) => {
    const presence = onlineMap.get(p.userId)
    const room = presence ? roomMap.get(presence.roomId) : null
    return {
      ...p,
      roomId: presence?.roomId ?? null,
      roomName: room?.name ?? null,
      roomIsLive: room?.isLive ?? false,
    }
  })
  return ok({ online: result })
}
