import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, notFound, getAuth } from "@/lib/api"

// GET /api/profile/[username]
export async function GET(req: NextRequest, { params }: { params: Promise<{ username: string }> }) {
  const { username } = await params
  const profile = await db.profile.findUnique({
    where: { username },
    include: { user: { include: { streak: true, badges: { include: { badge: true } } } } },
  })
  if (!profile) return notFound("User not found")

  let isFriend = false
  let friendStatus: string | null = null
  let isBlocked = false
  const ctx = await getAuth(req)
  if (ctx && ctx.userId !== profile.userId) {
    const f = await db.friendship.findFirst({
      where: { OR: [{ fromUserId: ctx.userId, toUserId: profile.userId }, { toUserId: ctx.userId, fromUserId: profile.userId }] },
    })
    if (f) friendStatus = f.status
    isFriend = f?.status === "accepted"
    const b = await db.block.findUnique({
      where: { blockerId_blockedId: { blockerId: ctx.userId, blockedId: profile.userId } },
    })
    isBlocked = Boolean(b)
  }

  // recent sessions for the public profile (counts only, not raw)
  const sessionCount = await db.studySession.count({ where: { userId: profile.userId, endedAt: { not: null } } })

  return ok({
    profile: {
      userId: profile.userId,
      username: profile.username,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl,
      bio: profile.bio,
      examGoal: profile.examGoal,
      targetYear: profile.targetYear,
      level: profile.level,
      totalMinutes: profile.totalMinutes,
      totalXp: profile.totalXp,
      streakCount: profile.streakCount,
      sessionCount,
      streak: profile.user.streak
        ? { current: profile.user.streak.current, longest: profile.user.streak.longest }
        : null,
      badges: (profile.user.badges ?? []).map((b) => ({
        slug: b.badge.slug,
        name: b.badge.name,
        description: b.badge.description,
        tier: b.badge.tier,
        awardedAt: b.awardedAt,
      })),
    },
    isFriend,
    friendStatus,
    isBlocked,
    isMe: ctx?.userId === profile.userId,
  })
}
