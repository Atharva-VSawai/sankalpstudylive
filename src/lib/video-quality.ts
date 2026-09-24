import { isPaidPlanActive } from "@/lib/pricing"

// ─────────────────────────────────────────────────────────────────────────────
// VIDEO QUALITY POLICY — server-authoritative.
// ─────────────────────────────────────────────────────────────────────────────
// A single reusable place that defines the per-entitlement video-quality caps
// for the LiveKit room. The server computes the user's tier (free vs paid) from
// the database subscription record — NEVER from a client-supplied value — and
// returns the caps in the token/entitlement response. The client applies these
// caps via LiveKit's native RemoteTrackPublication.setVideoQuality /
// setVideoDimensions APIs (subscriber-side), so a malicious client that
// manipulates React state / DevTools cannot bypass the intended subscription
// quality.
//
// Pixel and bitrate caps are explicit because a subscriber-side quality hint
// cannot undo an unnecessarily high publisher capture/encoding.
//
//   FREE: 426x240 @ 15fps, 250kbps maximum
//   PAID: 640x400 @ 15fps, 450kbps maximum
//
// These numbers are intentionally NOT 1080p to keep bandwidth/CPU reasonable
// for a study-room product. See docs/architecture.md §Video for rationale.

export type VideoTier = "free" | "paid"

export type VideoQualityPolicy = {
  tier: VideoTier
  // Subscriber-side cap for REMOTE camera tracks in the grid view.
  // Expressed as a LiveKit VideoQuality level: "LOW" | "MEDIUM" | "HIGH".
  // The client applies this as a subscriber-side quality hint in addition to
  // the hard publisher capture/encoding ceiling.
  remoteGridMaxQuality: "LOW" | "MEDIUM" | "HIGH"
  // Pixel dimensions the client uses to hint LiveKit Adaptive Stream for the
  // rendered tile size. Adaptive Stream uses the video element's actual
  // rendered size; this caps the requested dimensions even for a large tile.
  captureWidthPx: number
  captureHeightPx: number
  maxBitrateBps: number
  maxFramerate: number
  remoteGridMaxWidthPx: number
  remoteGridMaxHeightPx: number
}

export const VIDEO_QUALITY_POLICIES: Record<VideoTier, VideoQualityPolicy> = {
  free: {
    tier: "free",
    // One low-bandwidth camera encoding; there is no higher publisher layer.
    remoteGridMaxQuality: "LOW",
    captureWidthPx: 426,
    captureHeightPx: 240,
    maxBitrateBps: 250_000,
    maxFramerate: 15,
    remoteGridMaxWidthPx: 426,
    remoteGridMaxHeightPx: 240,
  },
  paid: {
    tier: "paid",
    // Approximately 400p for paid study-room video.
    remoteGridMaxQuality: "MEDIUM",
    captureWidthPx: 640,
    captureHeightPx: 400,
    maxBitrateBps: 450_000,
    maxFramerate: 15,
    remoteGridMaxWidthPx: 640,
    remoteGridMaxHeightPx: 400,
  },
}

// ── Resolve the quality policy for a user from the DB subscription. ──
// The server calls this; the client must NOT call it (the client cannot be
// trusted to know its own tier). Returns the `paid` policy when the user has
// an active paid plan, else `free`.
export function resolveVideoQualityPolicy(sub: { plan: string; status: string; expiresAt: Date | string | null } | null): VideoQualityPolicy {
  return isPaidPlanActive(sub) ? VIDEO_QUALITY_POLICIES.paid : VIDEO_QUALITY_POLICIES.free
}

// ── Shape returned to the client in the token + entitlement responses. ──
// The client uses `tier` only for UI display ("Free" badge, etc.) and uses
// `remoteGridMaxQuality` / `remoteGridMaxHeightPx` to cap the subscribed
// layers. The server NEVER accepts these values back as authoritative input.
export function videoQualityPolicyToResponse(p: VideoQualityPolicy) {
  return {
    tier: p.tier,
    remoteGridMaxQuality: p.remoteGridMaxQuality,
    captureWidthPx: p.captureWidthPx,
    captureHeightPx: p.captureHeightPx,
    maxBitrateBps: p.maxBitrateBps,
    maxFramerate: p.maxFramerate,
    remoteGridMaxWidthPx: p.remoteGridMaxWidthPx,
    remoteGridMaxHeightPx: p.remoteGridMaxHeightPx,
  }
}

export type VideoQualityPolicyResponse = ReturnType<typeof videoQualityPolicyToResponse>
