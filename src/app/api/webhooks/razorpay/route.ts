import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { verifyWebhookSignature } from "@/lib/razorpay"
import { PLANS, PlanId } from "@/lib/pricing"
import { scheduleFreeAllowanceAfterPaidPlan } from "@/lib/entitlement"

// POST /api/webhooks/razorpay
// Razorpay webhook handler. No user auth — verifies X-Razorpay-Signature
// against the RAW request body using RAZORPAY_WEBHOOK_SECRET.
// IDEMPOTENT: processes each webhook event only once.
export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-razorpay-signature") || ""
  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 })
  }

  // ── Get the RAW body (not parsed JSON) for signature verification ──
  const rawBody = await req.text()

  // ── Verify webhook signature against raw body ──
  const valid = verifyWebhookSignature(rawBody, signature)
  if (!valid) {
    console.error("[webhook] signature verification failed")
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 })
  }

  // Now parse the JSON body
  let payload: any
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  const event = payload.event
  const webhookEventId = payload.event_id || `${event}_${Date.now()}`

  // ── IDEMPOTENCY: check if this event was already processed ──
  const existing = await db.payment.findFirst({
    where: { webhookEventId },
    select: { id: true },
  })
  if (existing) {
    // Already processed — return success (Razorpay expects 200 to stop retrying)
    return NextResponse.json({ processed: true, duplicate: true })
  }

  console.log(`[webhook] processing event: ${event} (id: ${webhookEventId})`)

  // ── Handle one-time payment events ──
  if (event === "payment.captured" || event === "payment.authorized") {
    const paymentData = payload.payload?.payment?.entity
    if (!paymentData) return NextResponse.json({ error: "No payment data" }, { status: 400 })

    const orderId = paymentData.order_id
    const paymentId = paymentData.id

    // Find internal payment by order ID
    const internalPayment = await db.payment.findUnique({
      where: { razorpayOrderId: orderId },
    })
    if (!internalPayment) {
      console.error(`[webhook] no internal payment for order: ${orderId}`)
      return NextResponse.json({ error: "Payment not found" }, { status: 404 })
    }

    // IDEMPOTENCY: if already captured, skip
    if (internalPayment.status === "captured") {
      return NextResponse.json({ processed: true, duplicate: true })
    }

    // Verify amount matches
    if (paymentData.amount !== internalPayment.amount) {
      console.error(`[webhook] amount mismatch: expected ${internalPayment.amount}, got ${paymentData.amount}`)
      return NextResponse.json({ error: "Amount mismatch" }, { status: 400 })
    }

    // Activate entitlement
    const planId = internalPayment.plan as PlanId
    const planDef = PLANS[planId]
    const now = new Date()
    const existingSub = await db.subscription.findUnique({ where: { userId: internalPayment.userId } })
    let expiresAt: Date
    if (existingSub && existingSub.expiresAt && new Date(existingSub.expiresAt) > now) {
      expiresAt = new Date(existingSub.expiresAt.getTime() + planDef.durationMs)
    } else {
      expiresAt = new Date(now.getTime() + planDef.durationMs)
    }

    await db.payment.update({
      where: { id: internalPayment.id },
      data: {
        status: "captured",
        razorpayPaymentId: paymentId,
        webhookEventId,
        entitlementStart: now,
        entitlementEnd: expiresAt,
      },
    })

    await db.subscription.upsert({
      where: { userId: internalPayment.userId },
      create: {
        userId: internalPayment.userId,
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

    if (planId === "focus_pass") {
      await scheduleFreeAllowanceAfterPaidPlan(internalPayment.userId, expiresAt)
    }

    await db.auditLog.create({
      data: {
        actorId: null,
        action: "WEBHOOK_PAYMENT_CAPTURED",
        targetType: "payment",
        targetId: internalPayment.id,
        metadata: JSON.stringify({ event, orderId, paymentId }),
      },
    })

    console.log(`[webhook] payment captured: plan=${planId}, user=${internalPayment.userId}`)
  }

  // ── Handle subscription events ──
  if (event === "subscription.activated" || event === "subscription.charged") {
    const subData = payload.payload?.subscription?.entity
    if (!subData) return NextResponse.json({ error: "No subscription data" }, { status: 400 })

    const razorpaySubId = subData.id
    let internalSub = await db.subscription.findFirst({
      where: { razorpaySubscriptionId: razorpaySubId },
    })
    // A pending recurring checkout must not overwrite an active one-time
    // entitlement. In that case the Razorpay ID lives on Payment until the
    // provider confirms it, so resolve the user's existing subscription via
    // the payment row and activate it only now.
    if (!internalSub) {
      const pendingPayment = await db.payment.findFirst({
        where: { razorpaySubscriptionId: razorpaySubId },
        select: { userId: true },
      })
      if (pendingPayment) {
        internalSub = await db.subscription.findUnique({ where: { userId: pendingPayment.userId } })
      }
    }
    if (!internalSub) {
      console.error(`[webhook] no internal subscription for: ${razorpaySubId}`)
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 })
    }

    // For subscription.charged, extend the expiry
    const now = new Date()
    const expiresAt = new Date(now.getTime() + 30 * 86400_000) // 30 days from charge

    await db.subscription.update({
      where: { id: internalSub.id },
      data: {
        status: "active",
        expiresAt,
        renewsAt: expiresAt,
        razorpaySubscriptionId: razorpaySubId,
      },
    })

    // Mark the webhook event on a payment record if available
    const payment = await db.payment.findFirst({
      where: { razorpaySubscriptionId: razorpaySubId },
    })
    if (payment) {
      await db.payment.update({
        where: { id: payment.id },
        data: { webhookEventId, status: "captured" },
      })
    }

    await db.auditLog.create({
      data: {
        actorId: null,
        action: "WEBHOOK_SUBSCRIPTION_ACTIVATED",
        targetType: "subscription",
        targetId: internalSub.id,
        metadata: JSON.stringify({ event, subscriptionId: razorpaySubId }),
      },
    })

    console.log(`[webhook] subscription activated: ${razorpaySubId}`)
  }

  if (event === "subscription.cancelled" || event === "subscription.halted" || event === "subscription.expired") {
    const subData = payload.payload?.subscription?.entity
    if (!subData) return NextResponse.json({ error: "No subscription data" }, { status: 400 })

    const razorpaySubId = subData.id
    const internalSub = await db.subscription.findFirst({
      where: { razorpaySubscriptionId: razorpaySubId },
    })
    if (!internalSub) {
      // A checkout can be canceled while another plan is still active; there
      // is no subscription-row mutation to perform in that case. The payment
      // row is still enough to make this webhook idempotently successful.
      const payment = await db.payment.findFirst({
        where: { razorpaySubscriptionId: razorpaySubId },
        select: { id: true },
      })
      if (payment) {
        await db.payment.update({ where: { id: payment.id }, data: { webhookEventId } })
        return NextResponse.json({ processed: true })
      }
      return NextResponse.json({ error: "Subscription not found" }, { status: 404 })
    }

    // Mark subscription as expired/canceled but keep the paid-through date
    const newStatus = event === "subscription.cancelled" ? "canceled" : event === "subscription.expired" ? "expired" : "halted"
    await db.subscription.update({
      where: { id: internalSub.id },
      data: { status: newStatus },
    })

    await db.auditLog.create({
      data: {
        actorId: null,
        action: `WEBHOOK_${event.toUpperCase()}`,
        targetType: "subscription",
        targetId: internalSub.id,
        metadata: JSON.stringify({ event, subscriptionId: razorpaySubId }),
      },
    })

    console.log(`[webhook] subscription ${event}: ${razorpaySubId}`)
  }

  return NextResponse.json({ processed: true })
}
