import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, forbidden, badRequest, getAuth, isAdmin } from "@/lib/api"
import { rateLimit } from "@/lib/ratelimit"

export async function POST(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  if (!isAdmin(ctx)) return forbidden("Admin only")
  const rl = rateLimit(req, { limit: 5, windowMs: 60000, key: "admin-broadcast" })
  if (!rl.ok) return badRequest("Rate limited. Wait a minute.", "RATE_LIMITED")
  const body = await req.json().catch(() => ({}))
  const title = String(body?.title || "").trim()
  const message = String(body?.message || "").trim()
  const audience = String(body?.audience || "all")
  if (!title || !message) return badRequest("Title and message required")

  let userIds: string[] = []
  if (audience === "all") {
    const users = await db.user.findMany({ where: { status: "active" }, select: { id: true } })
    userIds = users.map((u) => u.id)
  } else if (audience === "paid") {
    const subs = await db.subscription.findMany({ where: { status: "active", plan: { not: "free" } }, select: { userId: true } })
    userIds = subs.map((s) => s.userId)
  } else if (audience === "free") {
    const paidUsers = await db.subscription.findMany({ where: { status: "active", plan: { not: "free" } }, select: { userId: true } })
    const paidSet = new Set(paidUsers.map((s) => s.userId))
    const allUsers = await db.user.findMany({ where: { status: "active" }, select: { id: true } })
    userIds = allUsers.filter((u) => !paidSet.has(u.id)).map((u) => u.id)
  } else if (audience.startsWith("community:")) {
    const slug = audience.split(":")[1]
    const members = await db.communityMember.findMany({ where: { community: { slug } }, select: { userId: true } })
    userIds = members.map((m) => m.userId)
  }

  // Create notifications (batch)
  const BATCH = 100
  for (let i = 0; i < userIds.length; i += BATCH) {
    const batch = userIds.slice(i, i + BATCH)
    await db.notification.createMany({
      data: batch.map((userId) => ({ userId, type: "system", title, body: message, link: "#/dashboard" })),
    })
  }

  await db.auditLog.create({ data: { actorId: ctx.userId, action: "NOTIFICATION_SENT", targetType: "broadcast", targetId: null, metadata: JSON.stringify({ title, audience, count: userIds.length }) } })
  return ok({ sent: userIds.length })
}
