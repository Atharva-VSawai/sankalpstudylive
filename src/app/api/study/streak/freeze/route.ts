import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, badRequest, getAuth } from "@/lib/api"
import { activateFreeze } from "@/lib/study"

// POST /api/study/streak/freeze — activate a streak freeze for today
export async function POST(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const user = await db.user.findUnique({ where: { id: ctx.userId } })
  const tz = user?.timezone ?? "Asia/Kolkata"
  try {
    const streak = await activateFreeze(ctx.userId, tz)
    return ok({
      streak: {
        current: streak.current,
        longest: streak.longest,
        lastStudyDate: streak.lastStudyDate,
        freezesAvailable: streak.freezesAvailable,
        freezesUsed: streak.freezesUsed,
        lastFreezeDate: streak.lastFreezeDate,
      },
    })
  } catch (e: any) {
    const code = e.message
    const msg =
      code === "NO_FREEZES" ? "You have no streak freezes left" :
      code === "ALREADY_STUDIED_TODAY" ? "You already studied today — no freeze needed" :
      code === "ALREADY_FROZEN_TODAY" ? "You already activated a freeze today" :
      "Could not activate freeze"
    return badRequest(msg, code)
  }
}

// GET /api/study/streak/freeze — get freeze status
export async function GET(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const streak = await db.streak.findUnique({ where: { userId: ctx.userId } })
  return ok({
    freezesAvailable: streak?.freezesAvailable ?? 0,
    freezesUsed: streak?.freezesUsed ?? 0,
    lastFreezeDate: streak?.lastFreezeDate ?? null,
  })
}
