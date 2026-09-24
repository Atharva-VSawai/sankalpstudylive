"use client"

// Record the camera continuously, then create the saved timelapse by seeking
// through the original recording at accelerated time positions. This produces
// a real fast-forward video instead of a slideshow made from sparse stills.

export type TimelapseCaptureOptions = {
  startedAt: number
  existingCameraTrack?: MediaStreamTrack | null
  onFinalized?: (result: {
    blob: Blob
    durationSec: number
    thumbnail: Blob | null
    width: number
    height: number
  }) => void | Promise<void>
  onError?: (reason: string) => void
}

export function timelapseDurationFor(studySeconds: number): number {
  const points: [number, number][] = [
    [0, 1], [1800, 5], [3600, 10], [7200, 15],
    [14400, 30], [21600, 45], [36000, 60],
  ]
  const seconds = Math.max(0, studySeconds)
  for (let i = 1; i < points.length; i++) {
    if (seconds <= points[i][0]) {
      const [x0, y0] = points[i - 1]
      const [x1, y1] = points[i]
      return Math.round(y0 + ((seconds - x0) / (x1 - x0)) * (y1 - y0))
    }
  }
  return 60
}

export function isTimelapseSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined" &&
    typeof HTMLCanvasElement !== "undefined" &&
    typeof HTMLCanvasElement.prototype.captureStream === "function"
  )
}

function pickMime(): string {
  for (const mime of ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]) {
    try {
      if (MediaRecorder.isTypeSupported(mime)) return mime
    } catch {}
  }
  return "video/webm"
}

const FALLBACK_W = 1280
const FALLBACK_H = 720
const OUTPUT_FPS = 30

export class TimelapseCapture {
  private stream: MediaStream | null = null
  private recorder: MediaRecorder | null = null
  private startedAt: number
  private finalized = false
  private opts: TimelapseCaptureOptions
  private outputWidth = FALLBACK_W
  private outputHeight = FALLBACK_H
  private chunks: Blob[] = []
  private recordingDone: Promise<Blob> | null = null

  constructor(opts: TimelapseCaptureOptions) {
    this.opts = opts
    this.startedAt = opts.startedAt
  }

  async start(): Promise<boolean> {
    if (!isTimelapseSupported()) {
      this.opts.onError?.("Timelapse capture is not supported in this browser.")
      return false
    }
    try {
      const settings = this.opts.existingCameraTrack?.getSettings()
      // Do not reuse the room's intentionally low-resolution publication.
      const existingIsHd = (settings?.width ?? 0) >= 1280 && (settings?.height ?? 0) >= 720
      if (this.opts.existingCameraTrack && existingIsHd) {
        this.stream = new MediaStream([this.opts.existingCameraTrack.clone()])
      } else {
        this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false })
      }
    } catch (e: any) {
      this.opts.onError?.(e?.name === "NotAllowedError" ? "Camera permission denied" : "Could not access camera")
      return false
    }

    const track = this.stream.getVideoTracks()[0]
    const settings = track?.getSettings()
    this.outputWidth = Math.max(1, Math.round(settings?.width || FALLBACK_W))
    this.outputHeight = Math.max(1, Math.round(settings?.height || FALLBACK_H))

    try {
      this.recorder = new MediaRecorder(this.stream, { mimeType: pickMime() })
    } catch {
      this.opts.onError?.("MediaRecorder is not supported for this camera")
      this.cleanup()
      return false
    }

    this.recordingDone = new Promise<Blob>((resolve) => {
      this.recorder!.ondataavailable = (event) => {
        if (event.data.size > 0) this.chunks.push(event.data)
      }
      this.recorder!.onstop = () => resolve(new Blob(this.chunks, { type: this.recorder?.mimeType || "video/webm" }))
    })
    this.recorder.start(1000)
    return true
  }

  stop(): Promise<void> {
    if (this.finalized) return Promise.resolve()
    this.finalized = true
    if (!this.recorder || this.recorder.state === "inactive") return Promise.resolve()
    this.recorder.stop()
    return this.finishRecording()
  }

  private async finishRecording(): Promise<void> {
    if (!this.recordingDone) {
      this.opts.onError?.("No camera recording was initialized.")
      this.cleanup()
      return
    }
    const sourceBlob = await this.recordingDone
    const recordedDuration = Math.max(0.1, (Date.now() - this.startedAt) / 1000)
    await this.encodeFastForward(sourceBlob, recordedDuration)
  }

  private async encodeFastForward(sourceBlob: Blob, recordedDuration: number): Promise<void> {
    if (!sourceBlob.size) {
      this.opts.onError?.("No camera video was recorded for the timelapse.")
      this.cleanup()
      return
    }

    const source = document.createElement("video")
    const sourceUrl = URL.createObjectURL(sourceBlob)
    source.src = sourceUrl
    source.muted = true
    source.playsInline = true
    try {
      await new Promise<void>((resolve, reject) => {
        source.onloadedmetadata = () => resolve()
        source.onerror = () => reject(new Error("Recorded video could not be decoded"))
        source.load()
      })
      // Some Chromium WebM recordings omit the duration metadata. The actual
      // wall-clock recording length is authoritative for this local encoder,
      // so use it whenever the container reports NaN/Infinity/zero.
      const metadataDuration = source.duration
      const sourceDuration = Number.isFinite(metadataDuration) && metadataDuration > 0
        ? metadataDuration
        : recordedDuration

      const durationSec = Math.min(60, Math.max(1, timelapseDurationFor((Date.now() - this.startedAt) / 1000)))
      const outputFrameCount = Math.max(1, Math.round(durationSec * OUTPUT_FPS))
      const canvas = document.createElement("canvas")
      canvas.width = this.outputWidth
      canvas.height = this.outputHeight
      const ctx = canvas.getContext("2d", { alpha: false })
      if (!ctx) throw new Error("Could not create timelapse encoder")

      const outputRecorder = new MediaRecorder(canvas.captureStream(OUTPUT_FPS), { mimeType: pickMime() })
      const outputChunks: Blob[] = []
      outputRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) outputChunks.push(event.data)
      }
      const outputDone = new Promise<void>((resolve) => {
        outputRecorder.onstop = () => resolve()
        outputRecorder.onerror = () => resolve()
      })
      outputRecorder.start()

      for (let i = 0; i < outputFrameCount; i++) {
        const position = i / Math.max(1, outputFrameCount - 1)
        await this.seek(source, sourceDuration * position)
        ctx.drawImage(source, 0, 0, this.outputWidth, this.outputHeight)
        await new Promise((resolve) => setTimeout(resolve, 1000 / OUTPUT_FPS))
      }
      outputRecorder.stop()
      await outputDone

      const blob = new Blob(outputChunks, { type: outputRecorder.mimeType || "video/webm" })
      const thumbnail = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.85))
      await this.opts.onFinalized?.({ blob, durationSec, thumbnail, width: this.outputWidth, height: this.outputHeight })
    } catch (error: any) {
      this.opts.onError?.(error?.message || "Could not create timelapse")
    } finally {
      URL.revokeObjectURL(sourceUrl)
      this.cleanup()
    }
  }

  private seek(video: HTMLVideoElement, time: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (Math.abs(video.currentTime - time) < 0.001) {
        resolve()
        return
      }
      const done = () => resolve()
      video.addEventListener("seeked", done, { once: true })
      video.addEventListener("error", () => reject(new Error("Could not seek recorded video")), { once: true })
      video.currentTime = Math.min(Math.max(0, time), Math.max(0, video.duration - 0.001))
    })
  }

  private cleanup() {
    for (const track of this.stream?.getTracks() ?? []) {
      try { track.stop() } catch {}
    }
    this.stream = null
    this.recorder = null
    this.chunks = []
    this.recordingDone = null
  }

  destroy() {
    if (!this.finalized) {
      this.finalized = true
      if (this.recorder && this.recorder.state !== "inactive") this.recorder.stop()
    }
    this.cleanup()
  }
}
