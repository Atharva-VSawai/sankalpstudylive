import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, badRequest, getAuth } from "@/lib/api"
import { createSubscription } from "@/lib/razorpay"
import { rateLimit } from "@/lib/ratelimit"

// POST /api/payments/razorpay/subscription
// Creates a Razorpay Subscription for the ₹179/month recurring plan.
// Uses RAZORPAY_MONTHLY_PLAN_ID from environment.
export async function POST(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()

  const rl = rateLimit(req, { limit: 5, windowMs: 60000, key: "rzp-sub" })
  if (!rl.ok) return badRequest("Too many requests.", "RATE_LIMITED")

  const planId = process.env.RAZORPAY_MONTHLY_PLAN_ID
  if (!planId) {
    return badRequest("Monthly subscription plan not configured. Contact support.", "PLAN_NOT_CONFIGURED")
  }

  // Check if user already has an active monthly subscription
  const existing = await db.subscription.findUnique({ where: { userId: ctx.userId } })
  if (existing && existing.plan === "monthly" && existing.status === "active") {
    return badRequest("You already have an active monthly subscription", "ALREADY_SUBSCRIBED")
  }

  // Create a Payment record (pending)
  const payment = await db.payment.create({
    data: {
      userId: ctx.userId,
      amount: 17900, // ₹179 = 17900 paise — server determines
      currency: "INR",
      plan: "monthly",
      provider: "razorpay",
      status: "pending",
    },
  })

  try {
    const sub = await createSubscription(planId, ctx.userId)

    // Store the Razorpay subscription ID
    await db.payment.update({
      where: { id: payment.id },
      data: {
        razorpaySubscriptionId: sub.subscriptionId,
        razorpayOrderId: sub.subscriptionId, // subscription ID serves as the reference
      },
    })

    // Update the Subscription record to pending
    await db.subscription.upsert({
      where: { userId: ctx.userId },
      create: {
        userId: ctx.userId,
        plan: "monthly",
        status: "pending",
        razorpaySubscriptionId: sub.subscriptionId,
      },
      update: {
        plan: "monthly",
        status: "pending",
        razorpaySubscriptionId: sub.subscriptionId,
      },
    })

    // Return ONLY safe information for Razorpay Checkout
    return ok({
      keyId: process.env.RAZORPAY_KEY_ID,
      subscriptionId: sub.subscriptionId,
      status: sub.status,
      paymentId: payment.id,
    })
  } catch (error: any) {
    await db.payment.update({
      where: { id: payment.id },
      data: { status: "failed", failureReason: "subscription_creation_failed" },
    })
    console.error("[payment] subscription creation error:", error.message)
    return badRequest("Failed to create subscription. Please try again.", "SUBSCRIPTION_FAILED")
  }
}
