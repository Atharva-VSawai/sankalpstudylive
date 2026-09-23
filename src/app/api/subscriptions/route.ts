import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, badRequest, getAuth } from "@/lib/api"
import {
  PLANS, PlanId, isValidPlan, isPaidPlanActive, computeExpiry, computeRenewal,
  FREE_ALLOWANCE_MIN,
} from "@/lib/pricing"

// GET /api/subscriptions — current user's subscription + free-room usage
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
    subscription: sub ?? { plan: "free", status: "active", expiresAt: null, renewsAt: null },
    // convenience fields for the client
    hasPaidAccess: paid,
    planName: sub ? PLANS[sub.plan as PlanId]?.name ?? "Free" : "Free",
    planExpiresAt: sub?.expiresAt ?? null,
    roomMinutesUsed,
    freeAllowanceMin: FREE_ALLOWANCE_MIN,
    remainingFreeMin: paid ? null : remainingFreeMin, // null when paid (unlimited)
  })
}

// POST /api/subscriptions — purchase/activate a plan
// Body: { plan: "focus_pass" | "monthly" | "halfyear" | "yearly" }
// In production: this creates a Payment with status "pending", returns the
// provider order_id, and the client completes the payment on the provider's
// checkout page. The provider webhook calls a separate endpoint to confirm.
// In the sandbox: we simulate the provider confirming immediately.
export async function POST(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const body = await req.json().catch(() => ({}))
  const plan = String(body?.plan || "")

  if (!isValidPlan(plan)) return badRequest("Invalid plan")
  if (plan === "free") return badRequest("Cannot purchase the free plan")

  // ── Server-side check: block if user already has an active paid plan ──
  const existingSub = await db.subscription.findUnique({ where: { userId: ctx.userId } })
  if (isPaidPlanActive(existingSub)) {
    const expiresAt = existingSub?.expiresAt ? new Date(existingSub.expiresAt).toLocaleDateString("en-IN", { month: "short", day: "numeric" }) : "—"
    return ok({ error: { code: "ACTIVE_PLAN_EXISTS", message: `Your ${existingSub?.plan ?? "plan"} is active until ${expiresAt}. You can purchase another plan after that.` } }, 403) as any
  }

  const planDef = PLANS[plan as PlanId]
  const expiresAt = computeExpiry(plan as PlanId)
  const renewsAt = computeRenewal(plan as PlanId)

  // ── Create a Payment record (pending initially) ──
  const payment = await db.payment.create({
    data: {
      userId: ctx.userId,
      amount: planDef.price,
      currency: "INR",
      plan,
      provider: "razorpay",
      status: "pending",
    },
  })

  // ── SANDBOX: simulate provider confirmation ──
  // PRODUCTION: the client redirects to Razorpay checkout, Razorpay calls
  // our webhook (/api/payments/verify), which verifies the signature and
  // marks the payment as "captured" + activates the subscription.
  // Here we skip the checkout and mark as captured immediately.
  await db.payment.update({
    where: { id: payment.id },
    data: { status: "captured", entitlementStart: new Date(), entitlementEnd: expiresAt },
  })

  // ── Activate the subscription (server-side) ──
  const sub = await db.subscription.upsert({
    where: { userId: ctx.userId },
    create: {
      userId: ctx.userId,
      plan,
      status: "active",
      startedAt: new Date(),
      expiresAt,
      renewsAt,
    },
    update: {
      plan,
      status: "active",
      startedAt: new Date(),
      expiresAt,
      renewsAt,
    },
  })

  return ok({
    subscription: sub,
    payment: { id: payment.id, status: "paid", amount: planDef.price, plan },
  })
}
