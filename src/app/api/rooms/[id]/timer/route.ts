import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, notFound, unauthorized, badRequest, getAuth } from "@/lib/api"
import { setTimer, stopTimer, getTimer, postMessage } from "@/lib/presence"

// POST /api/rooms/[id]/timer
// Body: { action: "start" | "stop", mode?: "focus"|"break", minutes?: number }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const { id } = await params
  const room = await db.room.findUnique({ where: { id } })
  if (!room) return notFound("Room not found")

  const member = await db.roomMember.findUnique({
    where: { roomId_userId: { roomId: id, userId: ctx.userId } },
  })
  if (!member) return badRequest("Join the room first", "NOT_MEMBER")

  // Only host/co-host can control the shared timer
  if (member.role === "viewer" || member.role === "participant") {
    if (room.ownerId !== ctx.userId) return badRequest("Only the host can control the shared timer", "NOT_HOST")
  }

  const body = await req.json().catch(() => ({}))
  const action = String(body?.action || "start")

  if (action === "stop") {
    stopTimer(id)
    const profile = await db.profile.findUnique({ where: { userId: ctx.userId } })
    postMessage(id, "system", "System", "Timer stopped", true)
    return ok({ timer: getTimer(id) })
  }

  const mode = body?.mode === "break" ? "break" : "focus"
  const config = safeParse(room.pomodoroConfig)
  const minutes = Number(body?.minutes) || (mode === "break" ? config.breakMin : config.focusMin)
  if (minutes < 1 || minutes > 180) return badRequest("Timer must be 1–180 minutes")

  const profile = await db.profile.findUnique({ where: { userId: ctx.userId } })
  const timer = setTimer(id, mode, minutes, ctx.userId)
  postMessage(id, "system", "System", `${profile?.displayName ?? "Host"} started a ${minutes} min ${mode} timer`, true)
  return ok({ timer })
}

function safeParse(s: string) {
  try { return JSON.parse(s) } catch { return { focusMin: 25, breakMin: 5, longBreakMin: 15, rounds: 4 } }
}
