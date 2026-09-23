import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, notFound, forbidden, getAuth } from "@/lib/api"
import { createTimelapseSignedUrl } from "@/lib/timelapse-storage"

// GET /api/timelapses/[id]/signed-url
// Generates a short-lived signed URL for the video. Only the owner can request
// it. The signed URL expires after 5 minutes. It is returned in the response
// body (never logged). The client uses it to play the one video on demand.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const { id } = await params
  const timelapse = await db.timelapse.findUnique({ where: { id } })
  if (!timelapse || timelapse.userId !== ctx.userId) return notFound("Timelapse not found")
  if (timelapse.status !== "READY") return forbidden("Timelapse is not ready", "NOT_READY")
  const url = await createTimelapseSignedUrl(ctx.userId, id)
  if (!url) return notFound("Could not generate signed URL")
  return ok({ url, expiresInSec: 300 })
}
