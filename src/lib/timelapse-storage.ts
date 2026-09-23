import { createServerClient } from "@/lib/supabase"

// ─────────────────────────────────────────────────────────────────────────────
// SUPABASE STORAGE — Study Timelapses (server-side only).
// ─────────────────────────────────────────────────────────────────────────────
// The `timelapses` bucket is PRIVATE. All access is server-side via the
// service-role key (never exposed to the browser). Playback uses short-lived
// signed URLs generated after ownership verification.
//
// Storage layout:
//   timelapses/{userId}/{timelapseId}/video.webm   (the final compressed timelapse)
//   timelapses/{userId}/{timelapseId}/thumb.webp  (one small thumbnail)
//
// The service-role key is required because the bucket is private and we need
// to upload + create signed URLs server-side. The publishable key cannot write
// to a private bucket.

const BUCKET = "timelapses"
const SIGNED_URL_TTL_SEC = 300 // 5 minutes — short-lived, on-demand only

// ── Path helpers ──
export function timelapseVideoPath(userId: string, timelapseId: string): string {
  return `${userId}/${timelapseId}/video.webm`
}
export function timelapseThumbPath(userId: string, timelapseId: string): string {
  return `${userId}/${timelapseId}/thumb.webp`
}

// ── Ensure the private bucket exists (idempotent). ──
// Called once on server boot or lazily on first use. If the bucket doesn't
// exist, create it as private. If it already exists, this is a no-op.
export async function ensureTimelapseBucket(): Promise<void> {
  const supabase = createServerClient()
  const { data, error } = await supabase.storage.listBuckets()
  if (error) {
    // If listing fails, the service key may not be configured — fall through;
    // the individual upload/getSignedUrl calls will surface a clear error.
    console.error("[timelapse-storage] could not list buckets:", error.message)
    return
  }
  const exists = (data ?? []).some((b) => b.name === BUCKET)
  if (!exists) {
    const { error: createErr } = await supabase.storage.createBucket(BUCKET, {
      public: false, // PRIVATE — never make this public
      fileSizeLimit: 20 * 1024 * 1024, // 20 MB hard cap (target is 2–6 MB)
      allowedMimeTypes: ["video/webm", "image/webp", "image/jpeg"],
    })
    if (createErr) {
      // If create fails (e.g. already exists from a race, or permission),
      // log and continue — uploads will fail with a clearer error.
      console.error("[timelapse-storage] could not create bucket:", createErr.message)
    }
  }
}

// ── Upload the final compressed timelapse video (server-side, from a Buffer). ──
// The browser sends the already-compressed WebM blob to the
// /api/timelapses/[id]/complete endpoint, which forwards it here. Vercel's
// request body size limit applies (see route config), so the file must be
// small (2–6 MB target).
export async function uploadTimelapseVideo(
  userId: string,
  timelapseId: string,
  video: Buffer,
  contentType = "video/webm"
): Promise<{ path: string; sizeBytes: number }> {
  const supabase = createServerClient()
  const path = timelapseVideoPath(userId, timelapseId)
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, video, { contentType, upsert: true })
  if (error) throw new Error(`upload video failed: ${error.message}`)
  return { path, sizeBytes: video.byteLength }
}

// ── Upload the thumbnail (server-side, from a Buffer). ──
export async function uploadTimelapseThumb(
  userId: string,
  timelapseId: string,
  thumb: Buffer,
  contentType = "image/webp"
): Promise<{ path: string; sizeBytes: number }> {
  const supabase = createServerClient()
  const path = timelapseThumbPath(userId, timelapseId)
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, thumb, { contentType, upsert: true })
  if (error) throw new Error(`upload thumb failed: ${error.message}`)
  return { path, sizeBytes: thumb.byteLength }
}

// ── Generate a short-lived signed URL for playback (server-side, after
// ownership verification in the API route). ──
export async function createTimelapseSignedUrl(
  userId: string,
  timelapseId: string,
  ttlSec = SIGNED_URL_TTL_SEC
): Promise<string | null> {
  const supabase = createServerClient()
  const path = timelapseVideoPath(userId, timelapseId)
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, ttlSec)
  if (error) {
    console.error("[timelapse-storage] signed url failed:", error.message)
    return null
  }
  return data?.signedUrl ?? null
}

// ── Generate a short-lived signed URL for the thumbnail (server-side). ──
export async function createTimelapseThumbSignedUrl(
  userId: string,
  timelapseId: string,
  ttlSec = SIGNED_URL_TTL_SEC
): Promise<string | null> {
  const supabase = createServerClient()
  const path = timelapseThumbPath(userId, timelapseId)
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, ttlSec)
  if (error) return null
  return data?.signedUrl ?? null
}

// ── Delete the video + thumbnail from Storage (server-side, on user delete). ──
// Returns true if both deleted (or already absent). Returns false if any
// deletion failed — the caller must NOT claim success in that case.
export async function deleteTimelapseFiles(
  userId: string,
  timelapseId: string
): Promise<boolean> {
  const supabase = createServerClient()
  const videoPath = timelapseVideoPath(userId, timelapseId)
  const thumbPath = timelapseThumbPath(userId, timelapseId)
  // Supabase supports deleting multiple paths in one call.
  const { error } = await supabase.storage
    .from(BUCKET)
    .remove([videoPath, thumbPath])
  if (error) {
    console.error("[timelapse-storage] delete failed:", error.message)
    return false
  }
  return true
}
