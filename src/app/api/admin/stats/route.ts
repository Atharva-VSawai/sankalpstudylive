import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, forbidden, getAuth, isModerator } from "@/lib/api"
import { PLANS } from "@/lib/pricing"

// GET /api/admin/stats — expanded operational dashboard
export async function GET(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  if (!isModerator(ctx)) return forbidden()

  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const weekStart = new Date(todayStart.getTime() - 7 * 86400000)
  const monthStart = new Date(todayStart.getTime() - 30 * 86400000)

  const [
    totalUsers, usersToday, usersThisWeek, usersThisMonth, activeToday, activeThisWeek,
    totalSessions, sessionsToday, totalStudyMin, studyMinToday, studyMinThisWeek, studyMinThisMonth,
    avgSessionMin,
    activeRooms, totalRooms, defaultRooms, totalCommunities,
    openReports, reportsResolvedToday,
    activeSubs, totalPayments, paidPayments, failedPayments, totalRevenue,
    totalReferrals, successfulReferrals,
    totalBadges,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { createdAt: { gte: todayStart } } }),
    db.user.count({ where: { createdAt: { gte: weekStart } } }),
    db.user.count({ where: { createdAt: { gte: monthStart } } }),
    db.user.count({ where: { lastLoginAt: { gte: todayStart } } }),
    db.user.count({ where: { lastLoginAt: { gte: weekStart } } }),
    db.studySession.count({ where: { endedAt: { not: null } } }),
    db.studySession.count({ where: { endedAt: { not: null }, startedAt: { gte: todayStart } } }),
    db.studySession.aggregate({ _sum: { durationMin: true }, where: { endedAt: { not: null } } }),
    db.studySession.aggregate({ _sum: { durationMin: true }, where: { endedAt: { not: null }, startedAt: { gte: todayStart } } }),
    db.studySession.aggregate({ _sum: { durationMin: true }, where: { endedAt: { not: null }, startedAt: { gte: weekStart } } }),
    db.studySession.aggregate({ _sum: { durationMin: true }, where: { endedAt: { not: null }, startedAt: { gte: monthStart } } }),
    db.studySession.aggregate({ _avg: { durationMin: true }, where: { endedAt: { not: null } } }),
    db.room.count({ where: { isLive: true } }),
    db.room.count(),
    db.room.count({ where: { isDefaultRoom: true } }),
    db.community.count(),
    db.report.count({ where: { status: "open" } }),
    db.report.count({ where: { status: "resolved", resolvedAt: { gte: todayStart } } }),
    db.subscription.count({ where: { status: "active", plan: { not: "free" } } }),
    db.payment.count(),
    db.payment.count({ where: { status: "paid" } }),
    db.payment.count({ where: { status: "failed" } }),
    db.payment.aggregate({ _sum: { amount: true }, where: { status: "paid" } }),
    db.referral.count(),
    db.referral.count({ where: { status: { in: ["signed_up", "first_session", "rewarded"] } } }),
    db.badge.count(),
  ])

  // Plan breakdown
  const [focusPassCount, monthlyCount, halfyearCount, yearlyCount] = await Promise.all([
    db.subscription.count({ where: { plan: "focus_pass", status: "active" } }),
    db.subscription.count({ where: { plan: "monthly", status: "active" } }),
    db.subscription.count({ where: { plan: "halfyear", status: "active" } }),
    db.subscription.count({ where: { plan: "yearly", status: "active" } }),
  ])

  // Most active rooms
  const mostActiveRooms = await db.room.findMany({
    orderBy: [{ participantCount: "desc" }],
    take: 5,
    select: { id: true, name: true, participantCount: true, isLive: true, isDefaultRoom: true, community: { select: { name: true, slug: true } } },
  })

  // Most active communities
  const communities = await db.community.findMany({
    orderBy: [{ memberCount: "desc" }],
    take: 5,
    select: { id: true, name: true, slug: true, memberCount: true, color: true },
  })

  return ok({
    users: { total: totalUsers, today: usersToday, thisWeek: usersThisWeek, thisMonth: usersThisMonth, activeToday, activeThisWeek },
    study: {
      totalMinutes: totalStudyMin._sum.durationMin ?? 0,
      minutesToday: studyMinToday._sum.durationMin ?? 0,
      minutesThisWeek: studyMinThisWeek._sum.durationMin ?? 0,
      minutesThisMonth: studyMinThisMonth._sum.durationMin ?? 0,
      totalSessions, sessionsToday,
      avgSessionMin: Math.round(avgSessionMin._avg.durationMin ?? 0),
      activeRooms,
    },
    rooms: { total: totalRooms, active: activeRooms, default: defaultRooms, mostActive: mostActiveRooms },
    communities: { total: totalCommunities, mostActive: communities },
    business: {
      activeSubscriptions: activeSubs,
      planBreakdown: { focus_pass: focusPassCount, monthly: monthlyCount, halfyear: halfyearCount, yearly: yearlyCount },
      totalPayments, paidPayments, failedPayments,
      revenuePaise: totalRevenue._sum.amount ?? 0,
    },
    moderation: { openReports, reportsResolvedToday },
    referrals: { total: totalReferrals, successful: successfulReferrals },
    badges: { total: totalBadges },
  })
}
