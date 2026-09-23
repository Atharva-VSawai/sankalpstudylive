"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, formatMinutes, timeAgo, EXAM_META } from "@/components/app/brand"
import { Link } from "@/lib/router"
import { useAuth } from "@/lib/auth-context"
import { SessionNoteDialog } from "@/components/app/session-note-dialog"
import { NotebookPen, Search, Tag, Calendar, Filter, X, BookOpen, TrendingUp, Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import {
  BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell,
} from "recharts"

export function JournalView() {
  const { me } = useAuth()
  const [tag, setTag] = useState("")
  const [from, setFrom] = useState("")
  const [to, setTo] = useState("")
  const [hasNoteOnly, setHasNoteOnly] = useState(false)
  const [search, setSearch] = useState("")
  const [noteFor, setNoteFor] = useState<{ id: string; note: string | null; tags: string[] } | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ["journal", tag, from, to, hasNoteOnly],
    queryFn: () =>
      api.get<{ sessions: any[] }>("/study/sessions", {
        limit: 200,
        tag: tag || undefined,
        from: from || undefined,
        to: to || undefined,
        hasNote: hasNoteOnly ? "true" : undefined,
      }),
  })

  const sessions = (data?.sessions ?? []).filter((s: any) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (s.note?.toLowerCase().includes(q) ?? false) ||
      (s.room?.name?.toLowerCase().includes(q) ?? false) ||
      s.tags?.some((t: string) => t.toLowerCase().includes(q))
    )
  })

  // Aggregate stats
  const stats = useMemo(() => {
    const total = sessions.reduce((a, b) => a + (b.durationMin ?? 0), 0)
    const withNotes = sessions.filter((s: any) => s.note).length
    const tagCounts: Record<string, number> = {}
    for (const s of sessions) {
      for (const t of s.tags ?? []) tagCounts[t] = (tagCounts[t] ?? 0) + 1
    }
    const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 8)
    // daily totals for chart
    const dailyMap: Record<string, number> = {}
    for (const s of sessions) {
      const d = new Date(s.startedAt).toISOString().slice(0, 10)
      dailyMap[d] = (dailyMap[d] ?? 0) + s.durationMin
    }
    const daily = Object.entries(dailyMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-14)
      .map(([date, minutes]) => ({ date: new Date(date + "T00:00:00Z").toLocaleDateString("en", { day: "numeric", month: "short" }), minutes }))
    return { total, withNotes, topTags, daily, tagCounts }
  }, [sessions])

  const allTags = Object.keys(stats.tagCounts).sort()

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 pb-24 md:pb-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2"><NotebookPen className="size-6 text-brand-emerald" /> Study journal</h1>
        <p className="text-muted-foreground">Your full study history with notes, tags and reflections. Filter to find what you worked on.</p>
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Clock className="size-3.5" />Total</div>
          <div className="text-xl font-bold">{formatMinutes(stats.total)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><BookOpen className="size-3.5" />Sessions</div>
          <div className="text-xl font-bold">{sessions.length}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><NotebookPen className="size-3.5" />With notes</div>
          <div className="text-xl font-bold">{stats.withNotes}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Tag className="size-3.5" />Unique tags</div>
          <div className="text-xl font-bold">{allTags.length}</div>
        </CardContent></Card>
      </div>

      {/* Daily chart */}
      {stats.daily.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><TrendingUp className="size-4 text-brand-emerald" /> Daily minutes (last 14 sessions)</CardTitle></CardHeader>
          <CardContent>
            <div className="h-40">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.daily}>
                  <XAxis dataKey="date" tickLine={false} axisLine={false} fontSize={10} />
                  <YAxis hide />
                  <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", fontSize: 12 }} formatter={(v: any) => [`${v} min`, "Studied"]} />
                  <Bar dataKey="minutes" radius={[4, 4, 0, 0]} maxBarSize={28}>
                    {stats.daily.map((d, i) => <Cell key={i} fill={d.minutes > 0 ? "var(--brand-emerald)" : "hsl(var(--muted-foreground) / 0.3)"} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-medium"><Filter className="size-4" /> Filters</div>
          <div className="relative">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search notes, tags, room names…" className="pl-9" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">From</label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">To</label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
            </div>
            <div className="space-y-1 flex items-end">
              <Button variant={hasNoteOnly ? "default" : "outline"} size="sm" className="w-full" onClick={() => setHasNoteOnly(!hasNoteOnly)}>
                <NotebookPen className="size-3.5" /> {hasNoteOnly ? "Has note ✓" : "Has note"}
              </Button>
            </div>
          </div>
          {/* Tag chips */}
          {allTags.length > 0 && (
            <div>
              <div className="text-xs text-muted-foreground mb-1.5">Tags</div>
              <div className="flex flex-wrap gap-1.5">
                {allTags.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTag(tag === t ? "" : t)}
                    className={cn(
                      "text-xs px-2 py-1 rounded-full border transition-colors",
                      tag === t ? "bg-brand-emerald text-white border-brand-emerald" : "hover:bg-accent"
                    )}
                  >
                    #{t} <span className="opacity-70">({stats.tagCounts[t]})</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          {(tag || from || to || hasNoteOnly || search) && (
            <Button variant="ghost" size="sm" onClick={() => { setTag(""); setFrom(""); setTo(""); setHasNoteOnly(false); setSearch("") }}>
              <X className="size-3.5" /> Clear filters
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Sessions list */}
      <div className="space-y-2">
        {isLoading ? (
          <div className="text-center text-muted-foreground py-10">Loading…</div>
        ) : sessions.length === 0 ? (
          <Card><CardContent className="py-16 text-center text-muted-foreground">
            <NotebookPen className="size-10 mx-auto mb-2 opacity-30" />
            No sessions match your filters.
            <div className="mt-3">
              <Button variant="outline" size="sm" onClick={() => { setTag(""); setFrom(""); setTo(""); setHasNoteOnly(false); setSearch("") }}>Clear filters</Button>
            </div>
          </CardContent></Card>
        ) : (
          sessions.map((s: any) => (
            <JournalRow key={s.id} s={s} onNote={(n) => setNoteFor({ id: s.id, note: n, tags: s.tags ?? [] })} />
          ))
        )}
      </div>

      {noteFor && (
        <SessionNoteDialog
          sessionId={noteFor.id}
          open={Boolean(noteFor)}
          onOpenChange={(v) => !v && setNoteFor(null)}
          existingNote={noteFor.note}
          existingTags={noteFor.tags}
        />
      )}
    </div>
  )
}

function JournalRow({ s, onNote }: { s: any; onNote: (existingNote: string | null) => void }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <span className="size-10 rounded-lg bg-brand-emerald/10 flex items-center justify-center text-brand-emerald shrink-0">
            <BookOpen className="size-5" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold truncate">{s.room?.name ?? "Solo focus"}{s.mode === "pomodoro" && " · Pomodoro"}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(s.startedAt).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" })} · {s.community?.name ?? "Open"}
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="font-semibold">{formatMinutes(s.durationMin)}</div>
                <div className="text-xs text-brand-emerald">+{s.xpEarned} XP</div>
              </div>
            </div>
            {s.note && (
              <div className="mt-2 text-sm italic text-muted-foreground border-l-2 border-brand-emerald/40 pl-3">
                "{s.note}"
              </div>
            )}
            {s.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {s.tags.map((t: string) => (
                  <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">#{t}</span>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="mt-2 flex justify-end">
          <button
            onClick={() => onNote(s.note)}
            className="text-xs text-muted-foreground hover:text-brand-emerald inline-flex items-center gap-1"
          >
            <NotebookPen className="size-3" /> {s.note ? "Edit note" : "Add note"}
          </button>
        </div>
      </CardContent>
    </Card>
  )
}
