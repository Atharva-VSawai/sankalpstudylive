import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, forbidden, getAuth, isModerator } from "@/lib/api"

export async function GET(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  if (!isModerator(ctx)) return forbidden()
  const url = new URL(req.url)
  const status = url.searchParams.get("status")
  const plan = url.searchParams.get("plan")
  const page = Math.max(1, Number(url.searchParams.get("page") || 1))
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || 20)))
  const where: any = {}
  if (status) where.status = status
  if (plan) where.plan = plan
  const [payments, total] = await Promise.all([
    db.payment.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit,
      include: { user: { include: { profile: { select: { displayName: true, username: true } } } } } }),
    db.payment.count({ where }),
  ])
  return ok({
    payments: payments.map((p) => ({ id: p.id, userId: p.userId, userName: p.user.profile?.displayName ?? p.user.email, username: p.user.profile?.username, amount: p.amount, currency: p.currency, plan: p.plan, status: p.status, provider: p.provider, providerRef: p.razorpayPaymentId ?? p.razorpayOrderId ?? p.razorpaySubscriptionId, createdAt: p.createdAt })),
    page, limit, total,
  })
}
