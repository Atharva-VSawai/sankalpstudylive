import { db } from "@/lib/db"

// ─── Study engine helpers ───────────────────────────────────────────────────
// All durations and XP are computed server-side. The client never sends duration.
// See docs/architecture.md §Study Engine and AGENTS.md §3 (trust boundaries).

export const XP_PER_MINUTE = 10
export const MAX_SESSION_MIN = 8 * 60 // cap a single session at 8h to defeat abuse
export const STREAK_GRACE_HOURS = 6 // window after midnight before streak resets

// Returns the local "date" (midnight UTC) for a given timezone-aware instant.
// We compute the calendar date in the user's timezone, then store as midnight UTC Date.
export function localDateForTimezone(date: Date, timezone: string): Date {
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    const parts = fmt.formatToParts(date)
    const y = parts.find((p) => p.type === "year")!.value
    const m = parts.find((p) => p.type === "month")!.value
    const d = parts.find((p) => p.type === "day")!.value
    return new Date(`${y}-${m}-${d}T00:00:00.000Z`)
  } catch {
    // Fallback to UTC date if timezone invalid
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  }
}

export function levelForXp(xp: number): number {
  // Level n requires 500 * n cumulative XP (level 1 at 0)
  return Math.floor(Math.sqrt(xp / 50)) + 1
}

export function xpForLevel(level: number): number {
  return Math.pow(level - 1, 2) * 50
}

// Updates streak for a user after a completed session in their timezone.
// Streak rules:
//  - First session ever -> current = 1
//  - Studied yesterday (local) -> current + 1
//  - Studied today already -> no change
//  - Gap > 1 day -> reset to 1
export async function bumpStreak(userId: string, timezone: string) {
  const today = localDateForTimezone(new Date(), timezone)
  const streak = await db.streak.upsert({
    where: { userId },
    create: { userId, current: 1, longest: 1, lastStudyDate: today },
    update: {},
  })
  if (!streak.lastStudyDate) {
    return db.streak.update({ where: { userId }, data: { current: 1, longest: 1, lastStudyDate: today } })
  }
  const last = localDateForTimezone(streak.lastStudyDate, timezone)
  if (sameDay(last, today)) {
    return streak // already counted today
  }
  const diffDays = Math.round((today.getTime() - last.getTime()) / 86400000)
  let current = 1
  if (diffDays === 1) current = streak.current + 1
  const longest = Math.max(current, streak.longest)
  return db.streak.update({
    where: { userId },
    data: { current, longest, lastStudyDate: today },
  })
}

// Updates (or creates) today's daily goal row.
export async function bumpDailyGoal(userId: string, timezone: string, minutes: number) {
  const date = localDateForTimezone(new Date(), timezone)
  const existing = await db.dailyGoal.findUnique({ where: { userId_date: { userId, date } } })
  const targetMin = existing?.targetMin ?? 360
  const achievedMin = (existing?.achievedMin ?? 0) + minutes
  const completed = achievedMin >= targetMin
  const completedAt = completed && !existing?.completed ? new Date() : existing?.completedAt ?? null
  return db.dailyGoal.upsert({
    where: { userId_date: { userId, date } },
    create: { userId, date, targetMin, achievedMin, completed, completedAt },
    update: { achievedMin, completed, completedAt },
  })
}

// Awards XP + level to the profile.
export async function awardXp(userId: string, minutes: number) {
  const xp = minutes * XP_PER_MINUTE
  const profile = await db.profile.update({
    where: { userId },
    data: {
      totalMinutes: { increment: minutes },
      totalXp: { increment: xp },
      level: 0, // recalculated below
    },
  })
  const level = levelForXp(profile.totalXp)
  await db.profile.update({ where: { userId }, data: { level } })
  return { xp, level, totalXp: profile.totalXp, totalMinutes: profile.totalMinutes }
}

// Evaluates and grants badges. Returns the newly awarded badges.
export async function evaluateBadges(
  userId: string,
  sessionMinutes: number,
  startedAt: Date,
  ctx: { communityId: string | null; roomId: string | null }
) {
  const awarded: { slug: string; name: string; description: string; tier: string }[] = []
  const profile = await db.profile.findUnique({ where: { userId }, include: { badges: { include: { badge: true } } } })
  const streak = await db.streak.findUnique({ where: { userId } })
  const have = new Set(profile?.badges.map((b) => b.badge.slug) ?? [])

  const grant = async (slug: string) => {
    if (have.has(slug)) return
    const badge = await db.badge.findUnique({ where: { slug } })
    if (!badge) return
    await db.userBadge.create({ data: { userId, badgeId: badge.id } }).catch(() => {})
    awarded.push({ slug: badge.slug, name: badge.name, description: badge.description, tier: badge.tier })
  }

  await grant("first_session")
  const hour = startedAt.getHours() // approximate; production uses tz-aware hour
  if (hour >= 0 && hour < 4) await grant("night_owl")
  if (hour < 6) await grant("early_bird")
  if (sessionMinutes >= 240) await grant("marathon")
  if ((streak?.current ?? 0) >= 7) await grant("streak_7")
  if ((streak?.current ?? 0) >= 30) await grant("streak_30")
  if ((streak?.current ?? 0) >= 100) await grant("streak_100")
  const level = profile ? levelForXp(profile.totalXp + sessionMinutes * XP_PER_MINUTE) : 1
  if (level >= 10) await grant("level_10")
  if (level >= 25) await grant("level_25")

  return awarded
}

function sameDay(a: Date, b: Date) {
  return a.getTime() === b.getTime()
}

// Analytics event (sandbox: persisted as a Notification of type "system" +
// would forward to PostHog in production). Kept lightweight here.
export async function trackEvent(userId: string | null, event: string, props: Record<string, any> = {}) {
  // Production: posthog.capture(...). Sandbox: no-op persistence.
  void userId; void event; void props
}
