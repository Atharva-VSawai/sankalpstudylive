import { after, NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, notFound, badRequest, getAuth } from "@/lib/api"
import { applySessionEffects, closeSession } from "@/app/api/study/sessions/route"
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
  if (session.endedAt) {
    after(async () => {
      const allowance = await db.freeRoomAllowance.findUnique({ where: { userId: ctx.userId }, select: { activeSessionId: true } })
      if (session.roomId && allowance?.activeSessionId === session.id) await closeActiveLiveRoomSession(ctx.userId)
    })
    return ok({ alreadyStopped: true, sessionId: session.id, durationMin: session.durationMin, xpEarned: session.xpEarned })
  }

  // Only the StudySession claim is awaited. The user timezone and all
  // secondary writes happen after the response, so the exit interaction is
  // not held behind profile/streak/badge/allowance database round trips.
  const result = await closeSession(id, "Asia/Kolkata", undefined, { deferSideEffects: true })

  // The StudySession claim above is the only data required to show the
  // summary. Run XP/streak/goal/badge analytics after the response is ready,
  // so leaving a room is not held behind those unrelated writes.
  after(async () => {
    // Accrue live-room time only when this exact session is still active in
    // the allowance row. This preserves stale-leave protection.
    const allowance = await db.freeRoomAllowance.findUnique({ where: { userId: ctx.userId }, select: { activeSessionId: true } })
    if (session.roomId && allowance?.activeSessionId === session.id) await closeActiveLiveRoomSession(ctx.userId)

    if (result && (result as any).effectsPending) {
      const finalized = await db.studySession.findUnique({ where: { id } })
      if (!finalized || finalized.durationMin < 1) return
      const user = await db.user.findUnique({ where: { id: ctx.userId }, select: { timezone: true } })
      await applySessionEffects(finalized, user?.timezone ?? "Asia/Kolkata", finalized.durationMin, finalized.xpEarned)
    }
  })

  return ok({ stopped: true, sessionId: session.id, ...(result as any) })
}
