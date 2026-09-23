import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, badRequest, getAuth, forbidden } from "@/lib/api"
import {
  trackEvent,
  MAX_SESSION_MIN,
  XP_PER_MINUTE,
  awardXp,
  bumpStreak,
  bumpDailyGoal,
  evaluateBadges,
} from "@/lib/study"

// POST /api/study/sessions — start a study session (server records startedAt)
// Body: { roomId?, communityId?, mode?: "focus"|"pomodoro" }
export async function POST(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const body = await req.json().catch(() => ({}))
  const user = await db.user.findUnique({ where: { id: ctx.userId } })
  if (!user) return unauthorized()
  const mode = body?.mode === "pomodoro" ? "pomodoro" : "focus"

  // Only one active (un-ended) session per user allowed.
  const active = await db.studySession.findFirst({
    where: { userId: ctx.userId, endedAt: null },
    orderBy: { startedAt: "desc" },
  })
  if (active) {
    // Auto-close any dangling session with a capped duration.
    await closeSession(active.id, user.timezone)
  }

  // If a room is specified, ensure the user is a member of it.
  let room = null
  if (body?.roomId) {
    room = await db.room.findUnique({ where: { id: String(body.roomId) } })
    if (!room) return badRequest("Unknown room")
    const member = await db.roomMember.findUnique({
      where: { roomId_userId: { roomId: room.id, userId: ctx.userId } },
    })
    if (!member) return forbidden("Join the room before starting a session in it", "NOT_MEMBER")
  }
  let communityId: string | null = null
  if (body?.communityId) {
    const cm = await db.community.findUnique({ where: { id: String(body.communityId) } })
    if (cm) communityId = cm.id
  } else if (room?.communityId) {
    communityId = room.communityId
  }

  const session = await db.studySession.create({
    data: {
      userId: ctx.userId,
      roomId: room?.id ?? null,
      communityId,
      mode,
      startedAt: new Date(),
    },
  })
  await trackEvent(ctx.userId, "study_started", { sessionId: session.id, mode })
  return ok({ sessionId: session.id, startedAt: session.startedAt })
}

// GET /api/study/sessions — history for the authed user (with optional tag + date filters)
export async function GET(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const url = new URL(req.url)
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") || 30)))
  const tag = url.searchParams.get("tag")
  const from = url.searchParams.get("from") // ISO date
  const to = url.searchParams.get("to") // ISO date
  const hasNote = url.searchParams.get("hasNote") === "true"

  const where: any = { userId: ctx.userId, endedAt: { not: null } }
  if (from || to) {
    where.startedAt = {}
    if (from) where.startedAt.gte = new Date(from)
    if (to) where.startedAt.lte = new Date(to + "T23:59:59.999Z")
  }
  if (hasNote) where.note = { not: null }

  const sessions = await db.studySession.findMany({
    where,
    orderBy: { startedAt: "desc" },
    take: limit,
    include: { room: { select: { id: true, name: true } }, community: { select: { slug: true, name: true } } },
  })

  // Tag filter is applied in-memory because tags is a JSON string in SQLite.
  let filtered = sessions
  if (tag) {
    filtered = filtered.filter((s) => {
      const tags = safeParse(s.tags)
      return tags.includes(tag)
    })
  }

  return ok({
    sessions: filtered.map((s) => ({
      id: s.id,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      durationMin: s.durationMin,
      xpEarned: s.xpEarned,
      mode: s.mode,
      note: s.note,
      tags: safeParse(s.tags),
      room: s.room,
      community: s.community,
    })),
  })
}

function safeParse(s: string): string[] {
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : [] } catch { return [] }
}

// Internal helper (also used by stop route) — closes a session, computes duration server-side.
export async function closeSession(sessionId: string, timezone: string) {
  const session = await db.studySession.findUnique({ where: { id: sessionId } })
  if (!session || session.endedAt) return null
  const endedAt = new Date()
  const durationMin = Math.min(
    MAX_SESSION_MIN,
    Math.max(0, Math.round((endedAt.getTime() - session.startedAt.getTime()) / 60000))
  )
  if (durationMin < 1) {
    // Discard sub-minute sessions
    await db.studySession.delete({ where: { id: sessionId } })
    return { durationMin: 0, xpEarned: 0, awardedBadges: [] }
  }
  const xp = durationMin * XP_PER_MINUTE
  await db.studySession.update({
    where: { id: sessionId },
    data: { endedAt, durationMin, xpEarned: xp, isVerified: true },
  })
  const { level, oldLevel, leveledUp } = await awardXp(session.userId, durationMin)
  const streak = await bumpStreak(session.userId, timezone)
  const goal = await bumpDailyGoal(session.userId, timezone, durationMin)
  const awardedBadges = await evaluateBadges(session.userId, durationMin, session.startedAt, {
    communityId: session.communityId,
    roomId: session.roomId,
  })
  await trackEvent(session.userId, "study_completed", { sessionId, durationMin, xp })
  await trackEvent(session.userId, "study_duration", { durationMin })
  if (goal.completed) await trackEvent(session.userId, "goal_completed", { date: goal.date })
  if (streak.current > 0 && streak.current % 7 === 0) await trackEvent(session.userId, "streak_milestone", { streak: streak.current })
  if (awardedBadges.length) {
    for (const b of awardedBadges) {
      if (await isNotifEnabledSafe(session.userId, "badge_earned")) {
        await db.notification.create({
          data: {
            userId: session.userId,
            type: "badge_earned",
            title: `Badge earned: ${b.name}`,
            body: b.description,
            link: "#/dashboard",
          },
        })
      }
      await trackEvent(session.userId, "badge_earned", { slug: b.slug })
    }
  }

  // ── Free live-room allowance accounting is now handled by the entitlement
  // engine (src/lib/entitlement.ts) via the active session on FreeRoomAllowance.
  // closeActiveLiveRoomSession accrues the live-elapsed seconds into
  // consumedSeconds. We do NOT increment roomMinutesUsed here anymore — that
  // field is the legacy lifetime counter and is no longer the source of truth
  // for the free allowance. Kept for backward-compat display only.
  void session.roomId
  void durationMin

  return { durationMin, xpEarned: xp, level, oldLevel, leveledUp, streak: streak.current, goal, awardedBadges }
}

// Inline safe wrapper to avoid a circular import with the preferences route.
async function isNotifEnabledSafe(userId: string, type: string): Promise<boolean> {
  try {
    const { isNotifEnabled } = await import("@/app/api/notifications/preferences/route")
    return await isNotifEnabled(userId, type)
  } catch {
    return true
  }
}
