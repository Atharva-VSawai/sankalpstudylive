import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, badRequest, getAuth } from "@/lib/api"
import { createOrder } from "@/lib/razorpay"
import { PLANS, PlanId } from "@/lib/pricing"
import { rateLimit } from "@/lib/ratelimit"

// POST /api/payments/razorpay/order
// Creates a one-time Razorpay Order for ₹14 Focus Pass, ₹699 6-Month, ₹999 Yearly.
// The server determines the amount — the client only sends { planCode }.
// Returns { keyId, orderId, amount, currency, planCode } for Razorpay Checkout.
export async function POST(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()

  // Rate limit: 5 order creations per minute
  const rl = rateLimit(req, { limit: 5, windowMs: 60000, key: "rzp-order" })
  if (!rl.ok) return badRequest("Too many requests. Please wait a moment.", "RATE_LIMITED")

  const body = await req.json().catch(() => ({}))
  const planCode = String(body?.planCode || "").toUpperCase()

  // Validate plan — only one-time plans use order creation
  // Monthly uses a separate subscription endpoint
  const VALID_ONE_TIME_PLANS = ["FOCUS_PASS", "SIX_MONTH", "YEARLY"]
  if (!VALID_ONE_TIME_PLANS.includes(planCode)) {
    return badRequest("Invalid plan code. Use FOCUS_PASS, SIX_MONTH, or YEARLY.", "INVALID_PLAN")
  }

  // Map plan code to our plan ID
  const planMap: Record<string, PlanId> = {
    FOCUS_PASS: "focus_pass",
    SIX_MONTH: "halfyear",
    YEARLY: "yearly",
  }
  const planId = planMap[planCode]
  const planDef = PLANS[planId]

  // Server determines the amount — never trust client
  const amountPaise = planDef.price

  // Create a Payment record (pending) BEFORE creating the Razorpay order
  const receipt = `sankalp_${planId}_${ctx.userId.slice(0, 8)}_${Date.now()}`
  const payment = await db.payment.create({
    data: {
      userId: ctx.userId,
      amount: amountPaise,
      currency: "INR",
      plan: planId,
      provider: "razorpay",
      status: "pending",
    },
  })

  try {
    // Create the Razorpay order server-side
    const order = await createOrder(amountPaise, planCode, receipt)

    // Store the Razorpay order ID on the payment record
    await db.payment.update({
      where: { id: payment.id },
      data: { razorpayOrderId: order.orderId },
    })

    // Return ONLY safe information to the client
    // Key ID is safe for Razorpay Checkout; Key Secret is NEVER returned
    return ok({
      keyId: process.env.RAZORPAY_KEY_ID,
      orderId: order.orderId,
      amount: order.amount,
      currency: order.currency,
      planCode,
      paymentId: payment.id, // internal payment ID for reference
    })
  } catch (error: any) {
    // Mark payment as failed if order creation fails
    await db.payment.update({
      where: { id: payment.id },
      data: { status: "failed", failureReason: "order_creation_failed" },
    })
    console.error("[payment] order creation error:", error.message)
    return badRequest("Failed to create payment order. Please try again.", "ORDER_CREATION_FAILED")
  }
}
