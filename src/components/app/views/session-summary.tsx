"use client"

import { useQuery } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { CalendarDays, CheckCircle2, Clock3, Flame, Gauge, Home, RefreshCw, Target, TimerReset, Trophy, Zap } from "lucide-react"
import { api } from "@/lib/api-client"
import { useRouter } from "@/lib/router"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { formatMinutes } from "@/components/app/brand"

type Summary = {
  session: {
    id: string
    startedAt: string
    endedAt: string
    durationMin: number
    xpEarned: number
    mode: string
    room: { id: string; name: string } | null
    community: { slug: string; name: string } | null
    date: string
  }
  today: { totalMinutes: number; goalMin: number; achievedMin: number; completed: boolean }
  streak: { current: number; longest: number } | null
}

function dateTime(value: string) {
  return new Date(value).toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function dateOnly(value: string) {
  return new Date(value).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function sessionType(session: Summary["session"]) {
  if (session.community?.name) return `Community · ${session.community.name}`
  return session.mode === "room" ? "Live room" : session.mode.replaceAll("_", " ")
}

export function SessionSummaryView({ sessionId }: { sessionId: string }) {
  const { navigate } = useRouter()
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["study", "session-summary", sessionId],
    queryFn: () => api.get<Summary>(`/study/sessions/${sessionId}/summary`),
    // The room fires finalization before navigating here. Briefly retry while
    // the server commits the finalized row, but still surface a real error if
    // the authenticated stop request failed.
    retry: 5,
    retryDelay: (attempt) => Math.min(750, 150 + attempt * 150),
  })

  if (isLoading) {
    return <div className="mx-auto flex min-h-[60vh] max-w-4xl items-center justify-center px-4"><div className="text-center"><RefreshCw className="mx-auto mb-3 size-7 animate-spin text-brand-emerald" /><p className="text-sm text-muted-foreground">Loading your finalized session…</p></div></div>
  }

  if (error || !data) {
    return <div className="mx-auto flex min-h-[60vh] max-w-lg items-center justify-center px-4"><Card className="w-full"><CardHeader><CardTitle>We couldn’t load this session</CardTitle><CardDescription>The session may still be finalizing, or it may not belong to this account.</CardDescription></CardHeader><CardContent className="flex gap-2"><Button onClick={() => refetch()} disabled={isFetching}><RefreshCw className="size-4" /> Retry</Button><Button variant="outline" onClick={() => navigate("/dashboard")}><Home className="size-4" /> Dashboard</Button></CardContent></Card></div>
  }

  const { session, today, streak } = data
  const goalProgress = today.goalMin > 0 ? Math.min(100, Math.round((today.achievedMin / today.goalMin) * 100)) : 0
  const roomTarget = session.room?.id ? `/rooms/${session.room.id}` : "/study"

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 pb-24 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-start gap-4">
        <div className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-brand-emerald/12 text-brand-emerald"><CheckCircle2 className="size-7" /></div>
        <div><p className="mb-1 text-sm font-medium text-brand-emerald">Session saved</p><h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Session Complete</h1><p className="mt-2 text-muted-foreground">Your server-recorded study time has been saved to your Sankalp account.</p></div>
      </div>

      <Card className="mb-6 overflow-hidden border-brand-emerald/20 bg-gradient-to-br from-brand-emerald/10 via-card to-amber-500/10">
        <CardContent className="grid gap-6 p-6 sm:grid-cols-[1fr_auto] sm:items-center sm:p-8">
          <div><p className="text-sm font-medium text-muted-foreground">Total study duration</p><p className="mt-2 text-5xl font-bold tabular-nums tracking-tight text-brand-emerald sm:text-6xl">{formatMinutes(session.durationMin)}</p><p className="mt-3 text-sm text-muted-foreground">{session.room?.name ?? "Study session"} · {sessionType(session)}</p></div>
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-5 sm:min-w-48"><p className="text-xs font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300">Focused study</p><p className="mt-2 text-2xl font-bold tabular-nums">{formatMinutes(session.durationMin)}</p><p className="mt-1 text-xs text-muted-foreground">Finalized by the server</p></div>
        </CardContent>
      </Card>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <Stat icon={<Clock3 className="size-5" />} label="Recorded time" value={formatMinutes(session.durationMin)} />
        <Stat icon={<Zap className="size-5" />} label="XP earned" value={String(session.xpEarned)} />
        <Stat icon={<Flame className="size-5" />} label="Current streak" value={streak ? `${streak.current} day${streak.current === 1 ? "" : "s"}` : "—"} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
        <Card><CardHeader><CardTitle>Session details</CardTitle><CardDescription>Recorded timestamps and context</CardDescription></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2"><Detail icon={<Home className="size-4" />} label="Room" value={session.room?.name ?? "Study session"} /><Detail icon={<Gauge className="size-4" />} label="Session type" value={sessionType(session)} /><Detail icon={<CalendarDays className="size-4" />} label="Started" value={dateTime(session.startedAt)} /><Detail icon={<CheckCircle2 className="size-4" />} label="Ended" value={dateTime(session.endedAt)} /><Detail icon={<CalendarDays className="size-4" />} label="Date" value={dateOnly(session.date)} /></CardContent></Card>
        <Card><CardHeader><CardTitle>Today’s progress</CardTitle><CardDescription>Your saved study total for today</CardDescription></CardHeader><CardContent><div className="mb-3 flex items-end justify-between"><div><p className="text-3xl font-bold tabular-nums">{formatMinutes(today.totalMinutes)}</p><p className="text-sm text-muted-foreground">of {formatMinutes(today.goalMin)} daily goal</p></div><Target className="mb-1 size-7 text-amber-500" /></div><Progress value={goalProgress} className="h-3 [&_[data-slot=progress-indicator]]:bg-brand-emerald" /><p className="mt-3 text-sm text-muted-foreground">{goalProgress >= 100 ? "Daily goal complete." : `${goalProgress}% of today’s goal`}</p></CardContent></Card>
      </div>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap"><Button onClick={() => navigate(roomTarget)}><RefreshCw className="size-4" /> Study Again</Button><Button variant="outline" onClick={() => navigate("/study")}><TimerReset className="size-4" /> Start Pomodoro</Button><Button variant="outline" onClick={() => navigate("/dashboard")}><Trophy className="size-4" /> View Dashboard</Button></div>
    </div>
  )
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }) { return <Card><CardContent className="flex items-center gap-3 p-5"><div className="flex size-10 items-center justify-center rounded-xl bg-brand-emerald/10 text-brand-emerald">{icon}</div><div><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-bold tabular-nums">{value}</p></div></CardContent></Card> }
function Detail({ icon, label, value }: { icon: ReactNode; label: string; value: string }) { return <div className="flex gap-3"><div className="mt-0.5 text-muted-foreground">{icon}</div><div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="truncate text-sm font-medium">{value}</p></div></div> }
