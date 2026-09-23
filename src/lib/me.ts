import { db } from "@/lib/db"

export type MeResponse = {
  id: string
  email: string
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
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { profile: true, streak: true },
  })
  if (!user || !user.profile) throw new Error("user_missing")
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    profile: user.profile,
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
