// Scans the in-memory presence store for all active participants across all rooms.
// Used by /api/friends/online to show which friends are currently studying.
// Production: Redis SCAN over presence keys.

import { listParticipants } from "@/lib/presence"

// We need to enumerate all known room IDs. The presence module keeps rooms in a
// private Map; we expose a helper here to list all room IDs without breaking
// encapsulation elsewhere.

// Re-implemented lightweight scan: presence.ts doesn't export the rooms Map,
// so we add a small extension here that tracks known room IDs as rooms are touched.
// To keep it simple and correct, we read from a parallel set maintained by
// joinRoom/listParticipants calls — but since those are internal, we instead
// rely on a registry of recently-seen room IDs persisted by the rooms API.

// Simpler approach: query the DB for all live rooms and check presence for each.
// This is acceptable for the sandbox (low room count). Production uses Redis.
import { db } from "@/lib/db"

export async function listAllPresence(): Promise<{ userId: string; roomId: string }[]> {
  const liveRooms = await db.room.findMany({ where: { isLive: true }, select: { id: true } })
  const out: { userId: string; roomId: string }[] = []
  for (const r of liveRooms) {
    const participants = listParticipants(r.id)
    for (const p of participants) {
      // Only count participants with a recent heartbeat (last 60s)
      if (Date.now() - p.lastSeenAt < 60_000) {
        out.push({ userId: p.userId, roomId: r.id })
      }
    }
  }
  return out
}
