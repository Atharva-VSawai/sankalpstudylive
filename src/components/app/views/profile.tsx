"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Avatar, formatMinutes, timeAgo, EXAM_META } from "@/components/app/brand"
import { Link, useRouter } from "@/lib/router"
import { useAuth } from "@/lib/auth-context"
import { Settings, Share2, Flame, Clock, Sparkles, Award, BookOpen, Copy, Trophy, Calendar } from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts"
import { toast } from "sonner"

export function ProfileView() {
  const { me } = useAuth()
  const { navigate } = useRouter()
  const qc = useQueryClient()

  const { data: profile } = useQuery({ queryKey: ["profile", "me"], queryFn: () => api.get<any>("/profile") })
  const { data: sessions } = useQuery({ queryKey: ["study", "sessions"], queryFn: () => api.get<{ sessions: any[] }>("/study/sessions") })
  const { data: ref } = useQuery({ queryKey: ["referrals"], queryFn: () => api.get<any>("/referrals") })

  const p = profile?.profile
  if (!p) return <div className="p-8 text-center text-muted-foreground">Loading…</div>
  const examMeta = p.examGoal ? EXAM_META[p.examGoal] : null
  const earned = p.badges ?? []

  // last 14 days study minutes
  const dayMap = new Map<string, number>()
  for (const s of sessions?.sessions ?? []) {
    const d = new Date(s.startedAt).toISOString().slice(0, 10)
    dayMap.set(d, (dayMap.get(d) ?? 0) + s.durationMin)
  }
  const last14 = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - (13 - i) * 86400000)
    const key = d.toISOString().slice(0, 10)
    return { day: d.toLocaleDateString("en", { day: "numeric", month: "short" }), minutes: dayMap.get(key) ?? 0 }
  })

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 pb-24 md:pb-8 space-y-6">
      {/* Header */}
      <Card className="overflow-hidden">
        {examMeta && <div className="h-20" style={{ background: `linear-gradient(135deg, ${examMeta.color}, ${examMeta.color}aa)` }} />}
        <CardContent className={`p-6 ${examMeta ? "-mt-10" : ""}`}>
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <Avatar name={p.displayName} src={p.avatarUrl} size={80} className="ring-4 ring-background" />
            <div className="flex-1">
              <h1 className="text-2xl font-bold">{p.displayName}</h1>
              <div className="text-sm text-muted-foreground">@{p.username}</div>
              {p.bio && <p className="mt-2 text-sm">{p.bio}</p>}
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                {p.examGoal && <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: `${examMeta?.color}22`, color: examMeta?.color }}><BookOpen className="size-3" /> {p.examGoal}</span>}
                {p.targetYear && <span className="px-2 py-0.5 rounded-full bg-muted">Target {p.targetYear}</span>}
                <span className="px-2 py-0.5 rounded-full bg-muted">Lvl {p.level}</span>
              </div>
            </div>
            <Button variant="outline" onClick={() => navigate("/settings")}><Settings className="size-4" /> Edit</Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat icon={<Flame className="size-5 text-orange-500" />} label="Current streak" value={`${profile?.streak?.current ?? 0}d`} sub={`Longest ${profile?.streak?.longest ?? 0}d`} />
        <Stat icon={<Sparkles className="size-5 text-brand-emerald" />} label="Total XP" value={(p.totalXp ?? 0).toLocaleString()} sub={`Level ${p.level}`} />
        <Stat icon={<Clock className="size-5 text-sky-600" />} label="Studied" value={formatMinutes(p.totalMinutes ?? 0)} sub="All time" />
        <Stat icon={<Trophy className="size-5 text-amber-500" />} label="Sessions" value={`${sessions?.sessions.length ?? 0}`} sub="completed" />
      </div>

      {/* Activity chart */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Calendar className="size-4" /> Last 14 days</CardTitle></CardHeader>
        <CardContent>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={last14}>
                <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={10} interval={1} />
                <YAxis hide />
                <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", fontSize: 12 }} formatter={(v: any) => [`${v} min`, "Studied"]} />
                <Bar dataKey="minutes" radius={[4, 4, 0, 0]} maxBarSize={24}>
                  {last14.map((d, i) => <Cell key={i} fill={d.minutes > 0 ? "var(--brand-emerald)" : "hsl(var(--muted-foreground) / 0.3)"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Badges */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Award className="size-4 text-amber-500" /> Badges ({earned.length})</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {earned.map((b: any) => (
              <div key={b.slug} className="rounded-lg border p-3 text-center bg-accent/30" title={b.description}>
                <div className="text-2xl">{tierEmoji(b.tier)}</div>
                <div className="text-[10px] font-semibold mt-1 leading-tight">{b.name}</div>
              </div>
            ))}
            {earned.length === 0 && <p className="text-sm text-muted-foreground col-span-full py-4">No badges yet. Study to earn your first!</p>}
          </div>
        </CardContent>
      </Card>

      {/* Recent sessions */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><BookOpen className="size-4" /> Recent sessions</CardTitle></CardHeader>
        <CardContent>
          {(sessions?.sessions ?? []).length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">No sessions yet.</p> : (
            <div className="space-y-1">
              {(sessions?.sessions ?? []).slice(0, 6).map((s: any) => (
                <div key={s.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent">
                  <span className="size-9 rounded-lg bg-brand-emerald/10 flex items-center justify-center text-brand-emerald"><BookOpen className="size-4" /></span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{s.room?.name ?? "Solo focus"}{s.mode === "pomodoro" && " · Pomodoro"}</div>
                    <div className="text-xs text-muted-foreground">{timeAgo(s.startedAt)} · {s.community?.name ?? "Open"}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold">{formatMinutes(s.durationMin)}</div>
                    <div className="text-xs text-brand-emerald">+{s.xpEarned} XP</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Referral */}
      {ref?.code && (
        <Card className="border-dashed">
          <CardContent className="p-5">
            <div className="flex items-center gap-2 mb-2"><Share2 className="size-4 text-brand-emerald" /><h3 className="font-semibold">Refer a friend</h3></div>
            <p className="text-sm text-muted-foreground mb-3">Invite aspirants. You earn badges when they finish their first session.</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 px-3 py-2 rounded-md bg-muted text-sm font-mono">{ref.code}</code>
              <Button variant="outline" size="sm" onClick={() => { navigator.clipboard?.writeText(ref.code); toast.success("Referral code copied") }}><Copy className="size-4" /> Copy</Button>
            </div>
            <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
              <span>{ref.referredCount} signed up</span>
              <span>{ref.firstSessionCount} first sessions</span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function Stat({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="flex items-center gap-2 mb-1">{icon}<span className="text-xs text-muted-foreground">{label}</span></div>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </CardContent></Card>
  )
}
function tierEmoji(t: string) { return { bronze: "🥉", silver: "🥈", gold: "🥇", platinum: "💎" }[t] || "🏅" }
