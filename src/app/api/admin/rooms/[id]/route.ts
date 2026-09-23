import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, forbidden, badRequest, notFound, getAuth, isAdmin } from "@/lib/api"

// PATCH /api/admin/rooms/[id] — force-close or toggle listing
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  if (!isAdmin(ctx)) return forbidden("Admin only")
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const room = await db.room.findUnique({ where: { id } })
  if (!room) return notFound("Room not found")
  const data: any = {}
  if (typeof body?.isLive === "boolean") data.isLive = body.isLive
  if (typeof body?.isListed === "boolean") data.isListed = body.isListed
  if (body?.action === "close") {
    data.isLive = false
    data.isListed = false
    data.endedAt = new Date()
  }
  const updated = await db.room.update({ where: { id }, data })
  await db.auditLog.create({
    data: { actorId: ctx.userId, action: "room_admin_update", targetType: "room", targetId: id, metadata: JSON.stringify(data) },
  })
  return ok({ room: updated })
}
