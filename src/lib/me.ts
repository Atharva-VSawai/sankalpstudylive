import { db } from "@/lib/db"

export type MeResponse = {
  id: string
  email: string
  // True only when the local account has a password hash. OAuth-only users
  // must not be asked for a password they never created.
  hasPassword: boolean
  role: string
  status: string
  profile: any
  streak: {
    current: number
    longest: number
    lastStudyDate: Date | null
    freezesAvailable: number
    freezesUsed: number
    lastFreezeDate: Date | null
  } | null
}

export async function loadMe(userId: string): Promise<MeResponse> {
  const [user, studyTotal] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, include: { profile: true, streak: true } }),
    db.studySession.aggregate({ where: { userId, endedAt: { not: null } }, _sum: { durationMin: true } }),
  ])
  if (!user || !user.profile) throw new Error("user_missing")
  return {
    id: user.id,
    email: user.email,
    hasPassword: Boolean(user.passwordHash),
    role: user.role,
    status: user.status,
    // StudySession is the authoritative lifetime study total. The profile
    // counter is retained for compatibility but may contain legacy drift.
    profile: { ...user.profile, totalMinutes: studyTotal._sum.durationMin ?? 0 },
    streak: user.streak
      ? {
          current: user.streak.current,
          longest: user.streak.longest,
          lastStudyDate: user.streak.lastStudyDate,
          freezesAvailable: user.streak.freezesAvailable,
          freezesUsed: user.streak.freezesUsed,
          lastFreezeDate: user.streak.lastFreezeDate,
        }
      : null,
  }
}
