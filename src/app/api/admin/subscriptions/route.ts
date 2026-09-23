import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, forbidden, getAuth, isModerator } from "@/lib/api"

// GET /api/admin/subscriptions
export async function GET(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  if (!isModerator(ctx)) return forbidden()
  const url = new URL(req.url)
  const plan = url.searchParams.get("plan")
  const status = url.searchParams.get("status")
  const page = Math.max(1, Number(url.searchParams.get("page") || 1))
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || 20)))

  const where: any = {}
  if (plan) where.plan = plan
  if (status) where.status = status

  const [subs, total] = await Promise.all([
    db.subscription.findMany({
      where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit,
      include: { user: { include: { profile: { select: { displayName: true, username: true, avatarUrl: true } } } } },
    }),
    db.subscription.count({ where }),
  ])

  return ok({
    subscriptions: subs.map((s) => ({
      id: s.id, userId: s.userId, userName: s.user.profile?.displayName ?? s.user.email,
      username: s.user.profile?.username ?? null, avatarUrl: s.user.profile?.avatarUrl ?? null,
      plan: s.plan, status: s.status, startedAt: s.startedAt, expiresAt: s.expiresAt, renewsAt: s.renewsAt, createdAt: s.createdAt,
    })),
    page, limit, total,
  })
}
