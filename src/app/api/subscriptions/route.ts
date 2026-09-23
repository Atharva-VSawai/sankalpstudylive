import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, badRequest, forbidden, getAuth, isAdmin } from "@/lib/api"

// GET /api/subscriptions — current user's subscription
// POST /api/subscriptions — upgrade/downgrade plan { plan: "plus"|"pro" }
export async function GET(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const sub = await db.subscription.findUnique({ where: { userId: ctx.userId } })
  return ok({ subscription: sub ?? { plan: "free", status: "active" } })
}

export async function POST(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const body = await req.json().catch(() => ({}))
  const plan = String(body?.plan || "")
  if (!["plus", "pro"].includes(plan)) return badRequest("Invalid plan")
  // Sandbox: simulate a successful payment record + upgrade
  const amountPaise = plan === "plus" ? 29900 : 79900
  await db.payment.create({
    data: { userId: ctx.userId, amount: amountPaise, currency: "INR", plan, provider: "razorpay", providerRef: `demo-${Date.now()}`, status: "paid" },
  })
  const sub = await db.subscription.upsert({
    where: { userId: ctx.userId },
    create: { userId: ctx.userId, plan, status: "active", renewsAt: new Date(Date.now() + 30 * 86400000) },
    update: { plan, status: "active", renewsAt: new Date(Date.now() + 30 * 86400000) },
  })
  return ok({ subscription: sub })
}
