"use client"

import { useEffect, useRef, useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth-context"
import { useRouter } from "@/lib/router"
import { Play, Pause, Square, RotateCcw, Coffee, Timer as TimerIcon, Zap, Target, Flame, Sparkles, Headphones } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

export function StudyView() {
  const { me } = useAuth()
  const { navigate } = useRouter()
  const qc = useQueryClient()

  const { data: goal } = useQuery({ queryKey: ["goals", "today"], queryFn: () => api.get<any>("/study/goals/today") })

  const [mode, setMode] = useState<"focus" | "break">("focus")
  const [focusMin, setFocusMin] = useState(25)
  const [breakMin, setBreakMin] = useState(5)
  const [remaining, setRemaining] = useState(25 * 60)
  const [running, setRunning] = useState(false)
  const [round, setRound] = useState(0)
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null)
  const [accrued, setAccrued] = useState(0) // minutes accrued this session (display)
  const sessionIdRef = useRef<string | null>(null)
  const tickRef = useRef<any>(null)
  const phaseEndRef = useRef<() => void>(() => {})

  const handlePhaseEnd = async () => {
    setRunning(false)
    if (mode === "focus") {
      setRound((r) => r + 1)
      setAccrued((a) => a + focusMin)
      // auto-flip to break
      setMode("break")
      setRemaining(breakMin * 60)
      toast.success(`Focus done! +${focusMin * 10} XP pending. Take a ${breakMin}m break.`, { icon: <Coffee className="size-4" /> })
      playChime()
    } else {
      setMode("focus")
      setRemaining(focusMin * 60)
      toast.success("Break over. Back to focus!", { icon: <TimerIcon className="size-4" /> })
      playChime()
    }
  }
  // keep ref current so the interval always calls the latest closure
  useEffect(() => {
    phaseEndRef.current = handlePhaseEnd
  })

  // tick
  useEffect(() => {
    if (running) {
      tickRef.current = setInterval(() => {
        setRemaining((r) => {
          if (r <= 1) {
            phaseEndRef.current()
            return 0
          }
          return r - 1
        })
      }, 1000)
      return () => clearInterval(tickRef.current)
    }
  }, [running])

  // on unload, bank the session
  useEffect(() => {
    const onUnload = () => {
      if (sessionIdRef.current) navigator.sendBeacon(`/api/study/sessions/${sessionIdRef.current}/stop`)
    }
    window.addEventListener("beforeunload", onUnload)
    return () => {
      window.removeEventListener("beforeunload", onUnload)
      if (sessionIdRef.current) {
        // best effort bank
        api.post(`/study/sessions/${sessionIdRef.current}/stop`).catch(() => {})
      }
    }
  }, [])

  const start = async () => {
    if (!sessionIdRef.current) {
      try {
        const res = await api.post<{ sessionId: string }>("/study/sessions", { mode: "pomodoro" })
        sessionIdRef.current = res.sessionId
        setSessionStartedAt(Date.now())
      } catch (e: any) { toast.error(e.message); return }
    }
    setRunning(true)
  }
  const pause = () => setRunning(false)
  const stop = async () => {
    setRunning(false)
    if (sessionIdRef.current) {
      try {
        const res = await api.post<{ durationMin: number; xpEarned: number; streak: number; awardedBadges: any[] }>(`/study/sessions/${sessionIdRef.current}/stop`)
        const xp = res.xpEarned ?? 0
        toast.success(`Studied ${res.durationMin ?? 0}m · +${xp} XP${res.streak ? ` · 🔥 ${res.streak}d streak` : ""}`)
        if (res.awardedBadges?.length) for (const b of res.awardedBadges) toast(`Badge: ${b.name}`, { description: b.description })
        qc.invalidateQueries({ queryKey: ["goals"] })
        qc.invalidateQueries({ queryKey: ["me"] })
      } catch (e: any) { toast.error(e.message) }
    }
    sessionIdRef.current = null
    setSessionStartedAt(null)
    setAccrued(0)
    setRound(0)
    setMode("focus")
    setRemaining(focusMin * 60)
  }
  const reset = () => {
    setRunning(false)
    setRemaining((mode === "focus" ? focusMin : breakMin) * 60)
  }

  const mm = String(Math.floor(remaining / 60)).padStart(2, "0")
  const ss = String(remaining % 60).padStart(2, "0")
  const totalSec = (mode === "focus" ? focusMin : breakMin) * 60
  const pct = totalSec > 0 ? ((totalSec - remaining) / totalSec) * 100 : 0
  const goalPct = goal && goal.targetMin > 0 ? Math.min(100, (goal.achievedMin / goal.targetMin) * 100) : 0

  return (
    <div className="min-h-[calc(100vh-4rem)] hero-glow flex items-center justify-center px-4 py-8 pb-24 md:pb-8">
      <div className="w-full max-w-4xl fade-in">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold">Solo study</h1>
          <p className="text-muted-foreground">A focused Pomodoro. Time is tracked server-side.</p>
        </div>

        <Card className="overflow-hidden">
          <CardContent className="p-6 md:p-10">
            {/* Mode toggle */}
            <div className="flex justify-center mb-6">
              <div className="inline-flex rounded-full bg-muted p-1">
                <button onClick={() => { setMode("focus"); setRemaining(focusMin * 60); setRunning(false) }} className={cn("px-4 py-1.5 rounded-full text-sm font-medium transition", mode === "focus" ? "bg-brand-emerald text-white" : "text-muted-foreground")}>
                  <TimerIcon className="size-4 inline mr-1.5" /> Focus
                </button>
                <button onClick={() => { setMode("break"); setRemaining(breakMin * 60); setRunning(false) }} className={cn("px-4 py-1.5 rounded-full text-sm font-medium transition", mode === "break" ? "bg-accent text-accent-foreground" : "text-muted-foreground")}>
                  <Coffee className="size-4 inline mr-1.5" /> Break
                </button>
              </div>
            </div>

            {/* Timer ring */}
            <div className="relative mx-auto size-64 md:size-72">
              <svg viewBox="0 0 200 200" className="size-full -rotate-90">
                <circle cx="100" cy="100" r="88" fill="none" stroke="hsl(var(--muted))" strokeWidth="10" />
                <circle
                  cx="100" cy="100" r="88" fill="none"
                  stroke={mode === "focus" ? "var(--brand-emerald)" : "var(--accent)"}
                  strokeWidth="10" strokeLinecap="round"
                  strokeDasharray={2 * Math.PI * 88}
                  strokeDashoffset={2 * Math.PI * 88 * (1 - pct / 100)}
                  className="transition-all duration-500"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-6xl md:text-7xl font-bold font-mono tabular-nums">{mm}:{ss}</div>
                <div className="text-sm text-muted-foreground mt-1">{mode === "focus" ? "Focus" : "Break"} · Round {round}</div>
                {running && <div className="text-xs text-brand-emerald mt-1 inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-brand-emerald animate-pulse" /> tracking</div>}
              </div>
            </div>

            {/* Controls */}
            <div className="flex justify-center gap-3 mt-8">
              {!running ? (
                <Button size="lg" className="h-12 px-8 bg-brand-emerald hover:opacity-90" onClick={start}><Play className="size-5" /> {sessionStartedAt ? "Resume" : "Start"}</Button>
              ) : (
                <Button size="lg" variant="outline" className="h-12 px-8" onClick={pause}><Pause className="size-5" /> Pause</Button>
              )}
              <Button size="lg" variant="ghost" className="h-12 px-6" onClick={reset}><RotateCcw className="size-5" /> Reset</Button>
              <Button size="lg" variant="destructive" className="h-12 px-8" onClick={stop} disabled={!sessionStartedAt}><Square className="size-5" /> Stop & save</Button>
            </div>

            {/* Presets */}
            <div className="mt-8 grid grid-cols-3 gap-2">
              {[[15, 3], [25, 5], [50, 10]].map(([f, b]) => (
                <button key={f} onClick={() => { setFocusMin(f); setBreakMin(b); setRemaining(f * 60); setRunning(false); setMode("focus") }} className={cn("rounded-lg border p-2 text-center transition", focusMin === f ? "border-primary bg-primary/5" : "hover:bg-accent")}>
                  <div className="text-sm font-semibold">{f}/{b}</div>
                  <div className="text-xs text-muted-foreground">focus / break</div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Live stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
          <MiniStat icon={<TimerIcon className="size-4 text-brand-emerald" />} label="This session" value={`${accrued + (mode === "focus" && running ? Math.floor((totalSec - remaining) / 60) : 0)}m`} />
          <MiniStat icon={<Zap className="size-4 text-amber-500" />} label="XP pending" value={`+${(accrued + (mode === "focus" && running ? Math.floor((totalSec - remaining) / 60) : 0)) * 10}`} />
          <MiniStat icon={<Target className="size-4 text-sky-600" />} label="Today's goal" value={`${goalPct.toFixed(0)}%`} />
          <MiniStat icon={<Flame className="size-4 text-orange-500" />} label="Streak" value={`${me?.streak?.current ?? 0}d`} />
        </div>

        <Card className="mt-6 border-dashed bg-card/40">
          <CardContent className="p-4 flex items-center gap-3">
            <Headphones className="size-5 text-brand-emerald shrink-0" />
            <p className="text-sm text-muted-foreground">
              Prefer company? <button onClick={() => navigate("/rooms")} className="text-brand-emerald font-medium hover:underline">Join a live study room</button> and study alongside others — same server-tracked timer, more accountability.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card><CardContent className="p-3 flex items-center gap-2">
      <span className="size-8 rounded-lg bg-muted flex items-center justify-center">{icon}</span>
      <div>
        <div className="text-[10px] text-muted-foreground">{label}</div>
        <div className="text-sm font-bold">{value}</div>
      </div>
    </CardContent></Card>
  )
}

function playChime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.connect(g); g.connect(ctx.destination)
    o.frequency.value = 880
    o.type = "sine"
    g.gain.setValueAtTime(0.0001, ctx.currentTime)
    g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.6)
    o.start(); o.stop(ctx.currentTime + 0.6)
  } catch {}
}
