// Server-side Razorpay integration.
// Key Secret and Webhook Secret are NEVER exposed to the client.
// Only the Key ID is returned to the client for Razorpay Checkout.

import { createHmac } from "crypto"

const RAZORPAY_BASE = "https://api.razorpay.com/v1"

function getKeyId(): string {
  const key = process.env.RAZORPAY_KEY_ID
  if (!key) throw new Error("RAZORPAY_KEY_ID not configured")
  return key
}

function getKeySecret(): string {
  const secret = process.env.RAZORPAY_KEY_SECRET
  if (!secret) throw new Error("RAZORPAY_KEY_SECRET not configured")
  return secret
}

function getAuthHeader(): string {
  return "Basic " + Buffer.from(`${getKeyId()}:${getKeySecret()}`).toString("base64")
}

// ── Create a one-time Razorpay Order ──
export async function createOrder(amountPaise: number, planCode: string, receipt: string): Promise<{
  orderId: string
  amount: number
  currency: string
}> {
  const res = await fetch(`${RAZORPAY_BASE}/orders`, {
    method: "POST",
    headers: {
      "Authorization": getAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: amountPaise,
      currency: "INR",
      receipt,
      notes: { plan: planCode },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error("[razorpay] order creation failed:", err)
    throw new Error("Failed to create Razorpay order")
  }

  const data = await res.json()
  return {
    orderId: data.id,
    amount: data.amount,
    currency: data.currency,
  }
}

// ── Create a Razorpay Subscription (for monthly recurring) ──
export async function createSubscription(planId: string, userId: string): Promise<{
  subscriptionId: string
  status: string
}> {
  const res = await fetch(`${RAZORPAY_BASE}/subscriptions`, {
    method: "POST",
    headers: {
      "Authorization": getAuthHeader(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      plan_id: planId,
      total_count: 12, // 12 billing cycles
      customer_notify: 1,
      notes: { userId },
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    console.error("[razorpay] subscription creation failed:", err)
    throw new Error("Failed to create Razorpay subscription")
  }

  const data = await res.json()
  return {
    subscriptionId: data.id,
    status: data.status,
  }
}

// ── Verify Razorpay payment signature (HMAC-SHA256) ──
export function verifyPaymentSignature(
  orderId: string,
  paymentId: string,
  signature: string
): boolean {
  const secret = getKeySecret()
  const body = `${orderId}|${paymentId}`
  const expected = createHmac("sha256", secret).update(body).digest("hex")
  return timingSafeEqual(signature, expected)
}

// ── Verify Razorpay webhook signature ──
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET
  if (!webhookSecret) {
    console.error("[razorpay] RAZORPAY_WEBHOOK_SECRET not configured")
    return false
  }
  const expected = createHmac("sha256", webhookSecret).update(rawBody).digest("hex")
  return timingSafeEqual(signature, expected)
}

// ── Verify subscription payment signature ──
export function verifySubscriptionSignature(
  subscriptionId: string,
  paymentId: string,
  signature: string
): boolean {
  const secret = getKeySecret()
  const body = `${subscriptionId}|${paymentId}`
  const expected = createHmac("sha256", secret).update(body).digest("hex")
  return timingSafeEqual(signature, expected)
}

// ── Fetch payment status from Razorpay (server-side verification) ──
export async function fetchPayment(paymentId: string): Promise<any> {
  const res = await fetch(`${RAZORPAY_BASE}/payments/${paymentId}`, {
    headers: { "Authorization": getAuthHeader() },
  })
  if (!res.ok) {
    console.error("[razorpay] fetch payment failed:", await res.text())
    throw new Error("Failed to fetch payment from Razorpay")
  }
  return res.json()
}

// ── Fetch order status from Razorpay ──
export async function fetchOrder(orderId: string): Promise<any> {
  const res = await fetch(`${RAZORPAY_BASE}/orders/${orderId}`, {
    headers: { "Authorization": getAuthHeader() },
  })
  if (!res.ok) {
    console.error("[razorpay] fetch order failed:", await res.text())
    throw new Error("Failed to fetch order from Razorpay")
  }
  return res.json()
}

// ── Fetch subscription status from Razorpay ──
export async function fetchSubscription(subscriptionId: string): Promise<any> {
  const res = await fetch(`${RAZORPAY_BASE}/subscriptions/${subscriptionId}`, {
    headers: { "Authorization": getAuthHeader() },
  })
  if (!res.ok) {
    console.error("[razorpay] fetch subscription failed:", await res.text())
    throw new Error("Failed to fetch subscription from Razorpay")
  }
  return res.json()
}

// ── Cancel a Razorpay subscription ──
export async function cancelSubscription(subscriptionId: string): Promise<any> {
  const res = await fetch(`${RAZORPAY_BASE}/subscriptions/${subscriptionId}/cancel`, {
    method: "POST",
    headers: { "Authorization": getAuthHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ cancel_at_cycle_end: 1 }),
  })
  if (!res.ok) {
    console.error("[razorpay] cancel subscription failed:", await res.text())
    throw new Error("Failed to cancel subscription")
  }
  return res.json()
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
