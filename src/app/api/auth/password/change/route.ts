import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, badRequest, getAuth } from "@/lib/api"
import { hashPassword, verifyPassword } from "@/lib/auth"

// POST /api/auth/password/change — sandbox/local-auth password change.
// Production Supabase users change their password through Supabase Auth in the
// browser after the current password has been verified there.
export async function POST(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()

  const body = await req.json().catch(() => ({}))
  const currentPassword = String(body?.currentPassword || "")
  const newPassword = String(body?.newPassword || "")
  if (!currentPassword || !newPassword) return badRequest("Current and new passwords are required.", "PASSWORD_REQUIRED")
  if (newPassword.length < 8) return badRequest("New password must be at least 8 characters.", "PASSWORD_TOO_SHORT")
  if (currentPassword === newPassword) return badRequest("New password must be different from the current password.", "PASSWORD_UNCHANGED")

  const user = await db.user.findUnique({ where: { id: ctx.userId }, select: { passwordHash: true } })
  if (!user) return unauthorized()
  if (!user.passwordHash || !verifyPassword(currentPassword, user.passwordHash)) {
    return badRequest("Current password is incorrect.", "INVALID_PASSWORD")
  }

  await db.user.update({ where: { id: ctx.userId }, data: { passwordHash: hashPassword(newPassword) } })
  return ok({ changed: true })
}
