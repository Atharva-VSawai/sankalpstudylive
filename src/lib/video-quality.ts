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
// The caps are intentionally expressed as LiveKit VideoQuality levels (LOW /
// MEDIUM / HIGH) which map to simulcast layers, not as pixel dimensions, so
// LiveKit Adaptive Stream + Dynacast + simulcast continue to work correctly
// (the subscriber receives the capped layer; the publisher still publishes a
// full simulcast stack).
//
//   FREE subscriber: remote grid max = LOW    (~180p–240p layer)
//   PAID subscriber: remote grid max = MEDIUM (~360p layer)
//   LOCAL publisher: camera capture = 720p (h720 preset)
//
// These numbers are intentionally NOT 1080p to keep bandwidth/CPU reasonable
// for a study-room product. See docs/architecture.md §Video for rationale.

export type VideoTier = "free" | "paid"

export type VideoQualityPolicy = {
  tier: VideoTier
  // Subscriber-side cap for REMOTE camera tracks in the grid view.
  // Expressed as a LiveKit VideoQuality level: "LOW" | "MEDIUM" | "HIGH".
  // The client calls `publication.setVideoQuality(VideoQuality.X)` on each
  // remote camera publication to cap the received simulcast layer. This is a
  // subscriber-side control — the publisher's camera quality is NOT reduced.
  remoteGridMaxQuality: "LOW" | "MEDIUM" | "HIGH"
  // Pixel dimensions the client uses to hint LiveKit Adaptive Stream for the
  // rendered tile size. Adaptive Stream uses the video element's actual
  // rendered size to pick a layer; we cap the *requested* dimensions so even
  // a large tile never receives a layer above the tier cap.
  remoteGridMaxHeightPx: number
  // Local camera capture preset name (livekit-client VideoPresets).
  // h720 = 1280×720 @ 30fps. We do NOT use h1080 — 720p is plenty for a local
  // preview and keeps uplink bandwidth + CPU low.
  localCapturePreset: "h720"
}

export const VIDEO_QUALITY_POLICIES: Record<VideoTier, VideoQualityPolicy> = {
  free: {
    tier: "free",
    // Free users: cap remote grid video at LOW (~180p–240p simulcast layer).
    // This is enough to clearly see the participant while minimizing bandwidth.
    remoteGridMaxQuality: "LOW",
    remoteGridMaxHeightPx: 240,
    localCapturePreset: "h720",
  },
  paid: {
    tier: "paid",
    // Paid users: cap remote grid video at MEDIUM (~360p simulcast layer).
    remoteGridMaxQuality: "MEDIUM",
    remoteGridMaxHeightPx: 360,
    localCapturePreset: "h720",
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
    remoteGridMaxHeightPx: p.remoteGridMaxHeightPx,
    localCapturePreset: p.localCapturePreset,
  }
}

export type VideoQualityPolicyResponse = ReturnType<typeof videoQualityPolicyToResponse>
