import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, forbidden, getAuth, isModerator } from "@/lib/api"

// GET /api/admin/users/[id] — full user detail for admin
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  if (!isModerator(ctx)) return forbidden()
  const { id } = await params

  const user = await db.user.findUnique({
    where: { id },
    include: {
      // NOTE: `badges` (UserBadge[]) is a relation on `User`, not `Profile`.
      badges: { include: { badge: true } },
      profile: true,
      streak: true,
      subscription: true,
      memberships: { include: { community: { select: { id: true, slug: true, name: true, examGoal: true } } } },
    },
  })
  if (!user) return ok({ error: { code: "NOT_FOUND", message: "User not found" } }, 404) as any

  // Fetch related data
  const [sessions, payments, referrals, reportsMade, reportsAgainst, friendships, blocksGiven] = await Promise.all([
    db.studySession.findMany({ where: { userId: id }, orderBy: { startedAt: "desc" }, take: 20, include: { room: { select: { name: true } }, community: { select: { name: true, slug: true } } } }),
    db.payment.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 20 }),
    db.referral.findMany({ where: { referrerId: id }, include: { referredUser: { select: { email: true, profile: { select: { displayName: true, username: true } } } } }, take: 20 }),
    db.report.count({ where: { reporterId: id } }),
    db.report.count({ where: { reportedId: id } }),
    db.friendship.count({ where: { OR: [{ fromUserId: id }, { toUserId: id }], status: "accepted" } }),
    db.block.count({ where: { blockerId: id } }),
  ])

  const totalMinutes = sessions.reduce((a, s) => a + s.durationMin, 0)

  return ok({
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      timezone: user.timezone,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    },
    profile: user.profile ? {
      username: user.profile.username,
      displayName: user.profile.displayName,
      avatarUrl: user.profile.avatarUrl,
      bio: user.profile.bio,
      examGoal: user.profile.examGoal,
      targetYear: user.profile.targetYear,
      studyHoursGoal: user.profile.studyHoursGoal,
      totalMinutes: user.profile.totalMinutes,
      totalXp: user.profile.totalXp,
      level: user.profile.level,
      roomMinutesUsed: user.profile.roomMinutesUsed,
      onboardingComplete: user.profile.onboardingComplete,
      pomodoroConfig: user.profile.pomodoroConfig,
    } : null,
    streak: user.streak,
    subscription: user.subscription,
    badges: (user.badges ?? []).map((b) => ({
      slug: b.badge.slug, name: b.badge.name, description: b.badge.description, tier: b.badge.tier, awardedAt: b.awardedAt,
    })),
    communities: user.memberships.map((m) => ({ community: m.community.name, slug: m.community.slug, role: m.role, joinedAt: m.joinedAt })),
    study: {
      totalMinutes,
      sessionsCount: sessions.length,
      recentSessions: sessions.slice(0, 10).map((s) => ({
        id: s.id, startedAt: s.startedAt, endedAt: s.endedAt, durationMin: s.durationMin, xpEarned: s.xpEarned, mode: s.mode, roomName: s.room?.name, community: s.community?.name,
      })),
    },
    payments: payments.map((p) => ({ id: p.id, amount: p.amount, currency: p.currency, plan: p.plan, status: p.status, provider: p.provider, providerRef: p.providerRef, createdAt: p.createdAt })),
    referrals: referrals.map((r) => ({ code: r.code, status: r.status, referredEmail: r.referredUser?.email, createdAt: r.createdAt, completedAt: r.completedAt })),
    social: { friendsCount: friendships, blocksGiven: blocksGiven, reportsMade: reportsMade, reportsAgainst: reportsAgainst },
  })
}
