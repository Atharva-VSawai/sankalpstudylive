import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, forbidden, badRequest, notFound, getAuth, isModerator } from "@/lib/api"

// PATCH /api/admin/users/[id] — update role / status
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  if (!isModerator(ctx)) return forbidden()
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const data: any = {}
  if (["user", "moderator", "admin"].includes(body?.role)) data.role = body.role
  if (["active", "suspended", "banned"].includes(body?.status)) data.status = body.status
  if (Object.keys(data).length === 0) return badRequest("Nothing to update")
  const user = await db.user.update({ where: { id }, data, include: { profile: true } })
  await db.auditLog.create({
    data: { actorId: ctx.userId, action: `user_${Object.keys(data).join("_")}`, targetType: "user", targetId: id, metadata: JSON.stringify(data) },
  })
  return ok({ user: { id: user.id, role: user.role, status: user.status } })
}
