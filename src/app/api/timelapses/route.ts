import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, badRequest, getAuth } from "@/lib/api"

// GET /api/timelapses — list the authed user's timelapses (metadata + thumbnail
// signed URL only — NEVER the video). Paginated. The profile Timelapses
// section loads this to render thumbnails; clicking a thumbnail requests a
// signed video URL separately.
export async function GET(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const url = new URL(req.url)
  const limit = Math.min(50, Math.max(1, Number(url.searchParams.get("limit") || 20)))
  const cursor = url.searchParams.get("cursor") // ISO createdAt for cursor pagination

  const where: any = { userId: ctx.userId }
  if (cursor) where.createdAt = { lt: new Date(cursor) }

  const timelapses = await db.timelapse.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit + 1, // +1 to detect hasNext
    select: {
      id: true,
      studySessionId: true,
      roomId: true,
      studyDurationSeconds: true,
      timelapseDurationSeconds: true,
      width: true,
      height: true,
      fileSizeBytes: true,
      status: true,
      visibility: true,
      failureReason: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  const hasNext = timelapses.length > limit
  const items = hasNext ? timelapses.slice(0, limit) : timelapses
  const nextCursor = hasNext ? items[items.length - 1].createdAt.toISOString() : null

  return ok({
    timelapses: items,
    nextCursor,
  })
}
