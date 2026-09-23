import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, getAuth } from "@/lib/api"

// GET /api/referrals — current user's referral code + stats
export async function GET(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const ref = await db.referral.findFirst({ where: { referrerId: ctx.userId } })
  const referredCount = await db.referral.count({ where: { referrerId: ctx.userId, status: { in: ["signed_up", "first_session", "rewarded"] } } })
  const firstSessionCount = await db.referral.count({ where: { referrerId: ctx.userId, status: { in: ["first_session", "rewarded"] } } })
  return ok({
    code: ref?.code ?? null,
    referredCount,
    firstSessionCount,
  })
}
