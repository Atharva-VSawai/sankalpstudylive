import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, getAuth } from "@/lib/api"

// GET /api/payments/history
// Returns the authenticated user's payment history.
export async function GET(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()

  const payments = await db.payment.findMany({
    where: { userId: ctx.userId },
    orderBy: { createdAt: "desc" },
    take: 50,
  })

  return ok({
    payments: payments.map((p) => ({
      id: p.id,
      plan: p.plan,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      provider: p.provider,
      razorpayOrderId: p.razorpayOrderId,
      razorpayPaymentId: p.razorpayPaymentId,
      entitlementStart: p.entitlementStart,
      entitlementEnd: p.entitlementEnd,
      failureReason: p.failureReason,
      createdAt: p.createdAt,
    })),
  })
}
