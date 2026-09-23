import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, forbidden, badRequest, getAuth, isAdmin } from "@/lib/api"

// DELETE /api/admin/users/[id]/delete — permanently delete user (admin only)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  if (!isAdmin(ctx)) return forbidden("Admin only")
  const { id } = await params
  if (id === ctx.userId) return badRequest("You cannot delete your own account from the admin panel", "SELF_DELETE")

  const body = await req.json().catch(() => ({}))
  if (body?.confirm !== "DELETE") return badRequest("Confirmation required: send { confirm: \"DELETE\" }", "CONFIRMATION_REQUIRED")

  const user = await db.user.findUnique({ where: { id }, select: { id: true, email: true, role: true } })
  if (!user) return badRequest("User not found", "NOT_FOUND")
  if (user.role === "admin") return badRequest("Cannot delete admin accounts from the admin panel. Demote first.", "ADMIN_PROTECTED")

  // Close owned rooms
  await db.room.updateMany({ where: { ownerId: id, isLive: true }, data: { isLive: false, isListed: false, endedAt: new Date() } })

  // Audit log BEFORE deletion
  await db.auditLog.create({ data: { actorId: ctx.userId, action: "USER_DELETED", targetType: "user", targetId: id, metadata: JSON.stringify({ email: user.email, reason: body?.reason || "admin_deletion" }) } })

  await db.user.delete({ where: { id } })
  return ok({ deleted: true })
}
