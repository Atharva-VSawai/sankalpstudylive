import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { unauthorized, notFound, getAuth } from "@/lib/api"
import { createTimelapseThumbSignedUrl } from "@/lib/timelapse-storage"

// GET /api/timelapses/[id]/thumb
// Returns a short-lived signed URL for the thumbnail (or a 404 if no thumb).
// Only the owner can request it. The profile list uses this to render
// thumbnails WITHOUT loading the videos (egress control).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const { id } = await params
  const timelapse = await db.timelapse.findUnique({ where: { id } })
  if (!timelapse || timelapse.userId !== ctx.userId) return notFound("Timelapse not found")
  if (!timelapse.thumbnailPath) return notFound("No thumbnail")
  const url = await createTimelapseThumbSignedUrl(ctx.userId, id)
  if (!url) return notFound("Could not generate thumbnail URL")
  // Return a redirect to the signed URL so the <img> can load it directly.
  return NextResponse.redirect(url, { status: 302 })
}
