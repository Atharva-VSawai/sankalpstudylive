import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, getAuth } from "@/lib/api"
import { PLANS, PlanId } from "@/lib/pricing"
import { getEntitlement } from "@/lib/entitlement"

// GET /api/rooms/usage
// Returns the user's current room-access status. Server-authoritative.
// Used by the dashboard + room view + paywall to show status.
//
// Now backed by the global free-allowance engine (30 min / rolling 24h).
// Backward-compatible fields (roomMinutesUsed, freeAllowanceMin,
// remainingFreeMin) are derived from the new entitlement for any code that
// still reads them, but the canonical fields are the *Seconds / window ones.
export async function GET(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const [sub, ent] = await Promise.all([
    db.subscription.findUnique({ where: { userId: ctx.userId } }),
    getEntitlement(ctx.userId),
  ])

  const paid = ent.isPaid
  // Backward-compat: derive minute fields from seconds for any old client code.
  const remainingFreeMin = paid ? null : Math.ceil(ent.remainingFreeSeconds / 60)
  const consumedMin = Math.floor(ent.consumedFreeSeconds / 60)
  // Legacy "roomMinutesUsed" — now reflects current-window consumption, not lifetime.
  const roomMinutesUsed = paid ? 0 : consumedMin

  return ok({
    hasPaidAccess: paid,
    plan: sub?.plan ?? "free",
    planName: sub ? (PLANS[sub.plan as PlanId]?.name ?? "Free") : "Free",
    planStatus: sub?.status ?? "active",
    planExpiresAt: sub?.expiresAt ?? null,
    planStartedAt: sub?.startedAt ?? null,
    // Canonical, server-authoritative fields:
    isPaid: paid,
    canJoinLiveRoom: ent.canJoinLiveRoom,
    remainingFreeSeconds: paid ? 0 : ent.remainingFreeSeconds,
    consumedFreeSeconds: paid ? 0 : ent.consumedFreeSeconds,
    allowanceSeconds: ent.allowanceSeconds,
    windowStartedAt: ent.windowStartedAt.toISOString(),
    windowResetsAt: ent.windowResetsAt.toISOString(),
    hasActiveSession: ent.hasActiveSession,
    // Backward-compat (minute-resolution) fields:
    roomMinutesUsed,
    freeAllowanceMin: Math.ceil(ent.allowanceSeconds / 60),
    remainingFreeMin,
  })
}
