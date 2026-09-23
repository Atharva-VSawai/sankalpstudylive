import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, badRequest, getAuth } from "@/lib/api"
import { verifyPaymentSignature, fetchPayment, fetchOrder } from "@/lib/razorpay"
import { PLANS, PlanId, computeExpiry } from "@/lib/pricing"
import { rateLimit } from "@/lib/ratelimit"

// POST /api/payments/razorpay/verify
// Verifies a one-time payment (Focus Pass, 6-Month, Yearly) after Razorpay Checkout.
// Server-side signature verification + payment status verification + entitlement activation.
// IDEMPOTENT: calling twice returns the existing entitlement.
export async function POST(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()

  const rl = rateLimit(req, { limit: 10, windowMs: 60000, key: "rzp-verify" })
  if (!rl.ok) return badRequest("Too many requests.", "RATE_LIMITED")

  const body = await req.json().catch(() => ({}))
  const razorpayOrderId = String(body?.razorpay_order_id || "")
  const razorpayPaymentId = String(body?.razorpay_payment_id || "")
  const razorpaySignature = String(body?.razorpay_signature || "")

  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
    return badRequest("Missing Razorpay payment fields", "MISSING_FIELDS")
  }

  // ── 1. Find the internal payment record by order ID ──
  const payment = await db.payment.findUnique({
    where: { razorpayOrderId },
  })
  if (!payment) {
    return badRequest("Payment record not found for this order", "PAYMENT_NOT_FOUND")
  }

  // ── 2. Verify the payment belongs to the authenticated user ──
  if (payment.userId !== ctx.userId) {
    return badRequest("This payment does not belong to your account", "PAYMENT_OWNERSHIP_MISMATCH")
  }

  // ── 3. IDEMPOTENCY: if already captured, return existing entitlement ──
  if (payment.status === "captured") {
    const sub = await db.subscription.findUnique({ where: { userId: ctx.userId } })
    return ok({
      verified: true,
      alreadyProcessed: true,
      plan: payment.plan,
      entitlementEnd: sub?.expiresAt ?? payment.entitlementEnd,
    })
  }

  // ── 4. Verify the Razorpay signature (HMAC-SHA256) ──
  const signatureValid = verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)
  if (!signatureValid) {
    await db.payment.update({
      where: { id: payment.id },
      data: { status: "failed", failureReason: "signature_verification_failed" },
    })
    return badRequest("Payment signature verification failed", "SIGNATURE_INVALID")
  }

  // ── 5. Verify payment status from Razorpay server-side ──
  try {
    const [rzpPayment, rzpOrder] = await Promise.all([
      fetchPayment(razorpayPaymentId),
      fetchOrder(razorpayOrderId),
    ])

    // Verify amount matches
    if (rzpOrder.amount !== payment.amount) {
      await db.payment.update({
        where: { id: payment.id },
        data: { status: "failed", failureReason: "amount_mismatch" },
      })
      return badRequest("Payment amount mismatch", "AMOUNT_MISMATCH")
    }

    // Verify currency
    if (rzpOrder.currency !== "INR") {
      return badRequest("Invalid currency", "CURRENCY_MISMATCH")
    }

    // Verify payment status is captured
    if (rzpPayment.status !== "captured") {
      await db.payment.update({
        where: { id: payment.id },
        data: { status: rzpPayment.status === "authorized" ? "authorized" : "failed" },
      })
      return ok({ verified: false, status: rzpPayment.status, message: "Payment not yet captured" })
    }

    // ── 6. All checks passed — activate entitlement (transactional) ──
    const planId = payment.plan as PlanId
    const planDef = PLANS[planId]
    const now = new Date()

    // Check if user already has an active paid entitlement — extend from current expiry
    const existingSub = await db.subscription.findUnique({ where: { userId: ctx.userId } })
    let expiresAt: Date

    if (existingSub && existingSub.expiresAt && new Date(existingSub.expiresAt) > now) {
      // Extend from current expiry
      expiresAt = new Date(existingSub.expiresAt.getTime() + planDef.durationMs)
    } else {
      // New entitlement from now
      expiresAt = computeExpiry(planId)!
    }

    // Update payment record
    await db.payment.update({
      where: { id: payment.id },
      data: {
        status: "captured",
        razorpayPaymentId,
        entitlementStart: now,
        entitlementEnd: expiresAt,
      },
    })

    // Update subscription
    await db.subscription.upsert({
      where: { userId: ctx.userId },
      create: {
        userId: ctx.userId,
        plan: planId,
        status: "active",
        startedAt: now,
        expiresAt,
      },
      update: {
        plan: planId,
        status: "active",
        startedAt: now,
        expiresAt,
      },
    })

    // Audit log
    await db.auditLog.create({
      data: {
        actorId: ctx.userId,
        action: "PAYMENT_VERIFIED",
        targetType: "payment",
        targetId: payment.id,
        metadata: JSON.stringify({ plan: planId, amount: payment.amount, orderId: razorpayOrderId }),
      },
    })

    return ok({
      verified: true,
      plan: planId,
      entitlementStart: now,
      entitlementEnd: expiresAt,
    })
  } catch (error: any) {
    console.error("[payment] verification error:", error.message)
    return badRequest("Payment verification failed. Please contact support.", "VERIFICATION_ERROR")
  }
}
