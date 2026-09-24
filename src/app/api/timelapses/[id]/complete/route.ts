import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, notFound, badRequest, getAuth } from "@/lib/api"
import { uploadTimelapseVideo, uploadTimelapseThumb, timelapseVideoPath, timelapseThumbPath, timelapseBucketExists, isStorageConfigured } from "@/lib/timelapse-storage"

// POST /api/timelapses/[id]/complete
// Receives the final compressed timelapse video (multipart/form-data) + an
// optional thumbnail, uploads them to the PRIVATE Supabase Storage bucket,
// and marks the Timelapse row as READY. The body size is capped by Vercel's
// request limit; the client sends the original-resolution WebM. We set a
// runtime duration limit via the route segment
// config.
//
// The video is NEVER proxied through Vercel for playback — only this one-time
// upload passes through Vercel, then Storage serves it via signed URLs.
//
// Auth + ownership: the timelapse must belong to the authed user. A user
// cannot complete another user's timelapse.
export const runtime = "nodejs"
export const maxDuration = 60 // allow up to 60s for the upload to Storage

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const { id } = await params

  // Ownership check
  const timelapse = await db.timelapse.findUnique({ where: { id } })
  if (!timelapse || timelapse.userId !== ctx.userId) return notFound("Timelapse not found")

  // ── Check Storage is fully configured BEFORE parsing the body ──
  // If the service-role key isn't set OR the bucket doesn't exist, fail fast
  // with a clear actionable error instead of parsing a large upload only to
  // fail with a confusing message.
  const cfg = isStorageConfigured()
  if (!cfg.ok) {
    await db.timelapse.update({
      where: { id },
      data: { status: "FAILED", failureReason: cfg.reason },
    })
    return badRequest(cfg.reason ?? "Storage not configured", "STORAGE_NOT_CONFIGURED")
  }
  const bucketReady = await timelapseBucketExists()
  if (!bucketReady) {
    await db.timelapse.update({
      where: { id },
      data: { status: "FAILED", failureReason: "Storage bucket 'timelapses' not found. Create a private bucket named 'timelapses' in the Supabase Dashboard → Storage." },
    })
    return badRequest(
      "Storage bucket 'timelapses' not found. Create a private bucket named 'timelapses' in the Supabase Dashboard → Storage, then try again.",
      "BUCKET_NOT_FOUND"
    )
  }

  // Parse multipart form (video + optional thumb).
  let video: Buffer | null = null
  let thumb: Buffer | null = null
  let videoContentType = "video/webm"
  let thumbContentType = "image/webp"
  let width: number | null = null
  let height: number | null = null
  try {
    const form = await req.formData()
    const videoFile = form.get("video")
    const thumbFile = form.get("thumb")
    const widthValue = Number(form.get("width"))
    const heightValue = Number(form.get("height"))
    if (Number.isFinite(widthValue) && widthValue >= 1 && widthValue <= 8192) width = Math.round(widthValue)
    if (Number.isFinite(heightValue) && heightValue >= 1 && heightValue <= 8192) height = Math.round(heightValue)
    if (videoFile && videoFile instanceof File) {
      videoContentType = videoFile.type || "video/webm"
      const ab = await videoFile.arrayBuffer()
      video = Buffer.from(ab)
    }
    if (thumbFile && thumbFile instanceof File) {
      thumbContentType = thumbFile.type || "image/webp"
      const ab = await thumbFile.arrayBuffer()
      thumb = Buffer.from(ab)
    }
  } catch (e: any) {
    return badRequest("Invalid upload")
  }

  if (!video) return badRequest("Video is required")

  // Hard cap on upload size (defense against a malicious large upload).
  const MAX_VIDEO = 100 * 1024 * 1024 // Preserve HD source quality; cap only abusive uploads.
  const MAX_THUMB = 512 * 1024 // 512 KB (target 50–150 KB)
  if (video.byteLength > MAX_VIDEO) return badRequest("Video too large (max 100 MB)")
  if (thumb && thumb.byteLength > MAX_THUMB) return badRequest("Thumbnail too large (max 512 KB)")

  // Upload to Storage (server-side, service-role key).
  try {
    const videoPath = timelapseVideoPath(ctx.userId, id)
    const { sizeBytes } = await uploadTimelapseVideo(ctx.userId, id, video, videoContentType)

    let thumbPath: string | null = null
    if (thumb) {
      const r = await uploadTimelapseThumb(ctx.userId, id, thumb, thumbContentType)
      thumbPath = r.path
    }

    // Mark READY with the real storage path + size.
    await db.timelapse.update({
      where: { id },
      data: {
        storagePath: videoPath,
        thumbnailPath: thumbPath,
        fileSizeBytes: sizeBytes,
        ...(width && height ? { width, height } : {}),
        status: "READY",
        failureReason: null,
      },
    })

    return ok({ id, status: "READY", fileSizeBytes: sizeBytes, thumbnailPath: thumbPath })
  } catch (e: any) {
    // Upload failed — mark FAILED, keep the row so the user can retry.
    await db.timelapse.update({
      where: { id },
      data: { status: "FAILED", failureReason: e?.message ?? "upload_failed" },
    })
    return badRequest(e?.message ?? "Upload failed", "UPLOAD_FAILED")
  }
}
