import { NextRequest } from "next/server"
import { ok, unauthorized, getAuth } from "@/lib/api"
import { getEntitlement, entitlementToResponse } from "@/lib/entitlement"

// GET /api/entitlement
// Returns the server-authoritative free live-room entitlement for the authed
// user. This is the SINGLE source of truth the client uses to render the
// countdown, the 5-minute warning, the exhausted purchase screen, and the
// join-room gate. The server NEVER accepts these values back as authoritative
// input — they are display-only.
//
// Response shape (see entitlementToResponse):
// {
//   canJoinLiveRoom: boolean,
//   isPaid: boolean,
//   remainingFreeSeconds: number,   // 0 when paid (unlimited; no countdown)
//   consumedFreeSeconds: number,
//   allowanceSeconds: number,       // 1800 (30 min)
//   windowStartedAt: ISO,
//   windowResetsAt: ISO,            // windowStartedAt + 34h
//   hasActiveSession: boolean,
//   activeSessionId: string | null,
//   activeRoomId: string | null,
//   warningShown: boolean
// }
export async function GET(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const ent = await getEntitlement(ctx.userId)
  return ok(entitlementToResponse(ent))
}
