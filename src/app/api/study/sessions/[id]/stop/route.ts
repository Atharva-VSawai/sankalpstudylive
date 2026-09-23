import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, notFound, badRequest, getAuth } from "@/lib/api"
import { closeSession } from "@/app/api/study/sessions/route"

// POST /api/study/sessions/[id]/stop — stop a study session (server computes duration)
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
  return ok({ stopped: true, ...(result as any) })
}
