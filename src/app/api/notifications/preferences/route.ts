import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, badRequest, getAuth } from "@/lib/api"

// GET /api/notifications/preferences — returns the user's notif prefs map
// PUT /api/notifications/preferences — set prefs { type: bool, ... }
// Only creates notifications server-side for types the user has enabled.

const ALLOWED_TYPES = [
  "friend_request", "friend_accept", "badge_earned", "goal_completed",
  "streak_milestone", "room_invite", "report_update", "system",
]

export async function GET(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const profile = await db.profile.findUnique({ where: { userId: ctx.userId }, select: { notifPrefs: true } })
  const prefs = safeParse(profile?.notifPrefs ?? "{}")
  // Normalize: every allowed type defaults to true if missing
  const normalized: Record<string, boolean> = {}
  for (const t of ALLOWED_TYPES) normalized[t] = prefs[t] !== false
  return ok({ preferences: normalized })
}

export async function PUT(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const body = await req.json().catch(() => ({}))
  // Accept either { type, enabled } or { preferences: { type: bool, ... } }
  let next: Record<string, boolean> = {}
  if (body?.type && typeof body?.enabled === "boolean") {
    if (!ALLOWED_TYPES.includes(body.type)) return badRequest("Invalid notification type")
    next[body.type] = body.enabled
  } else if (body?.preferences && typeof body.preferences === "object") {
    for (const [k, v] of Object.entries(body.preferences)) {
      if (ALLOWED_TYPES.includes(k)) next[k] = Boolean(v)
    }
    if (Object.keys(next).length === 0) return badRequest("No valid preferences")
  } else {
    return badRequest("Expected { type, enabled } or { preferences: {...} }")
  }

  const profile = await db.profile.findUnique({ where: { userId: ctx.userId }, select: { notifPrefs: true } })
  const current = safeParse(profile?.notifPrefs ?? "{}")
  const merged = { ...current, ...next }
  await db.profile.update({ where: { userId: ctx.userId }, data: { notifPrefs: JSON.stringify(merged) } })

  // Return normalized
  const normalized: Record<string, boolean> = {}
  for (const t of ALLOWED_TYPES) normalized[t] = merged[t] !== false
  return ok({ preferences: normalized })
}

function safeParse(s: string): Record<string, boolean> {
  try { const v = JSON.parse(s); return typeof v === "object" && v ? v : {} } catch { return {} }
}

// Helper for other routes: should we create a notification of this type for this user?
export async function isNotifEnabled(userId: string, type: string): Promise<boolean> {
  if (!ALLOWED_TYPES.includes(type)) return true
  const profile = await db.profile.findUnique({ where: { userId }, select: { notifPrefs: true } })
  const prefs = safeParse(profile?.notifPrefs ?? "{}")
  return prefs[type] !== false
}
