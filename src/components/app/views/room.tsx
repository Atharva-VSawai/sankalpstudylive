"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api, getToken } from "@/lib/api-client"
import { Avatar, LiveDot } from "@/components/app/brand"
import { useRouter, Link } from "@/lib/router"
import { useAuth } from "@/lib/auth-context"
import { Video, VideoOff, PhoneOff, Play, Pause, Square, RotateCcw, Settings2, ChevronLeft, Coffee, Timer as TimerIcon, CloudRain, Headphones, SkipForward } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { AmbientSounds } from "@/components/app/ambient-sounds"

// ── Types ──
type Participant = {
  userId: string
  username: string
  displayName: string
  avatarUrl?: string
  micOn: boolean
  camOn: boolean
  isSpeaking: boolean
  role: string
  joinedAt: number
  lastSeenAt: number
}

type PomodoroConfig = {
  focusMin: number
  breakMin: number
  longBreakMin: number
  rounds: number
}

type PomodoroState = "ready" | "focusing" | "paused" | "short_break" | "long_break" | "completed"

const PRESETS: { label: string; config: PomodoroConfig }[] = [
  { label: "25 / 5", config: { focusMin: 25, breakMin: 5, longBreakMin: 15, rounds: 4 } },
  { label: "50 / 10", config: { focusMin: 50, breakMin: 10, longBreakMin: 20, rounds: 4 } },
  { label: "45 / 15", config: { focusMin: 45, breakMin: 15, longBreakMin: 30, rounds: 4 } },
  { label: "60 / 10", config: { focusMin: 60, breakMin: 10, longBreakMin: 20, rounds: 4 } },
  { label: "90 / 20", config: { focusMin: 90, breakMin: 20, longBreakMin: 30, rounds: 3 } },
]

export function RoomView({ id }: { id: string }) {
  const { me } = useAuth()
  const { navigate } = useRouter()
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ["room", id],
    queryFn: () => api.get<{ room: any; participants: Participant[]; timer: any }>(`/rooms/${id}`),
  })
  const room = data?.room

  const [participants, setParticipants] = useState<Participant[]>([])
  const [camOn, setCamOn] = useState(false)
  const [left, setLeft] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showAmbient, setShowAmbient] = useState(false)

  // ── Pomodoro state (timestamp-based, not decrement) ──
  const { data: pomoData } = useQuery({
    queryKey: ["pomodoro", "settings"],
    queryFn: () => api.get<{ config: PomodoroConfig }>("/pomodoro/settings"),
  })
  const [config, setConfig] = useState<PomodoroConfig>(pomoData?.config ?? { focusMin: 25, breakMin: 5, longBreakMin: 15, rounds: 4 })
  const [pomoState, setPomoState] = useState<PomodoroState>("ready")
  const [completedRounds, setCompletedRounds] = useState(0)
  const [endsAt, setEndsAt] = useState<number | null>(null) // epoch ms when current phase ends
  const [pausedRemaining, setPausedRemaining] = useState<number | null>(null) // ms remaining when paused
  const [now, setNow] = useState(Date.now())
  const sessionIdRef = useRef<string | null>(null)
  const esRef = useRef<EventSource | null>(null)
  const heartbeatRef = useRef<any>(null)

  // ── SSE connection for presence ──
  useEffect(() => {
    if (!me || !room) return
    let cancelled = false

    async function join() {
      try {
        await api.post(`/rooms/${id}/token`, {})
        await api.post(`/rooms/${id}/presence`, { camOn })
        const token = getToken()
        const es = new EventSource(`/api/rooms/${id}/events?token=${encodeURIComponent(token || "")}`)
        esRef.current = es
        es.addEventListener("presence", (e: any) => setParticipants(JSON.parse(e.data).participants))
        es.onerror = () => {}
        heartbeatRef.current = setInterval(() => {
          api.post(`/rooms/${id}/presence`, { action: "heartbeat" }).catch(() => {})
        }, 20000)
      } catch (e: any) {
        // If free allowance exhausted, redirect to paywall
        if (e?.code === "FREE_ALLOWANCE_EXHAUSTED" || e?.status === 403) {
          toast.error("Your 60 free minutes are used up. Upgrade for unlimited access.")
          navigate("/paywall", { replace: true })
        } else {
          toast.error(e.message || "Failed to join room")
          navigate("/rooms")
        }
      }
    }
    join()
    return () => {
      cancelled = true
      esRef.current?.close()
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      api.post(`/rooms/${id}/presence`, { action: "leave" }).catch(() => {})
    }
  }, [me, room?.id])

  // ── Tick for Pomodoro display ──
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(i)
  }, [])

  // ── Auto stop session on unload ──
  useEffect(() => {
    const onUnload = () => {
      if (sessionIdRef.current) navigator.sendBeacon(`/api/study/sessions/${sessionIdRef.current}/stop`)
      api.post(`/rooms/${id}/presence`, { action: "leave" }).catch(() => {})
    }
    window.addEventListener("beforeunload", onUnload)
    return () => window.removeEventListener("beforeunload", onUnload)
  }, [id])

  // ── Leave room ──
  const leave = useCallback(async () => {
    setLeft(true)
    esRef.current?.close()
    if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    if (sessionIdRef.current) {
      try { await api.post(`/study/sessions/${sessionIdRef.current}/stop`) } catch {}
      sessionIdRef.current = null
    }
    await api.post(`/rooms/${id}/presence`, { action: "leave" }).catch(() => {})
    qc.invalidateQueries({ queryKey: ["rooms"] })
    navigate("/rooms")
  }, [id, navigate, qc])

  // ── Camera toggle ──
  const toggleCam = async () => {
    const v = !camOn
    setCamOn(v)
    try { await api.patch(`/rooms/${id}/presence`, { camOn: v }) } catch {}
  }

  // ── Pomodoro: timestamp-based remaining calculation ──
  const currentPhaseDuration = (): number => {
    if (pomoState === "focusing" || pomoState === "paused") return config.focusMin * 60_000
    if (pomoState === "short_break") return config.breakMin * 60_000
    if (pomoState === "long_break") return config.longBreakMin * 60_000
    return config.focusMin * 60_000
  }

  const remainingMs = useMemo((): number => {
    if (pomoState === "ready") return config.focusMin * 60_000
    if (pomoState === "paused") return pausedRemaining ?? 0
    if (endsAt) return Math.max(0, endsAt - now)
    return 0
  }, [pomoState, endsAt, pausedRemaining, now, config])

  const mm = String(Math.floor(remainingMs / 60000)).padStart(2, "0")
  const ss = String(Math.floor((remainingMs % 60000) / 1000)).padStart(2, "0")

  // ── Pomodoro: start focus ──
  const startFocus = async () => {
    setPomoState("focusing")
    setEndsAt(Date.now() + config.focusMin * 60_000)
    setPausedRemaining(null)
    // Start server-authoritative study session
    if (!sessionIdRef.current) {
      try {
        const res = await api.post<{ sessionId: string }>("/study/sessions", { roomId: id, communityId: room?.community?.id, mode: "pomodoro" })
        sessionIdRef.current = res.sessionId
      } catch (e: any) {
        toast.error(e.message || "Failed to start study session")
      }
    }
  }

  // ── Pomodoro: pause ──
  const pause = () => {
    if (endsAt) {
      setPausedRemaining(Math.max(0, endsAt - Date.now()))
    }
    setPomoState("paused")
    setEndsAt(null)
  }

  // ── Pomodoro: resume ──
  const resume = () => {
    if (pausedRemaining && pausedRemaining > 0) {
      setEndsAt(Date.now() + pausedRemaining)
      setPomoState("focusing")
      setPausedRemaining(null)
    } else {
      startFocus()
    }
  }

  // ── Pomodoro: reset ──
  const reset = async () => {
    setPomoState("ready")
    setEndsAt(null)
    setPausedRemaining(null)
    setCompletedRounds(0)
    if (sessionIdRef.current) {
      try { await api.post(`/study/sessions/${sessionIdRef.current}/stop`) } catch {}
      sessionIdRef.current = null
    }
  }

  // ── Pomodoro: skip break ──
  const skipBreak = () => {
    setPomoState("ready")
    setEndsAt(null)
    setPausedRemaining(null)
  }

  // ── Pomodoro: auto-transition on zero ──
  useEffect(() => {
    if (pomoState !== "focusing" && pomoState !== "short_break" && pomoState !== "long_break") return
    if (remainingMs > 0) return
    // Phase complete
    if (pomoState === "focusing") {
      const newRounds = completedRounds + 1
      setCompletedRounds(newRounds)
      playChime()
      if (newRounds % config.rounds === 0) {
        // Long break
        setPomoState("long_break")
        setEndsAt(Date.now() + config.longBreakMin * 60_000)
        toast.success(`Focus complete! Long break (${config.longBreakMin} min)`)
      } else {
        // Short break
        setPomoState("short_break")
        setEndsAt(Date.now() + config.breakMin * 60_000)
        toast.success(`Focus complete! Break (${config.breakMin} min)`)
      }
    } else if (pomoState === "short_break" || pomoState === "long_break") {
      playChime()
      setPomoState("ready")
      setEndsAt(null)
      setPausedRemaining(null)
      if (pomoState === "long_break") {
        setCompletedRounds(0)
        toast.success("Pomodoro cycle complete! 🎉")
      } else {
        toast.success("Break over. Ready for next focus?")
      }
    }
  }, [remainingMs, pomoState])

  // ── Save custom Pomodoro settings ──
  const saveConfig = async (cfg: PomodoroConfig) => {
    setConfig(cfg)
    setShowSettings(false)
    try {
      await api.put("/pomodoro/settings", cfg)
      toast.success("Pomodoro settings saved")
    } catch (e: any) {
      toast.error(e.message || "Failed to save settings")
    }
  }

  if (isLoading) return <div className="p-10 text-center text-muted-foreground">Loading room…</div>
  if (!room) return <div className="p-10 text-center text-muted-foreground">Room not found. <Link className="text-brand-emerald" to="/rooms">Back to rooms</Link></div>
  if (left) return null

  const count = participants.length
  const isMyTurn = pomoState === "focusing"

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* ── Minimal header ── */}
      <div className="flex items-center justify-between px-4 h-14 border-b bg-card/60 backdrop-blur">
        <button onClick={leave} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="size-4" /> Back
        </button>
        <div className="text-center min-w-0 flex-1 px-2">
          <h1 className="font-semibold truncate text-sm md:text-base">{room.name}</h1>
          <p className="text-[10px] text-muted-foreground">{count} studying · Silent focus room</p>
        </div>
        <div className="w-16 flex justify-end">
          {count > 0 && <LiveDot />}
        </div>
      </div>

      {/* ── Participant grid (fills most of the screen) ── */}
      <div className="flex-1 overflow-y-auto scroll-thin p-3 md:p-4">
        <div className={cn("grid gap-2 md:gap-3 mx-auto max-w-7xl", gridClass(count))}>
          {count === 0 ? (
            <div className="col-span-full h-full flex items-center justify-center text-muted-foreground text-sm">
              Connecting…
            </div>
          ) : (
            participants.map((p) => (
              <ParticipantTile key={p.userId} p={p} isMe={p.userId === me?.id} />
            ))
          )}
        </div>
      </div>

      {/* ── Pomodoro + controls bar ── */}
      <div className="border-t bg-card/80 backdrop-blur">
        {/* Pomodoro display */}
        <div className="flex items-center justify-center gap-4 py-2 px-4">
          <div className="text-center">
            <div className={cn(
              "text-[10px] font-bold tracking-widest uppercase",
              pomoState === "focusing" && "text-brand-emerald",
              pomoState === "paused" && "text-amber-500",
              (pomoState === "short_break" || pomoState === "long_break") && "text-sky-500",
              pomoState === "ready" && "text-muted-foreground",
            )}>
              {pomoState === "ready" ? "Ready" : pomoState === "focusing" ? "Focus" : pomoState === "paused" ? "Paused" : pomoState === "short_break" ? "Short Break" : pomoState === "long_break" ? "Long Break" : "Done"}
            </div>
            <div className="text-3xl md:text-4xl font-bold tabular-nums font-mono">{mm}:{ss}</div>
            <div className="text-[10px] text-muted-foreground">
              {config.focusMin}m focus · {config.breakMin}m break{completedRounds > 0 ? ` · Round ${completedRounds}` : ""}
            </div>
          </div>
        </div>

        {/* Pomodoro controls */}
        <div className="flex items-center justify-center gap-2 pb-1">
          {pomoState === "ready" && (
            <button onClick={startFocus} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-brand-emerald text-white text-sm font-medium hover:opacity-90">
              <Play className="size-4" /> Start Focus
            </button>
          )}
          {pomoState === "focusing" && (
            <button onClick={pause} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-amber-500 text-white text-sm font-medium hover:opacity-90">
              <Pause className="size-4" /> Pause
            </button>
          )}
          {pomoState === "paused" && (
            <button onClick={resume} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-brand-emerald text-white text-sm font-medium hover:opacity-90">
              <Play className="size-4" /> Resume
            </button>
          )}
          {(pomoState === "short_break" || pomoState === "long_break") && (
            <button onClick={skipBreak} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-muted text-muted-foreground text-sm font-medium hover:bg-accent">
              <SkipForward className="size-4" /> Skip Break
            </button>
          )}
          {pomoState !== "ready" && (
            <button onClick={reset} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-muted-foreground text-sm hover:bg-accent" title="Reset">
              <RotateCcw className="size-4" />
            </button>
          )}
          <button onClick={() => setShowSettings(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-muted-foreground text-sm hover:bg-accent" title="Customize Pomodoro">
            <Settings2 className="size-4" />
          </button>
        </div>

        {/* Study toolbar: Camera | Ambient | Leave */}
        <div className="flex items-center justify-center gap-3 py-2 border-t" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          <ControlBtn active={camOn} onClick={toggleCam} on={<Video className="size-5" />} off={<VideoOff className="size-5" />} label={camOn ? "Stop video" : "Camera"} />
          <ControlBtn active={showAmbient} onClick={() => setShowAmbient(!showAmbient)} on={<Headphones className="size-5" />} off={<Headphones className="size-5" />} label="Ambient" />
          <button onClick={leave} className="inline-flex items-center justify-center size-11 rounded-full bg-destructive text-white hover:bg-destructive/90 transition-colors" title="Leave room">
            <PhoneOff className="size-5" />
          </button>
        </div>
      </div>

      {/* ── Ambient sounds popover ── */}
      {showAmbient && (
        <div className="absolute bottom-24 right-3 w-56 z-30">
          <AmbientSounds compact />
        </div>
      )}

      {/* ── Pomodoro settings dialog ── */}
      {showSettings && (
        <PomodoroSettings
          config={config}
          onSave={saveConfig}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}

// ── Participant tile (equal visual importance, no host dominance) ──
function ParticipantTile({ p, isMe }: { p: Participant; isMe?: boolean }) {
  return (
    <div className="relative aspect-video rounded-xl overflow-hidden border bg-gradient-to-br from-emerald-950/30 to-emerald-800/10 flex items-center justify-center">
      {p.camOn ? (
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-600/20 to-amber-500/10 flex items-center justify-center">
          <Avatar name={p.displayName} src={p.avatarUrl} size={64} />
        </div>
      ) : (
        <Avatar name={p.displayName} src={p.avatarUrl} size={64} />
      )}
      <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between">
        <span className="text-xs font-medium text-white bg-black/40 backdrop-blur px-1.5 py-0.5 rounded truncate max-w-full">
          {p.displayName}{isMe && " (you)"}
        </span>
        {p.camOn && <span className="size-4 rounded-full bg-brand-emerald flex items-center justify-center"><Video className="size-2.5 text-white" /></span>}
      </div>
    </div>
  )
}

// ── Control button ──
function ControlBtn({ active, onClick, on, off, label }: { active: boolean; onClick: () => void; on: React.ReactNode; off: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} className="inline-flex flex-col items-center gap-1" title={label}>
      <span className={cn("inline-flex items-center justify-center size-11 rounded-full transition-colors", active ? "bg-brand-emerald text-white" : "bg-muted text-muted-foreground hover:bg-accent")}>
        {active ? on : off}
      </span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </button>
  )
}

// ── Responsive grid class based on participant count ──
function gridClass(n: number): string {
  if (n <= 1) return "grid-cols-1 max-w-2xl"
  if (n <= 4) return "grid-cols-2 md:grid-cols-2 lg:grid-cols-3"
  if (n <= 9) return "grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
  if (n <= 16) return "grid-cols-2 md:grid-cols-4 lg:grid-cols-4"
  if (n <= 25) return "grid-cols-2 md:grid-cols-5 lg:grid-cols-5"
  return "grid-cols-2 md:grid-cols-6 lg:grid-cols-6"
}

// ── Pomodoro settings dialog ──
function PomodoroSettings({ config, onSave, onClose }: { config: PomodoroConfig; onSave: (c: PomodoroConfig) => void; onClose: () => void }) {
  const [focusMin, setFocusMin] = useState(String(config.focusMin))
  const [breakMin, setBreakMin] = useState(String(config.breakMin))
  const [longBreakMin, setLongBreakMin] = useState(String(config.longBreakMin))
  const [rounds, setRounds] = useState(String(config.rounds))
  const [error, setError] = useState("")

  const applyPreset = (preset: PomodoroConfig) => {
    setFocusMin(String(preset.focusMin))
    setBreakMin(String(preset.breakMin))
    setLongBreakMin(String(preset.longBreakMin))
    setRounds(String(preset.rounds))
    setError("")
  }

  const save = () => {
    const f = parseInt(focusMin, 10)
    const b = parseInt(breakMin, 10)
    const lb = parseInt(longBreakMin, 10)
    const r = parseInt(rounds, 10)
    if (isNaN(f) || f < 1 || f > 180) return setError("Focus must be 1–180 min")
    if (isNaN(b) || b < 1 || b > 60) return setError("Short break must be 1–60 min")
    if (isNaN(lb) || lb < 1 || lb > 60) return setError("Long break must be 1–60 min")
    if (isNaN(r) || r < 1 || r > 12) return setError("Rounds must be 1–12")
    onSave({ focusMin: f, breakMin: b, longBreakMin: lb, rounds: r })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold flex items-center gap-2"><Settings2 className="size-5 text-brand-emerald" /> Pomodoro Settings</h3>

        {/* Presets */}
        <div>
          <div className="text-xs text-muted-foreground mb-1.5">Presets</div>
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => applyPreset(p.config)}
                className="text-xs px-2.5 py-1.5 rounded-lg border hover:bg-accent transition-colors"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom inputs */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Focus (min)</label>
            <input type="number" value={focusMin} onChange={(e) => setFocusMin(e.target.value)} min={1} max={180} className="w-full h-9 rounded-md border bg-background px-3 text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Short Break (min)</label>
            <input type="number" value={breakMin} onChange={(e) => setBreakMin(e.target.value)} min={1} max={60} className="w-full h-9 rounded-md border bg-background px-3 text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Long Break (min)</label>
            <input type="number" value={longBreakMin} onChange={(e) => setLongBreakMin(e.target.value)} min={1} max={60} className="w-full h-9 rounded-md border bg-background px-3 text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Long break after</label>
            <input type="number" value={rounds} onChange={(e) => setRounds(e.target.value)} min={1} max={12} className="w-full h-9 rounded-md border bg-background px-3 text-sm" />
          </div>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm hover:bg-accent">Cancel</button>
          <button onClick={save} className="px-4 py-2 rounded-lg bg-brand-emerald text-white text-sm font-medium hover:opacity-90">Save Settings</button>
        </div>
      </div>
    </div>
  )
}

// ── Subtle chime for phase transitions ──
function playChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.connect(g); g.connect(ctx.destination)
    o.frequency.value = 660
    o.type = "sine"
    g.gain.setValueAtTime(0.0001, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8)
    o.start(); o.stop(ctx.currentTime + 0.8)
  } catch {}
}

import { useMemo } from "react"
