import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, notFound, forbidden, getAuth } from "@/lib/api"
import { heartbeatLiveRoomSession, getEntitlement, entitlementToResponse, closeActiveLiveRoomSession } from "@/lib/entitlement"

// POST /api/rooms/[id]/heartbeat
// Called by the client every ~20s while connected to a live room. The server:
//   1. Updates lastHeartbeatAt (used to cap runaway live-elapsed after a drop).
//   2. Recomputes the entitlement (server-authoritative remaining seconds).
//   3. If the free allowance is EXHAUSTED (remaining <= 0), the server closes
//      the active session (accrues final time) and returns exhausted=true so
//      the client disconnects from LiveKit and shows the purchase screen.
//      This is the server-side enforcement that closes the room at 00:00 — the
//      client cannot stay past 30 minutes even if it manipulates its timer.
//
// Token requests do NOT replenish free time. This heartbeat does NOT add time
// either; it only accrues when the session closes. The live-elapsed is
// computed from the server clock, not from any client-supplied value.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const { id } = await params

  // Confirm the room exists (lightweight check).
  const room = await db.room.findUnique({ where: { id }, select: { id: true } })
  if (!room) return notFound("Room not found")

  // Update the heartbeat timestamp.
  await heartbeatLiveRoomSession(ctx.userId)

  // Recompute entitlement.
  const ent = await getEntitlement(ctx.userId)

  // ── Server-side exhaustion: if free and remaining <= 0, close the session ──
  // The client must disconnect from LiveKit on exhausted=true. Even if it
  // doesn't, the next /presence or /token call will refuse. This is the
  // authoritative "00:00 closes the room" enforcement.
  if (!ent.isPaid && ent.remainingFreeSeconds <= 0 && ent.hasActiveSession) {
    await closeActiveLiveRoomSession(ctx.userId)
    const refreshed = await getEntitlement(ctx.userId)
    return ok({
      ...entitlementToResponse(refreshed),
      exhausted: true,
      reason: "FREE_ALLOWANCE_EXHAUSTED",
    })
  }

  return ok({
    ...entitlementToResponse(ent),
    exhausted: false,
  })
}
