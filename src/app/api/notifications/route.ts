import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, getAuth } from "@/lib/api"

// GET /api/notifications — list + unread count
// PATCH /api/notifications — mark all read
export async function GET(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const url = new URL(req.url)
  const unreadOnly = url.searchParams.get("unread") === "true"
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || 30)))
  const where = { userId: ctx.userId, ...(unreadOnly ? { read: false } : {}) }
  const [items, unreadCount] = await Promise.all([
    db.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: limit }),
    db.notification.count({ where: { userId: ctx.userId, read: false } }),
  ])
  return ok({ notifications: items, unreadCount })
}

export async function PATCH(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  await db.notification.updateMany({ where: { userId: ctx.userId, read: false }, data: { read: true } })
  return ok({ markedAllRead: true })
}
