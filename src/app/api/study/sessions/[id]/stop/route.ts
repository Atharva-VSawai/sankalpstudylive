import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, notFound, badRequest, getAuth } from "@/lib/api"
import { closeSession } from "@/app/api/study/sessions/route"
import { closeActiveLiveRoomSession } from "@/lib/entitlement"

// POST /api/study/sessions/[id]/stop — stop a study session (server computes duration)
//
// This is called when the user leaves a room (clean leave) or when the room
// view unmounts. It does TWO things:
//   1. Closes the StudySession row (computes duration server-side, awards XP,
//      bumps streak/goal/badges).
//   2. Closes the active live-room session on FreeRoomAllowance (accrues the
//      live-elapsed seconds into consumedSeconds). This is the server-authoritative
//      free-allowance accounting. Idempotent: safe to call when no active session.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const { id } = await params
  const session = await db.studySession.findUnique({ where: { id } })
  if (!session) return notFound("Session not found")
  if (session.userId !== ctx.userId) return badRequest("Not your session", "FORBIDDEN")
  if (session.endedAt) return ok({ alreadyStopped: true, durationMin: session.durationMin, xpEarned: session.xpEarned })

  const user = await db.user.findUnique({ where: { id: ctx.userId } })
  const result = await closeSession(id, user?.timezone ?? "Asia/Kolkata")

  // ── Accrue live-room time into the global free allowance ──
  // Only accrue if this session was the active live-room session. If the user
  // already started a new session elsewhere, the prior one was already accrued
  // by beginLiveRoomSession. closeActiveLiveRoomSession is a no-op in that case
  // (it only closes the session whose activeSessionId matches, which we verify
  // by checking the row state).
  const allowance = await db.freeRoomAllowance.findUnique({ where: { userId: ctx.userId }, select: { activeSessionId: true } })
  if (session.roomId && allowance?.activeSessionId === session.id) {
    await closeActiveLiveRoomSession(ctx.userId)
  }

  return ok({ stopped: true, ...(result as any) })
}
