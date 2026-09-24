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

// ── Ensure the private bucket exists (best-effort; user may need to create it
// in the Supabase Dashboard). ──
// Supabase Storage has RLS on the `storage.buckets` table by default, so even
// the service-role key cannot create a bucket via the JS SDK. The bucket must
// be created once via the Supabase Dashboard (Storage → New bucket → name:
// "timelapses", Public: NO). If it already exists or gets created, this is a
// no-op. If creation fails (RLS), we log a clear message and continue — the
// upload will then fail with a clear "create the bucket" error that the user
// can act on.
export async function ensureTimelapseBucket(): Promise<{ ready: boolean; reason?: string }> {
  const supabase = createServerClient()
  const { data, error } = await supabase.storage.listBuckets()
  if (error) {
    console.error("[timelapse-storage] could not list buckets:", error.message)
    return { ready: false, reason: "Could not access Supabase Storage. Check SUPABASE_SERVICE_ROLE_KEY." }
  }
  const exists = (data ?? []).some((b) => b.name === BUCKET)
  if (exists) {
    // Keep an older 20 MB bucket configuration from rejecting native-HD
    // timelapses. This is idempotent and does not change the bucket's privacy.
    const { error: updateErr } = await supabase.storage.updateBucket(BUCKET, {
      public: false,
      fileSizeLimit: 100 * 1024 * 1024,
      allowedMimeTypes: ["video/webm", "image/webp", "image/jpeg"],
    })
    if (updateErr) console.warn("[timelapse-storage] could not update bucket limits:", updateErr.message)
    return { ready: true }
  }
  // Try to create it (may fail due to RLS on storage.buckets).
  const { error: createErr } = await supabase.storage.createBucket(BUCKET, {
    public: false,
    fileSizeLimit: 100 * 1024 * 1024,
    allowedMimeTypes: ["video/webm", "image/webp", "image/jpeg"],
  })
  if (createErr) {
    console.error("[timelapse-storage] could not create bucket (create it in the Supabase Dashboard):", createErr.message)
    return { ready: false, reason: `Create a private bucket named "${BUCKET}" in the Supabase Dashboard → Storage.` }
  }
  return { ready: true }
}

// ── Check if the bucket exists (used to give a clear error before attempting
// an upload that would fail with a confusing message). ──
// Returns false if the bucket doesn't exist OR if the service-role key isn't
// configured (in which case listBuckets() returns empty due to RLS).
export async function timelapseBucketExists(): Promise<boolean> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    // Without the service-role key, we can't access Storage (RLS blocks the
    // publishable key). Return false so the caller gives a clear error.
    return false
  }
  const supabase = createServerClient()
  const { data, error } = await supabase.storage.listBuckets()
  if (error) return false
  return (data ?? []).some((b) => b.name === BUCKET)
}

// ── Check if Storage is fully configured (service-role key present + bucket
// exists). Used by the complete route to give a single clear error. ──
export function isStorageConfigured(): { ok: boolean; reason?: string } {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return { ok: false, reason: "NEXT_PUBLIC_SUPABASE_URL is not set." }
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false, reason: "SUPABASE_SERVICE_ROLE_KEY is not set. Add it to your environment (Supabase Dashboard → Project Settings → API → service_role key). The service-role key bypasses Storage RLS so the server can upload + create signed URLs." }
  }
  return { ok: true }
}

// ── Upload the final compressed timelapse video (server-side, from a Buffer). ──
// The browser sends the already-compressed WebM blob to the
// /api/timelapses/[id]/complete endpoint, which forwards it here. Vercel's
// request body size limit applies (see route config); the server still rejects
// abusive uploads while allowing normal HD timelapses.
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
