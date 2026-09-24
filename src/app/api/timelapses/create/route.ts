import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, getAuth } from "@/lib/api"
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
  const requestedStudySessionId = body?.studySessionId ? String(body.studySessionId) : null
  const roomId = body?.roomId ? String(body.roomId) : null

  // Resolve the session only within the authenticated user's records. The
  // browser's ID can become stale during LiveKit/presence cleanup, so it is a
  // hint rather than a hard dependency for saving a timelapse.
  let session = requestedStudySessionId
    ? await db.studySession.findFirst({ where: { id: requestedStudySessionId, userId: ctx.userId } })
    : null
  if (!session) {
    session = await db.studySession.findFirst({
      where: { userId: ctx.userId, ...(roomId ? { roomId } : {}) },
      orderBy: { startedAt: "desc" },
    })
  }

  // Compute the server-authoritative study duration from the resolved session.
  let studyDurationSeconds = 0
  if (session) {
    // If the session is still active (no endedAt), use now; else use endedAt.
    const end = session.endedAt ?? new Date()
    studyDurationSeconds = Math.max(0, Math.floor((end.getTime() - session.startedAt.getTime()) / 1000))
  }

  // Compute the final timelapse duration from the study duration (1–60s).
  // Matches timelapseDurationFor() in the client lib.
  const timelapseDurationSeconds = timelapseDurationFor(studyDurationSeconds)

  await ensureTimelapseBucket()

  const timelapse = await db.timelapse.create({
    data: {
      userId: ctx.userId,
      studySessionId: session?.id ?? null,
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

function timelapseDurationFor(studySeconds: number): number {
  const points: [number, number][] = [[0, 1], [1800, 5], [3600, 10], [7200, 15], [14400, 30], [21600, 45], [36000, 60]]
  const seconds = Math.max(0, studySeconds)
  for (let i = 1; i < points.length; i++) {
    if (seconds <= points[i][0]) {
      const [x0, y0] = points[i - 1]
      const [x1, y1] = points[i]
      return Math.round(y0 + ((seconds - x0) / (x1 - x0)) * (y1 - y0))
    }
  }
  return 60
}
