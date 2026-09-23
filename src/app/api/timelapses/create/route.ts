import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, badRequest, getAuth } from "@/lib/api"
import { ensureTimelapseBucket } from "@/lib/timelapse-storage"

// POST /api/timelapses/create
// Body: { studySessionId?: string, roomId?: string }
// Creates a Timelapse row with status=PROCESSING. The browser calls this when
// it has a finalized timelapse blob ready to upload, then calls
// /api/timelapses/[id]/complete with the video blob.
//
// The study duration is NOT taken from the client — it's computed from the
// StudySession (server-authoritative). The browser cannot fake it.
export async function POST(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const body = await req.json().catch(() => ({}))
  const studySessionId = body?.studySessionId ? String(body.studySessionId) : null
  const roomId = body?.roomId ? String(body.roomId) : null

  // Compute the server-authoritative study duration from the StudySession.
  let studyDurationSeconds = 0
  if (studySessionId) {
    const session = await db.studySession.findUnique({ where: { id: studySessionId } })
    if (!session || session.userId !== ctx.userId) return badRequest("Invalid study session")
    // If the session is still active (no endedAt), use now; else use endedAt.
    const end = session.endedAt ?? new Date()
    studyDurationSeconds = Math.max(0, Math.floor((end.getTime() - session.startedAt.getTime()) / 1000))
  }

  // Compute the final timelapse duration from the study duration (15–60s).
  // Matches timelapseDurationFor() in the client lib.
  const timelapseDurationSeconds = Math.min(60, Math.max(15, Math.round(15 + (studyDurationSeconds / 36000) * 45)))

  await ensureTimelapseBucket()

  const timelapse = await db.timelapse.create({
    data: {
      userId: ctx.userId,
      studySessionId,
      roomId,
      studyDurationSeconds,
      timelapseDurationSeconds,
      status: "PROCESSING",
      visibility: "private",
      storagePath: `pending/${ctx.userId}`, // placeholder; set on complete
    },
  })

  return ok({ id: timelapse.id, status: "PROCESSING" })
}
