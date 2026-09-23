"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Volume2, VolumeX, CloudRain, Coffee, Waves, Wind } from "lucide-react"
import { cn } from "@/lib/utils"

// Ambient focus sounds synthesized via WebAudio (no asset downloads).
// Options: rain (filtered noise), cafe (brown noise bursts), waves (LFO-modulated noise), white (pure noise).
// All loops indefinitely; volume controlled by a single slider.

type Sound = "off" | "rain" | "cafe" | "waves" | "white"

const OPTIONS: { id: Sound; label: string; icon: React.ReactNode }[] = [
  { id: "rain", label: "Rain", icon: <CloudRain className="size-4" /> },
  { id: "cafe", label: "Café", icon: <Coffee className="size-4" /> },
  { id: "waves", label: "Waves", icon: <Waves className="size-4" /> },
  { id: "white", label: "White", icon: <Wind className="size-4" /> },
]

export function AmbientSounds({ compact = false }: { compact?: boolean }) {
  const [sound, setSound] = useState<Sound>("off")
  const [volume, setVolume] = useState(0.35)
  const ctxRef = useRef<AudioContext | null>(null)
  const masterRef = useRef<GainNode | null>(null)
  const nodesRef = useRef<{ stop: () => void } | null>(null)

  // tear down current sound
  const stop = useCallback(() => {
    if (nodesRef.current) {
      nodesRef.current.stop()
      nodesRef.current = null
    }
  }, [])

  const start = useCallback(async (s: Sound) => {
    stop()
    if (s === "off") return
    if (!ctxRef.current) {
      ctxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)()
    }
    const ctx = ctxRef.current
    if (ctx.state === "suspended") await ctx.resume()

    const master = ctx.createGain()
    master.gain.value = volume
    master.connect(ctx.destination)
    masterRef.current = master

    // base noise buffer (1s of white noise)
    const bufferSize = ctx.sampleRate * 1
    const noiseBuf = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = noiseBuf.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1

    if (s === "white") {
      const src = ctx.createBufferSource()
      src.buffer = noiseBuf
      src.loop = true
      src.connect(master)
      src.start()
      nodesRef.current = { stop: () => { try { src.stop() } catch {} } }
    } else if (s === "rain") {
      // white noise through a bandpass + highpass to sound like rain
      const src = ctx.createBufferSource()
      src.buffer = noiseBuf
      src.loop = true
      const hp = ctx.createBiquadFilter()
      hp.type = "highpass"
      hp.frequency.value = 800
      const bp = ctx.createBiquadFilter()
      bp.type = "bandpass"
      bp.frequency.value = 2400
      bp.Q.value = 0.6
      src.connect(hp).connect(bp).connect(master)
      src.start()
      nodesRef.current = { stop: () => { try { src.stop() } catch {} } }
    } else if (s === "cafe") {
      // brown-ish noise (accumulated random) through lowpass = café murmur
      const brownBuf = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
      const bdata = brownBuf.getChannelData(0)
      let last = 0
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1
        last = (last + 0.02 * white) / 1.02
        bdata[i] = last * 3.5
      }
      const src = ctx.createBufferSource()
      src.buffer = brownBuf
      src.loop = true
      const lp = ctx.createBiquadFilter()
      lp.type = "lowpass"
      lp.frequency.value = 600
      src.connect(lp).connect(master)
      src.start()
      nodesRef.current = { stop: () => { try { src.stop() } catch {} } }
    } else if (s === "waves") {
      // white noise through lowpass with an LFO on the gain -> wave swells
      const src = ctx.createBufferSource()
      src.buffer = noiseBuf
      src.loop = true
      const lp = ctx.createBiquadFilter()
      lp.type = "lowpass"
      lp.frequency.value = 500
      const swellGain = ctx.createGain()
      swellGain.gain.value = 0.4
      const lfo = ctx.createOscillator()
      lfo.frequency.value = 0.12 // ~8s per wave
      const lfoGain = ctx.createGain()
      lfoGain.gain.value = 0.35
      lfo.connect(lfoGain).connect(swellGain.gain)
      src.connect(lp).connect(swellGain).connect(master)
      src.start()
      lfo.start()
      nodesRef.current = { stop: () => { try { src.stop(); lfo.stop() } catch {} } }
    }
  }, [stop, volume])

  // update volume live
  useEffect(() => {
    if (masterRef.current && ctxRef.current) {
      masterRef.current.gain.setValueAtTime(volume, ctxRef.current.currentTime)
    }
  }, [volume])

  // cleanup on unmount
  useEffect(() => stop, [stop])

  const pick = (s: Sound) => {
    if (sound === s) {
      setSound("off")
      stop()
    } else {
      setSound(s)
      start(s)
    }
  }

  return (
    <div className={cn("rounded-xl border bg-card/60 backdrop-blur", compact ? "p-2.5" : "p-3")}>
      <div className="flex items-center gap-1.5 mb-2">
        {sound === "off" ? <VolumeX className="size-3.5 text-muted-foreground" /> : <Volume2 className="size-3.5 text-brand-emerald" />}
        <span className="text-xs font-medium">{sound === "off" ? "Ambient sounds" : `Playing · ${sound}`}</span>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {OPTIONS.map((o) => (
          <button
            key={o.id}
            onClick={() => pick(o.id)}
            title={o.label}
            className={cn(
              "flex flex-col items-center gap-1 rounded-lg py-2 text-[10px] font-medium transition-colors",
              sound === o.id ? "bg-brand-emerald text-white" : "bg-muted text-muted-foreground hover:bg-accent"
            )}
          >
            {o.icon}
            <span>{o.label}</span>
          </button>
        ))}
      </div>
      {sound !== "off" && (
        <div className="mt-2.5 flex items-center gap-2">
          <VolumeX className="size-3 text-muted-foreground shrink-0" />
          <input
            type="range"
            min={0}
            max={0.8}
            step={0.05}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            className="w-full accent-[var(--brand-emerald)] h-1"
          />
          <Volume2 className="size-3 text-muted-foreground shrink-0" />
        </div>
      )}
    </div>
  )
}
