import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, forbidden, getAuth, isModerator } from "@/lib/api"

export async function GET(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  if (!isModerator(ctx)) return forbidden()
  const url = new URL(req.url)
  const page = Math.max(1, Number(url.searchParams.get("page") || 1))
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || 20)))
  const [refs, total, successfulCount] = await Promise.all([
    db.referral.findMany({ orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit,
      include: { referredUser: { include: { profile: { select: { displayName: true, username: true } } } } } }),
    db.referral.count(),
    db.referral.count({ where: { status: { in: ["signed_up", "first_session", "rewarded"] } } }),
  ])
  return ok({
    referrals: refs.map((r) => ({ id: r.id, code: r.code, referrerId: r.referrerId, referredUserId: r.referredUserId, referredName: r.referredUser?.profile?.displayName, status: r.status, createdAt: r.createdAt, completedAt: r.completedAt })),
    page, limit, total, successfulCount,
  })
}
