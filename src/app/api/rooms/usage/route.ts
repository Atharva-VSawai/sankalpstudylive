import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, getAuth } from "@/lib/api"
import { isPaidPlanActive, FREE_ALLOWANCE_MIN, PLANS, PlanId } from "@/lib/pricing"

// GET /api/rooms/usage
// Returns the user's current room-access status:
//   - hasPaidAccess: true if an active paid plan
//   - planName, planExpiresAt
//   - roomMinutesUsed, freeAllowanceMin, remainingFreeMin
// Used by the dashboard + room view + paywall to show status.
export async function GET(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const [sub, profile] = await Promise.all([
    db.subscription.findUnique({ where: { userId: ctx.userId } }),
    db.profile.findUnique({ where: { userId: ctx.userId }, select: { roomMinutesUsed: true } }),
  ])

  const paid = isPaidPlanActive(sub)
  const roomMinutesUsed = profile?.roomMinutesUsed ?? 0
  const remainingFreeMin = Math.max(0, FREE_ALLOWANCE_MIN - roomMinutesUsed)

  return ok({
    hasPaidAccess: paid,
    plan: sub?.plan ?? "free",
    planName: sub ? (PLANS[sub.plan as PlanId]?.name ?? "Free") : "Free",
    planStatus: sub?.status ?? "active",
    planExpiresAt: sub?.expiresAt ?? null,
    planStartedAt: sub?.startedAt ?? null,
    roomMinutesUsed,
    freeAllowanceMin: FREE_ALLOWANCE_MIN,
    remainingFreeMin: paid ? null : remainingFreeMin,
  })
}
