import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, forbidden, badRequest, getAuth, isModerator, isAdmin } from "@/lib/api"

// GET /api/admin/stats
export async function GET(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  if (!isModerator(ctx)) return forbidden()
  const [users, activeUsers, communities, liveRooms, reports, openReports, sessions, payments, totalMinutes, totalXp] =
    await Promise.all([
      db.user.count(),
      db.user.count({ where: { lastLoginAt: { gte: new Date(Date.now() - 7 * 86400000) } } }),
      db.community.count(),
      db.room.count({ where: { isLive: true } }),
      db.report.count(),
      db.report.count({ where: { status: "open" } }),
      db.studySession.count({ where: { endedAt: { not: null } } }),
      db.payment.count({ where: { status: "paid" } }),
      db.profile.aggregate({ _sum: { totalMinutes: true } }),
      db.profile.aggregate({ _sum: { totalXp: true } }),
    ])
  return ok({
    users,
    activeUsers,
    communities,
    liveRooms,
    reports,
    openReports,
    sessions,
    payments,
    totalMinutes: totalMinutes._sum.totalMinutes ?? 0,
    totalXp: totalXp._sum.totalXp ?? 0,
  })
}
