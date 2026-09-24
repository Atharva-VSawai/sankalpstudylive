"use client"

// ─────────────────────────────────────────────────────────────────────────────
// TIMELAPSE CAPTURE — cost-first, browser-side.
// ─────────────────────────────────────────────────────────────────────────────
// Captures sparse camera frames during a study session and compiles them into
// a short (15–60s) 360p video LOCALLY, then hands the final compressed WebM
// blob to the upload API. We never store raw frames, never record audio, never
// keep a long array of full-resolution frames in memory.
//
// ── Adaptive sampling ──
// The capture interval grows with session length so longer sessions don't
// capture more frames than needed. We bound the in-memory frame count to
// ~MAX_FRAMES; if a session runs long, we keep only the most recent samples
// (a rolling window) so memory stays bounded even for a 10-hour session.
//
// ── Final timelapse duration ──
// Map study duration → final video length (15–60s):
//   30m → 15s, 1h → 20s, 2h → 25s, 4h → 35s, 6h → 45s, 10h → 60s
// (see timelapseDurationFor)
//
// ── Resolution ──
// 640×360 (360p 16:9). Drawn from the camera stream onto a canvas, then the
// canvas is captured via canvas.captureStream() → MediaRecorder. No audio
// track is added.
//
// ── Reuse vs separate camera ──
// If a LiveKit LocalVideoTrack is already publishing the user's camera, we
// reuse its MediaStreamTrack as the capture source (no second camera prompt,
// no camera conflict). Otherwise we call getUserMedia({ video: true }) (NO
// audio) to open the camera ourselves.
//
// All browser-only APIs are guarded so SSR/build doesn't crash.

export type TimelapseCaptureOptions = {
  // The study session start time (ms epoch). Used to compute study duration
  // and the adaptive sampling interval.
  startedAt: number
  // Optional: an existing LiveKit camera MediaStreamTrack to reuse as the
  // capture source. If provided, we don't call getUserMedia again.
  existingCameraTrack?: MediaStreamTrack | null
  // Called when the final timelapse blob is ready (on stop). The caller
  // uploads it to the /api/timelapses/[id]/complete endpoint.
  onFinalized?: (result: { blob: Blob; durationSec: number; thumbnail: Blob | null }) => void
  // Called when capture fails (permission denied, unsupported, etc).
  onError?: (reason: string) => void
}

// ── Final timelapse duration mapping (15–60s) ──
// studyDurationSeconds → final video seconds. Deterministic, monotonic,
// clamped to [15, 60].
export function timelapseDurationFor(studySeconds: number): number {
  // Map key points and interpolate.
  // 30m (1800s) → 15s, 1h (3600) → 20s, 2h (7200) → 25s,
  // 4h (14400) → 35s, 6h (21600) → 45s, 10h (36000) → 60s.
  const pts: [number, number][] = [
    [0, 15],
    [1800, 15],
    [3600, 20],
    [7200, 25],
    [14400, 35],
    [21600, 45],
    [36000, 60],
  ]
  const s = Math.max(0, studySeconds)
  // linear interpolation between the surrounding points
  for (let i = 1; i < pts.length; i++) {
    if (s <= pts[i][0]) {
      const [x0, y0] = pts[i - 1]
      const [x1, y1] = pts[i]
      const t = (s - x0) / (x1 - x0)
      return Math.round(y0 + t * (y1 - y0))
    }
  }
  return 60 // clamp at 60s for very long sessions
}

// ── Adaptive sampling interval (ms) ──
// Short sessions sample frequently (smooth), long sessions sample sparsely
// (bounded frames). The interval grows with sqrt(studySeconds) so it never
// explodes but also doesn't under-sample very long sessions.
export function captureIntervalMs(studySecondsElapsed: number): number {
  // 0–30m: 1000ms, 30–60m: 2000ms, 1–2h: 4000ms, 2–4h: 6000ms,
  // 4–8h: 10000ms, 8h+: 15000ms.
  if (studySecondsElapsed < 1800) return 1000
  if (studySecondsElapsed < 3600) return 2000
  if (studySecondsElapsed < 7200) return 4000
  if (studySecondsElapsed < 14400) return 6000
  if (studySecondsElapsed < 28800) return 10000
  return 15000
}

// ── Browser support check ──
export function isTimelapseSupported(): boolean {
  if (typeof window === "undefined") return false
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement !== "undefined" &&
    typeof (HTMLCanvasElement.prototype as any).captureStream === "function" &&
    typeof ImageCapture !== "undefined" || true // ImageCapture optional; we use canvas drawImage
  )
}

// Pick the best supported video MIME type for the output. Prefer VP9 then VP8.
function pickMime(): string {
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ]
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c
    } catch {}
  }
  return "video/webm"
}

const MAX_FRAMES = 240 // rolling window — memory bounded even for 10h sessions
const OUTPUT_W = 640
const OUTPUT_H = 360

// ── TimelapseCapture: single-session capture controller. ──
// Instantiate when the user opts in. Call stop() on room exit / unmount / error.
export class TimelapseCapture {
  private stream: MediaStream | null = null
  private video: HTMLVideoElement | null = null
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private frameTimer: any = null
  private startedAt: number
  private finalized = false
  private opts: TimelapseCaptureOptions
  // Store lightweight still frames while studying. The final video is
  // encoded after stop at the accelerated 15–60 second duration, instead of
  // recording the full real-time session.
  private frames: string[] = []

  constructor(opts: TimelapseCaptureOptions) {
    this.opts = opts
    this.startedAt = opts.startedAt
  }

  // ── Start capture: open the camera (or reuse an existing track), then begin
  // the sparse-frame loop + MediaRecorder. Returns true on success. ──
  async start(): Promise<boolean> {
    if (!isTimelapseSupported()) {
      this.opts.onError?.("Timelapse capture is not supported in this browser.")
      return false
    }
    try {
      // Acquire the camera stream. If an existing LiveKit track is provided,
      // clone it (so stopping our capture doesn't stop LiveKit's track).
      // Otherwise getUserMedia with VIDEO ONLY (no audio).
      if (this.opts.existingCameraTrack) {
        try {
          const track = this.opts.existingCameraTrack.clone()
          this.stream = new MediaStream([track])
        } catch {
          // Clone failed — fall back to getUserMedia.
          this.stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 640 }, height: { ideal: 360 }, facingMode: "user" },
            audio: false, // NO AUDIO — privacy + cost
          })
        }
      } else {
        this.stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 360 }, facingMode: "user" },
          audio: false, // NO AUDIO
        })
      }
    } catch (e: any) {
      // Permission denied or no camera — don't break the room.
      this.opts.onError?.(e?.name === "NotAllowedError" ? "Camera permission denied" : "Could not access camera")
      return false
    }

    // Set up a hidden <video> to draw frames from, and a canvas at 360p.
    this.video = document.createElement("video")
    this.video.srcObject = this.stream
    this.video.muted = true
    this.video.playsInline = true
    this.video.autoplay = true
    try { await this.video.play() } catch {}

    this.canvas = document.createElement("canvas")
    this.canvas.width = OUTPUT_W
    this.canvas.height = OUTPUT_H
    this.ctx = this.canvas.getContext("2d", { alpha: false })

    // Draw and buffer the first frame immediately, then sample the camera.
    this.drawFrame()
    this.scheduleNextFrame()
    return true
  }

  private drawFrame() {
    if (!this.ctx || !this.video || !this.canvas) return
    // Cover-fit the video into the 640×360 canvas (handles non-16:9 cameras).
    const vw = this.video.videoWidth || 640
    const vh = this.video.videoHeight || 360
    const scale = Math.max(OUTPUT_W / vw, OUTPUT_H / vh)
    const dw = vw * scale
    const dh = vh * scale
    const dx = (OUTPUT_W - dw) / 2
    const dy = (OUTPUT_H - dh) / 2
    try {
      this.ctx.drawImage(this.video, dx, dy, dw, dh)
    } catch {}
    // JPEG/WebP stills keep memory bounded while allowing the final encoder
    // to play the captured session at accelerated speed.
    try {
      const frame = this.canvas.toDataURL("image/webp", 0.62)
      this.frames.push(frame)
      if (this.frames.length > MAX_FRAMES) this.frames.shift()
    } catch {
      // A missing still must not interrupt the live study session.
    }
  }

  private scheduleNextFrame() {
    if (this.finalized) return
    const elapsedSec = (Date.now() - this.startedAt) / 1000
    const interval = captureIntervalMs(elapsedSec)
    this.frameTimer = setTimeout(() => {
      this.drawFrame()
      this.scheduleNextFrame()
    }, interval)
  }

  // ── Stop capture and encode an accelerated timelapse. Safe to call once. ──
  // The output is always capped at 60 seconds, regardless of study length.
  stop() {
    if (this.finalized) return
    this.finalized = true
    if (this.frameTimer) { clearTimeout(this.frameTimer); this.frameTimer = null }
    void this.encodeTimelapse()
  }

  private async encodeTimelapse() {
    const frames = this.frames.slice()
    const durationSec = Math.min(60, Math.max(15, timelapseDurationFor((Date.now() - this.startedAt) / 1000)))
    const frameRate = 10
    const outputFrameCount = Math.max(1, Math.round(durationSec * frameRate))
    const outputCanvas = document.createElement("canvas")
    outputCanvas.width = OUTPUT_W
    outputCanvas.height = OUTPUT_H
    const outputCtx = outputCanvas.getContext("2d", { alpha: false })
    if (!outputCtx || frames.length === 0) {
      this.opts.onError?.("No camera frames were captured for the timelapse.")
      this.cleanup()
      return
    }

    const images = await Promise.all(frames.map((src) => this.loadImage(src)))
    const stream = outputCanvas.captureStream(frameRate)
    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(stream, {
        mimeType: pickMime(),
        videoBitsPerSecond: 500_000,
      })
    } catch {
      this.opts.onError?.("MediaRecorder not supported for this codec")
      this.cleanup()
      return
    }

    const chunks: Blob[] = []
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    }
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: "video/webm" })
      let thumbnail: Blob | null = null
      try {
        outputCanvas.toBlob((thumb) => {
          thumbnail = thumb
          this.opts.onFinalized?.({ blob, durationSec, thumbnail })
          this.cleanup()
        }, "image/webp", 0.7)
      } catch {
        this.opts.onFinalized?.({ blob, durationSec, thumbnail: null })
        this.cleanup()
      }
    }

    recorder.start()
    for (let i = 0; i < outputFrameCount; i++) {
      const sourceIndex = Math.min(images.length - 1, Math.floor((i / outputFrameCount) * images.length))
      outputCtx.drawImage(images[sourceIndex], 0, 0, OUTPUT_W, OUTPUT_H)
      await new Promise<void>((resolve) => setTimeout(resolve, 1000 / frameRate))
    }
    if (recorder.state !== "inactive") recorder.stop()
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = reject
      image.src = src
    })
  }

  // ── Release all camera + media resources. ──
  private cleanup() {
    if (this.stream) {
      for (const t of this.stream.getTracks()) {
        try { t.stop() } catch {}
      }
      this.stream = null
    }
    this.video = null
    this.canvas = null
    this.ctx = null
    this.frames = []
  }

  // Force-cleanup without finalizing (e.g. user cancels, or component unmounts
  // before stop() was called). Safe to call even after stop().
  destroy() {
    if (!this.finalized) this.finalized = true
    if (this.frameTimer) { clearTimeout(this.frameTimer); this.frameTimer = null }
    this.cleanup()
  }
}
