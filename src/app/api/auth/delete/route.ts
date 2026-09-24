import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, badRequest, getAuth, getSupabaseUser } from "@/lib/api"
import { verifyPassword } from "@/lib/auth"
import { deleteSupabaseAuthUser } from "@/lib/supabase"

// POST /api/auth/delete
// Permanently delete the authenticated user's account + all associated data.
// Requires password confirmation (for email/password accounts).
// GDPR-style: cascades to all user data via Prisma onDelete: Cascade.
// Body: { password?: string, confirm?: "DELETE" }
export async function POST(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  if (ctx.role === "admin") {
    return badRequest("Admin accounts cannot be deleted from Settings.", "ADMIN_PROTECTED")
  }
  const body = await req.json().catch(() => ({}))

  // Require explicit confirmation string
  if (body?.confirm !== "DELETE") {
    return badRequest('Confirmation required: send { confirm: "DELETE" }', "CONFIRMATION_REQUIRED")
  }

  const user = await db.user.findUnique({ where: { id: ctx.userId } })
  if (!user) return unauthorized()

  // If the user has a password, require it for re-verification
  if (user.passwordHash) {
    const password = String(body?.password || "")
    if (!password) return badRequest("Password confirmation required", "PASSWORD_REQUIRED")
    if (!verifyPassword(password, user.passwordHash)) {
      return badRequest("Incorrect password", "INVALID_PASSWORD")
    }
  }

  // Delete the external Supabase Auth identity before removing the local row.
  // The verified token ID is preferred; googleSub also supports sessions that
  // were issued before the current request (and local-token compatibility).
  const supabaseUser = await getSupabaseUser(req)
  try {
    await deleteSupabaseAuthUser(supabaseUser?.id ?? user.googleSub)
  } catch (error) {
    console.error("[auth/delete] Supabase Auth deletion failed:", error)
    return badRequest("Could not delete the Supabase Auth account. Please try again or contact support.", "AUTH_PROVIDER_DELETE_FAILED")
  }

  // Record an audit log entry BEFORE deletion (so it survives)
  await db.auditLog.create({
    data: {
      actorId: ctx.userId,
      action: "account_self_deleted",
      targetType: "user",
      targetId: ctx.userId,
      metadata: JSON.stringify({ email: user.email, ts: new Date().toISOString() }),
    },
  })

  // Cascade deletes handle: profile, authSessions, communityMembers, roomMembers,
  // studySessions, dailyGoals, streak, userBadges, friendships (both sides),
  // blocks (both sides), reports (as reporter), roomMessages, notifications,
  // payments, userDevices, referrals (as referrer — set to null), subscription.
  // Rooms owned by the user: we transfer ownership to admin or delete.
  const ownedRooms = await db.room.findMany({ where: { ownerId: ctx.userId }, select: { id: true } })
  if (ownedRooms.length > 0) {
    // Close + unlist owned rooms (don't delete — preserve chat history for other members)
    await db.room.updateMany({
      where: { ownerId: ctx.userId },
      data: { isLive: false, isListed: false, endedAt: new Date() },
    })
  }

  await db.user.delete({ where: { id: ctx.userId } })

  return ok({ deleted: true })
}
