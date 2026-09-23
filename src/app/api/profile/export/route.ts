import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getAuth, unauthorized } from "@/lib/api"
import { localDateForTimezone } from "@/lib/study"

// GET /api/profile/export
// Returns the user's full profile data as a JSON download (GDPR data portability).
// Includes: profile, streak, badges, study sessions, daily goals, friendships,
// notifications, payments, subscription, referrals, blocks, community memberships.
// Excludes: other users' private data (e.g. messages from other users are included
// as text only, no PII beyond what the user already saw).
export async function GET(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const user = await db.user.findUnique({
    where: { id: ctx.userId },
    include: {
      profile: true,
      streak: true,
      subscription: true,
      memberships: { include: { community: { select: { slug: true, name: true, examGoal: true } } } },
      badges: { include: { badge: true } },
    },
  })
  if (!user) return unauthorized()
  const tz = user.timezone || "Asia/Kolkata"

  // Fetch related data
  const [sessions, goals, friendships, blocksGiven, blocksReceived, notifications, payments, referrals] = await Promise.all([
    db.studySession.findMany({
      where: { userId: ctx.userId },
      orderBy: { startedAt: "desc" },
      take: 1000,
      include: { room: { select: { name: true } }, community: { select: { name: true, slug: true } } },
    }),
    db.dailyGoal.findMany({ where: { userId: ctx.userId }, orderBy: { date: "desc" }, take: 365 }),
    db.friendship.findMany({
      where: { OR: [{ fromUserId: ctx.userId }, { toUserId: ctx.userId }] },
      include: { fromUser: { select: { email: true } }, toUser: { select: { email: true } } },
    }),
    db.block.findMany({ where: { blockerId: ctx.userId }, include: { blocked: { select: { email: true } } } }),
    db.block.findMany({ where: { blockedId: ctx.userId }, include: { blocker: { select: { email: true } } } }),
    db.notification.findMany({ where: { userId: ctx.userId }, orderBy: { createdAt: "desc" }, take: 500 }),
    db.payment.findMany({ where: { userId: ctx.userId }, orderBy: { createdAt: "desc" } }),
    db.referral.findMany({ where: { referrerId: ctx.userId }, include: { referredUser: { select: { email: true } } } }),
  ])

  const exportData = {
    exportedAt: new Date().toISOString(),
    schema: "sankalp-profile-export-v1",
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      timezone: user.timezone,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    },
    profile: {
      username: user.profile?.username,
      displayName: user.profile?.displayName,
      avatarUrl: user.profile?.avatarUrl,
      bio: user.profile?.bio,
      examGoal: user.profile?.examGoal,
      targetYear: user.profile?.targetYear,
      studyHoursGoal: user.profile?.studyHoursGoal,
      streakCount: user.profile?.streakCount,
      totalMinutes: user.profile?.totalMinutes,
      totalXp: user.profile?.totalXp,
      level: user.profile?.level,
      notifPrefs: user.profile?.notifPrefs ? JSON.parse(user.profile.notifPrefs) : {},
    },
    streak: user.streak ? {
      current: user.streak.current,
      longest: user.streak.longest,
      lastStudyDate: user.streak.lastStudyDate,
      freezesAvailable: user.streak.freezesAvailable,
      freezesUsed: user.streak.freezesUsed,
    } : null,
    subscription: user.subscription,
    badges: (user.badges ?? []).map((b) => ({
      slug: b.badge.slug,
      name: b.badge.name,
      description: b.badge.description,
      tier: b.badge.tier,
      xpReward: b.badge.xpReward,
      awardedAt: b.awardedAt,
    })),
    communities: user.memberships.map((m) => ({
      community: m.community.name,
      slug: m.community.slug,
      role: m.role,
      joinedAt: m.joinedAt,
    })),
    studySessions: sessions.map((s) => ({
      id: s.id,
      date: localDateForTimezone(s.startedAt, tz).toISOString().slice(0, 10),
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      durationMin: s.durationMin,
      xpEarned: s.xpEarned,
      mode: s.mode,
      note: s.note,
      tags: safeParse(s.tags),
      roomName: s.room?.name ?? null,
      community: s.community?.name ?? null,
    })),
    dailyGoals: goals.map((g) => ({
      date: g.date,
      targetMin: g.targetMin,
      achievedMin: g.achievedMin,
      completed: g.completed,
    })),
    friendships: friendships.map((f) => ({
      status: f.status,
      direction: f.fromUserId === ctx.userId ? "sent" : "received",
      otherEmail: f.fromUserId === ctx.userId ? f.toUser.email : f.fromUser.email,
      createdAt: f.createdAt,
    })),
    blocksGiven: blocksGiven.map((b) => ({ blockedEmail: b.blocked.email, createdAt: b.createdAt })),
    blocksReceived: blocksReceived.map((b) => ({ blockerEmail: b.blocker.email, createdAt: b.createdAt })),
    notifications: notifications.map((n) => ({
      type: n.type,
      title: n.title,
      body: n.body,
      read: n.read,
      createdAt: n.createdAt,
    })),
    payments: payments.map((p) => ({
      amount: p.amount,
      currency: p.currency,
      plan: p.plan,
      provider: p.provider,
      status: p.status,
      createdAt: p.createdAt,
    })),
    referrals: referrals.map((r) => ({
      code: r.code,
      status: r.status,
      referredEmail: r.referredUser?.email ?? null,
      createdAt: r.createdAt,
      completedAt: r.completedAt,
    })),
  }

  const json = JSON.stringify(exportData, null, 2)
  const filename = `sankalp-profile-${new Date().toISOString().slice(0, 10)}.json`

  return new Response(json, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}

function safeParse(s: string): string[] {
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : [] } catch { return [] }
}
