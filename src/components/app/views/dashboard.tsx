"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Avatar, formatMinutes, timeAgo, EXAM_META } from "@/components/app/brand"
import { Link, useRouter } from "@/lib/router"
import { useAuth } from "@/lib/auth-context"
import { ActivityHeatmap } from "@/components/app/activity-heatmap"
import { StreakFreezeCard } from "@/components/app/streak-freeze-card"
import { WeeklyStatsCard } from "@/components/app/weekly-stats-card"
import { WeeklyGoalRing } from "@/components/app/weekly-goal-ring"
import { GoalTrendSparkline } from "@/components/app/goal-trend-sparkline"
import { AchievementsThisWeek } from "@/components/app/achievements-this-week"
import { SessionNoteDialog } from "@/components/app/session-note-dialog"
import { useState } from "react"
import { NotebookPen, Clock as ClockIcon } from "lucide-react"
import { Flame, Target, Sparkles, Trophy, Play, Video, Users, Clock, ArrowRight, Zap, Award, BookOpen, TrendingUp } from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts"

export function DashboardView() {
  const { me } = useAuth()
  const { navigate } = useRouter()
  const qc = useQueryClient()

  const { data: goal } = useQuery({ queryKey: ["goals", "today"], queryFn: () => api.get<any>("/study/goals/today") })
  const { data: goalsHistory } = useQuery({ queryKey: ["goals"], queryFn: () => api.get<{ goals: any[] }>("/study/goals") })
  const { data: sessions } = useQuery({ queryKey: ["study", "sessions"], queryFn: () => api.get<{ sessions: any[] }>("/study/sessions") })
  const { data: badges } = useQuery({ queryKey: ["badges"], queryFn: () => api.get<{ badges: any[] }>("/study/badges") })
  const { data: lb } = useQuery({ queryKey: ["leaderboard", "dashboard"], queryFn: () => api.get<{ rows: any[] }>("/leaderboard", { period: "weekly", limit: 5 }) })
  const { data: rooms } = useQuery({ queryKey: ["rooms", "dashboard"], queryFn: () => api.get<{ rooms: any[] }>("/rooms", { live: true, limit: 4 }) })

  const p = me?.profile
  const streak = me?.streak
  const goalPct = goal && goal.targetMin > 0 ? Math.min(100, Math.round((goal.achievedMin / goal.targetMin) * 100)) : 0
  const earnedBadges = badges?.badges.filter((b: any) => b.earned) ?? []
  const examMeta = p?.examGoal ? EXAM_META[p.examGoal] : null

  const weekData = (goalsHistory?.goals ?? []).slice(-7).map((g: any) => ({
    day: new Date(g.date).toLocaleDateString("en", { weekday: "short" }),
    minutes: g.achievedMin,
    target: g.targetMin,
  }))

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 pb-24 md:pb-8 space-y-6">
      {/* Greeting */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Hi, {p?.displayName?.split(" ")[0]} 👋</h1>
          <p className="text-muted-foreground">{greeting()} — {p?.examGoal ? `preparing for ${p.examGoal}` : "let's study"}.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => navigate("/study")}><Play className="size-4" /> Solo study</Button>
          <Button variant="outline" onClick={() => navigate("/rooms")}><Video className="size-4" /> Join a room</Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Flame className="size-5 text-orange-500" />} label="Current streak" value={`${streak?.current ?? 0}`} sub={`Longest: ${streak?.longest ?? 0}d`} tint="bg-orange-50 dark:bg-orange-950/30" />
        <StatCard icon={<Sparkles className="size-5 text-brand-emerald" />} label="Level" value={`${p?.level ?? 1}`} sub={`${(p?.totalXp ?? 0).toLocaleString()} XP`} tint="bg-emerald-50 dark:bg-emerald-950/30" />
        <StatCard icon={<Clock className="size-5 text-sky-600" />} label="Total studied" value={formatMinutes(p?.totalMinutes ?? 0)} sub="All time" tint="bg-sky-50 dark:bg-sky-950/30" />
        <StatCard icon={<Award className="size-5 text-amber-500" />} label="Badges" value={`${earnedBadges.length}`} sub={`${badges?.badges.length ?? 12} available`} tint="bg-amber-50 dark:bg-amber-950/30" />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Today's goal */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2"><Target className="size-4 text-brand-emerald" /> Today's goal</span>
              <Button variant="ghost" size="sm" onClick={() => navigate("/settings")} className="text-xs">Adjust</Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end justify-between mb-2">
              <div>
                <span className="text-3xl font-bold">{formatMinutes(goal?.achievedMin ?? 0)}</span>
                <span className="text-muted-foreground"> / {formatMinutes(goal?.targetMin ?? 360)}</span>
              </div>
              <span className={`text-sm font-semibold ${goal?.completed ? "text-brand-emerald" : "text-muted-foreground"}`}>
                {goal?.completed ? "Goal complete! 🎉" : `${goalPct}%`}
              </span>
            </div>
            <Progress value={goalPct} className="h-2.5" />
            {weekData.length > 0 && (
              <div className="mt-5">
                <div className="text-xs text-muted-foreground mb-2">Last {weekData.length} days</div>
                <div className="h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weekData}>
                      <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={11} />
                      <YAxis hide />
                      <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", fontSize: 12 }} formatter={(v: any) => [`${v} min`, "Studied"]} />
                      <Bar dataKey="minutes" radius={[6, 6, 0, 0]} maxBarSize={36}>
                        {weekData.map((d, i) => (
                          <Cell key={i} fill={d.minutes >= d.target ? "var(--brand-emerald)" : "hsl(var(--muted-foreground) / 0.5)"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Leaderboard preview */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center justify-between">
              <span className="flex items-center gap-2"><Trophy className="size-4 text-accent-foreground" /> Weekly top</span>
              <Link to="/leaderboard" className="text-xs text-brand-emerald inline-flex items-center">All <ArrowRight className="size-3" /></Link>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(lb?.rows ?? []).map((r: any, i: number) => (
              <div key={r.userId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent">
                <span className={`size-6 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? "bg-amber-500 text-white" : i === 1 ? "bg-slate-400 text-white" : i === 2 ? "bg-amber-700 text-white" : "bg-muted text-muted-foreground"}`}>{r.rank}</span>
                <Avatar name={r.displayName} src={r.avatarUrl} size={28} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{r.displayName}{r.userId === me?.id && " (you)"}</div>
                  <div className="text-xs text-muted-foreground">{r.examGoal ?? "—"} · Lvl {r.level}</div>
                </div>
                <span className="text-xs font-semibold">{formatMinutes(r.minutes)}</span>
              </div>
            ))}
            {(lb?.rows ?? []).length === 0 && <p className="text-xs text-muted-foreground text-center py-4">No data this week. Be the first!</p>}
          </CardContent>
        </Card>
      </div>

      {/* Live rooms */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold flex items-center gap-2"><Video className="size-4 text-brand-emerald" /> Live rooms</h2>
          <Link to="/rooms" className="text-sm text-brand-emerald inline-flex items-center">Browse all <ArrowRight className="size-3.5" /></Link>
        </div>
        {(rooms?.rooms ?? []).length === 0 ? (
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No live rooms. <Button variant="link" onClick={() => navigate("/rooms")}>Host one →</Button></CardContent></Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {(rooms?.rooms ?? []).slice(0, 4).map((r: any) => (
              <Link key={r.id} to={`/rooms/${r.id}`}>
                <Card className="hover:shadow-md transition-shadow h-full">
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-bold text-red-500 inline-flex items-center gap-1"><span className="size-1.5 rounded-full bg-red-500" />LIVE</span>
                      <span className="text-xs text-muted-foreground inline-flex items-center gap-0.5"><Users className="size-3" />{r.participantCount}</span>
                    </div>
                    <h3 className="text-sm font-semibold truncate">{r.name}</h3>
                    <p className="text-xs text-muted-foreground truncate">{r.owner?.displayName}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Goal trend sparkline (full width) */}
      <GoalTrendSparkline />

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Recent sessions */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Clock className="size-4" /> Recent study sessions</CardTitle></CardHeader>
          <CardContent>
            {(sessions?.sessions ?? []).length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-muted-foreground mb-3">No sessions yet. Start your first study session.</p>
                <Button onClick={() => navigate("/study")}><Play className="size-4" /> Start studying</Button>
              </div>
            ) : (
              <div className="space-y-1">
                {(sessions?.sessions ?? []).slice(0, 8).map((s: any) => (
                  <SessionRow key={s.id} s={s} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Badges */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Award className="size-4 text-amber-500" /> Badges</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-4 gap-2">
              {(badges?.badges ?? []).slice(0, 12).map((b: any) => (
                <div key={b.slug} className={`aspect-square rounded-lg border flex flex-col items-center justify-center p-1 text-center ${b.earned ? "bg-accent/40" : "opacity-40"}`} title={b.description}>
                  <div className="text-lg">{tierEmoji(b.tier)}</div>
                  <div className="text-[8px] leading-tight font-medium mt-0.5 line-clamp-2">{b.name}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Achievements this week */}
      <AchievementsThisWeek />

      {/* Activity heatmap + streak freeze */}
      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="size-4 text-brand-emerald" /> Study activity</CardTitle>
          </CardHeader>
          <CardContent>
            <ActivityHeatmap weeks={14} />
          </CardContent>
        </Card>
        <div className="space-y-4">
          <WeeklyGoalRing />
          <WeeklyStatsCard />
          <StreakFreezeCard />
        </div>
      </div>
    </div>
  )
}

function StatCard({ icon, label, value, sub, tint }: { icon: React.ReactNode; label: string; value: string; sub: string; tint: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="flex items-center gap-3">
        <span className={`size-10 rounded-xl flex items-center justify-center ${tint}`}>{icon}</span>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-xl font-bold leading-tight">{value}</div>
          <div className="text-xs text-muted-foreground truncate">{sub}</div>
        </div>
      </div>
    </CardContent></Card>
  )
}

function greeting() {
  const h = new Date().getHours()
  if (h < 5) return "Burning the midnight oil"
  if (h < 12) return "Good morning"
  if (h < 17) return "Good afternoon"
  if (h < 21) return "Good evening"
  return "Good night"
}

function tierEmoji(t: string) {
  return { bronze: "🥉", silver: "🥈", gold: "🥇", platinum: "💎" }[t] || "🏅"
}

function SessionRow({ s }: { s: any }) {
  const [noteOpen, setNoteOpen] = useState(false)
  return (
    <>
      <div className="flex items-start gap-3 p-2 rounded-lg hover:bg-accent">
        <span className="size-9 rounded-lg bg-brand-emerald/10 flex items-center justify-center text-brand-emerald shrink-0"><BookOpen className="size-4" /></span>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{s.room?.name ?? "Solo focus"}{s.mode === "pomodoro" && " · Pomodoro"}</div>
          <div className="text-xs text-muted-foreground">{timeAgo(s.startedAt)} · {s.community?.name ?? "Open"}</div>
          {s.note && <div className="text-xs mt-1 line-clamp-2 italic text-muted-foreground/80">"{s.note}"</div>}
          {s.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {s.tags.map((t: string) => (
                <span key={t} className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">#{t}</span>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <div className="text-sm font-semibold">{formatMinutes(s.durationMin)}</div>
          <div className="text-xs text-brand-emerald">+{s.xpEarned} XP</div>
          <button
            onClick={() => setNoteOpen(true)}
            className="text-[10px] text-muted-foreground hover:text-brand-emerald inline-flex items-center gap-0.5 mt-0.5"
            title={s.note ? "Edit note" : "Add note"}
          >
            <NotebookPen className="size-3" /> {s.note ? "Edit" : "Note"}
          </button>
        </div>
      </div>
      <SessionNoteDialog
        sessionId={s.id}
        open={noteOpen}
        onOpenChange={setNoteOpen}
        existingNote={s.note}
        existingTags={s.tags}
      />
    </>
  )
}
