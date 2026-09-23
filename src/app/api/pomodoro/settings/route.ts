import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, badRequest, getAuth } from "@/lib/api"

// GET /api/pomodoro/settings — returns the user's Pomodoro config
// PUT /api/pomodoro/settings — updates the user's Pomodoro config
// Config: { focusMin, breakMin, longBreakMin, rounds }
// Validation: focusMin 1-180, breakMin 1-60, longBreakMin 1-60, rounds 1-12

const DEFAULTS = { focusMin: 25, breakMin: 5, longBreakMin: 15, rounds: 4 }

export async function GET(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const profile = await db.profile.findUnique({ where: { userId: ctx.userId }, select: { pomodoroConfig: true } })
  const config = safeParse(profile?.pomodoroConfig ?? "{}")
  // merge with defaults so missing fields are always filled
  const merged = { ...DEFAULTS, ...config }
  return ok({ config: merged })
}

export async function PUT(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const body = await req.json().catch(() => ({}))

  const focusMin = Number(body?.focusMin)
  const breakMin = Number(body?.breakMin)
  const longBreakMin = Number(body?.longBreakMin)
  const rounds = Number(body?.rounds)

  // Validate: reject NaN, negative, zero, extremely large
  if (!Number.isFinite(focusMin) || focusMin < 1 || focusMin > 180)
    return badRequest("Focus duration must be 1–180 minutes")
  if (!Number.isFinite(breakMin) || breakMin < 1 || breakMin > 60)
    return badRequest("Short break must be 1–60 minutes")
  if (!Number.isFinite(longBreakMin) || longBreakMin < 1 || longBreakMin > 60)
    return badRequest("Long break must be 1–60 minutes")
  if (!Number.isFinite(rounds) || rounds < 1 || rounds > 12)
    return badRequest("Rounds must be 1–12")

  const config = { focusMin, breakMin, longBreakMin, rounds }
  await db.profile.update({
    where: { userId: ctx.userId },
    data: { pomodoroConfig: JSON.stringify(config) },
  })
  return ok({ config })
}

function safeParse(s: string): Record<string, number> {
  try {
    const v = JSON.parse(s)
    return typeof v === "object" && v ? v : {}
  } catch {
    return {}
  }
}
