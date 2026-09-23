import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, notFound, getAuth } from "@/lib/api"

// PATCH /api/notifications/[id] — mark one read
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const { id } = await params
  const n = await db.notification.findUnique({ where: { id } })
  if (!n || n.userId !== ctx.userId) return notFound("Notification not found")
  await db.notification.update({ where: { id }, data: { read: true } })
  return ok({ read: true })
}
