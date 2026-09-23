import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, forbidden, badRequest, getAuth, isAdmin } from "@/lib/api"
import { sendWeeklyRecap, buildWeeklyRecap } from "@/lib/email"

// POST /api/admin/recap?userId=... — send (or preview) a weekly recap for a user
//   Body: { preview?: true } to just build + return the email without "sending".
//   Query: ?all=true to send to all users who studied in the last week (admin only).
export async function POST(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  if (!isAdmin(ctx)) return forbidden("Admin only")

  const url = new URL(req.url)
  const userId = url.searchParams.get("userId")
  const all = url.searchParams.get("all") === "true"
  const body = await req.json().catch(() => ({}))
  const preview = body?.preview === true

  if (all) {
    // Find all users who studied in the last week
    const since = new Date(Date.now() - 7 * 86400000)
    const usersWithActivity = await db.studySession.findMany({
      where: { startedAt: { gte: since } },
      select: { userId: true },
      distinct: ["userId"],
    })
    const results: { userId: string; sent: boolean }[] = []
    for (const { userId: uid } of usersWithActivity) {
      const res = await sendWeeklyRecap(uid)
      results.push({ userId: uid, sent: res.sent })
    }
    return ok({ sent: results.filter((r) => r.sent).length, total: results.length, results })
  }

  if (!userId) return badRequest("userId required (or ?all=true)")
  const target = await db.user.findUnique({ where: { id: userId }, select: { id: true, email: true, status: true } })
  if (!target) return ok({ error: { code: "NOT_FOUND", message: "User not found" } }, 404) as any
  if (target.status !== "active") return badRequest("User is not active")

  if (preview) {
    const email = await buildWeeklyRecap(userId)
    return ok({ email })
  }
  const res = await sendWeeklyRecap(userId)
  return ok(res)
}

// GET /api/admin/recap?userId=... — preview the weekly recap email (admin only)
export async function GET(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  if (!isAdmin(ctx)) return forbidden("Admin only")
  const url = new URL(req.url)
  const userId = url.searchParams.get("userId")
  if (!userId) return badRequest("userId required")
  const email = await buildWeeklyRecap(userId)
  return ok({ email })
}
