"use client"

import { Room, VideoQuality, RemoteTrackPublication, Track, VideoPreset } from "livekit-client"

// ─────────────────────────────────────────────────────────────────────────────
// Client-side video quality helper — applies the SERVER-AUTHORITATIVE policy.
// ─────────────────────────────────────────────────────────────────────────────
// The policy comes from the token/entitlement response (server computes it
// from the DB subscription — never trusted from client state). This module is
// the single place that translates the policy into LiveKit API calls:
//
//   - Room options: adaptiveStream + dynacast + one entitlement-capped encoding.
//   - Per-remote-camera-track: setVideoDimensions/setVideoQuality cap the
//     subscriber request (and the publisher is capped independently).
//   - Off-screen tiles: setSubscribed(false) when a tile
//     is scrolled out of view (complements LiveKit Adaptive Stream).
//
// A malicious client that manipulates React state / DevTools can call these
// functions with different values, but the server still enforces the real
// entitlement via the token + heartbeat endpoints (the room closes at 00:00
// regardless of client-side quality manipulation). The quality caps here are a
// bandwidth/cost optimization, not an access-control mechanism.

export type ClientVideoPolicy = {
  tier: "free" | "paid"
  remoteGridMaxQuality: "LOW" | "MEDIUM" | "HIGH"
  remoteGridMaxHeightPx: number
  captureWidthPx: number
  captureHeightPx: number
  maxBitrateBps: number
  maxFramerate: number
  remoteGridMaxWidthPx: number
}

// Map the policy's quality string to the livekit-client VideoQuality enum.
function toVideoQuality(q: "LOW" | "MEDIUM" | "HIGH"): VideoQuality {
  if (q === "HIGH") return VideoQuality.HIGH
  if (q === "MEDIUM") return VideoQuality.MEDIUM
  return VideoQuality.LOW
}

// ── Build the Room options for the user's policy. ──
// adaptiveStream: true → LiveKit observes each <video> element's rendered size
//   and visibility to pick an appropriate simulcast layer, and pauses delivery
//   when the element is not visible. This is the PRIMARY mechanism for
//   "only load visible videos" — we do NOT build a competing system.
// dynacast: true → the publisher pauses unused simulcast layers when no
//   subscriber needs them (saves uplink bandwidth/CPU).
// videoCaptureDefaults + videoEncoding are the hard capture/publish ceiling.
// Simulcast is disabled because Sankalp has no high-resolution spotlight and
// every camera is intentionally capped to one low-bandwidth stream.
export function buildRoomOptions(policy: ClientVideoPolicy) {
  const encoding = new VideoPreset({
    width: policy.captureWidthPx,
    height: policy.captureHeightPx,
    maxBitrate: policy.maxBitrateBps,
    maxFramerate: policy.maxFramerate,
  })
  return {
    adaptiveStream: true,
    dynacast: true,
    videoCaptureDefaults: {
      resolution: { width: policy.captureWidthPx, height: policy.captureHeightPx, frameRate: policy.maxFramerate },
    },
    publishDefaults: {
      videoEncoding: encoding.encoding,
      videoSimulcastLayers: [],
      simulcast: false,
    },
  }
}

// ── Apply the subscriber-side cap to a single remote camera publication. ──
// Called once per remote camera track, AND re-asserted periodically because
// LiveKit Adaptive Stream continuously re-evaluates the video element's rendered
// size and can override a one-time setVideoQuality call — which would let the
// subscribed layer creep back up to the publisher's HD layer and increase
// LiveKit billing. We use setVideoDimensions as the PRIMARY persistent cap
// because Adaptive Stream respects `requestedVideoDimensions` as a max (it
// only overrides when requestedVideoDimensions is void). We also call
// setVideoQuality as a belt-and-suspenders backstop.
//
// Returns true if a cap was applied (track is a remote camera), false otherwise.
export function applyRemoteQualityCap(
  pub: RemoteTrackPublication | undefined,
  policy: ClientVideoPolicy
): boolean {
  if (!pub) return false
  if (pub.source !== Track.Source.Camera) return false
  try {
    // PRIMARY cap: setVideoDimensions sets `requestedVideoDimensions`, which
    // Adaptive Stream does NOT override (it only overrides when this is void).
    // This is the persistent cap that keeps the subscribed layer at/below the
    // policy max for the entire subscription lifetime, regardless of how large
    // the rendered <video> element is.
    pub.setVideoDimensions({
      width: policy.remoteGridMaxWidthPx,
      height: policy.remoteGridMaxHeightPx,
    })
    // Also cap temporal resolution on subscribers. This is effective for
    // simulcast publications and reduces bitrate even when a legacy publisher
    // has not yet adopted Sankalp's single-layer publish policy.
    pub.setVideoFPS(policy.maxFramerate)
    // BELT-AND-SUSPENDERS: also set the max quality level. When
    // requestedVideoDimensions is set, LiveKit uses the SMALLER of the two
    // (dimensions vs max-quality layer), so this never raises the cap above
    // setVideoDimensions; it just adds a second floor.
    pub.setVideoQuality(toVideoQuality(policy.remoteGridMaxQuality))
    return true
  } catch {
    return false
  }
}

// ── Re-assert the quality cap on a single remote camera publication. ──
// Called on a short interval (e.g. every 3s) and on TrackStreamStateChanged
// events to defend against Adaptive Stream overriding the cap. Safe to call
// repeatedly — setVideoDimensions/setVideoQuality are no-ops if the values
// haven't changed (LiveKit deduplicates the update message).
export function reassertRemoteQualityCap(
  pub: RemoteTrackPublication | undefined,
  policy: ClientVideoPolicy
): void {
  applyRemoteQualityCap(pub, policy)
}

// ── Pause a remote track when its tile is scrolled off-screen. ──
// Complements LiveKit Adaptive Stream: Adaptive Stream pauses delivery when
// the <video> element is not visible (display:none / detached), but a tile
// that is still in the DOM but scrolled out of the viewport may not trigger
// that. We explicitly set the quality to LOW and mark the subscription
// paused so the server stops forwarding that track's media.
export function pauseRemoteTrack(pub: RemoteTrackPublication | undefined): void {
  if (!pub) return
  if (pub.source !== Track.Source.Camera) return
  try {
    pub.setSubscribed(false)
    pub.setVideoQuality(VideoQuality.LOW)
  } catch {}
}

// ── Resume a remote track when its tile scrolls back into view. ──
// Re-applies the policy cap. LiveKit Adaptive Stream then re-evaluates the
// rendered size and picks the appropriate layer (up to the cap).
export function resumeRemoteTrack(pub: RemoteTrackPublication | undefined, policy: ClientVideoPolicy): void {
  if (pub?.source === Track.Source.Camera) {
    try { pub.setSubscribed(true) } catch {}
  }
  applyRemoteQualityCap(pub, policy)
}

// ── Apply the policy to ALL remote camera tracks in the room. ──
// Called once after connecting (and after the policy is known) to cap every
// existing remote camera. New remotes are capped via the TrackSubscribed event.
export function applyPolicyToAllRemoteTracks(room: Room, policy: ClientVideoPolicy): number {
  let applied = 0
  for (const p of room.remoteParticipants.values()) {
    for (const pub of p.getTrackPublications()) {
      if (applyRemoteQualityCap(pub as RemoteTrackPublication, policy)) applied++
    }
  }
  return applied
}

// ── Dev diagnostics: count subscribed remote video tracks. ──
export function countSubscribedRemoteVideoTracks(room: Room | null): number {
  if (!room) return 0
  let n = 0
  for (const p of room.remoteParticipants.values()) {
    for (const pub of p.getTrackPublications()) {
      if (pub.source === Track.Source.Camera && pub.isSubscribed) n++
    }
  }
  return n
}
