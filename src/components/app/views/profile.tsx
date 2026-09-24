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
import { ActivityHeatmap } from "@/components/app/activity-heatmap"
import { StreakCalendar } from "@/components/app/streak-calendar"
import { ProfileTimelapses } from "@/components/app/profile-timelapses"

export function ProfileView() {
  const { me } = useAuth()
  const { navigate } = useRouter()
  const qc = useQueryClient()

  const { data: profile } = useQuery({ queryKey: ["profile", "me"], queryFn: () => api.get<any>("/profile") })
  const { data: sessions } = useQuery({ queryKey: ["study", "sessions"], queryFn: () => api.get<{ sessions: any[] }>("/study/sessions") })
  const { data: allBadges } = useQuery({ queryKey: ["badges"], queryFn: () => api.get<{ badges: any[] }>("/study/badges") })
  const { data: ref } = useQuery({ queryKey: ["referrals"], queryFn: () => api.get<any>("/referrals") })

  // /auth/me already provides the core profile. Render from it immediately
  // while the richer profile query loads memberships and full badge data.
  // This removes the second-request blank screen on every profile visit.
  const p = profile?.profile ?? me?.profile
  if (!p) return <div className="p-8 text-center text-muted-foreground">Loading…</div>
  const examMeta = p.examGoal ? EXAM_META[p.examGoal] : null
  const earned = p.badges ?? []
  const earnedSlugs = new Set(earned.map((b: any) => b.slug))
  const locked = (allBadges?.badges ?? []).filter((b: any) => !earnedSlugs.has(b.slug))

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

      {/* Communities — the user's actual CommunityMember relationships (max 2) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2"><BookOpen className="size-4 text-brand-emerald" /> Communities</span>
            <span className="text-xs font-normal text-muted-foreground">{profile?.membershipCount ?? 0}/2 joined</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {(profile?.memberships ?? []).length === 0 ? (
            <div className="text-center py-4">
              <BookOpen className="size-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm text-muted-foreground">You haven't joined any communities yet.</p>
              <p className="text-xs text-muted-foreground mt-1">You can join up to 2 communities.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={() => navigate("/communities")}>Browse communities</Button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {(profile?.memberships ?? []).map((m: any) => (
                  <div key={m.communityId} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent transition-colors">
                    <div className="size-10 rounded-xl flex items-center justify-center text-white font-bold text-sm shrink-0" style={{ background: m.community.color }}>
                      {m.community.name.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{m.community.name}</div>
                      <div className="text-xs text-muted-foreground truncate">{m.community.examGoal}</div>
                    </div>
                    <Link to={`/communities/${m.community.slug}`}>
                      <Button variant="ghost" size="sm">View</Button>
                    </Link>
                  </div>
                ))}
              </div>
              {(profile?.membershipCount ?? 0) < 2 && (
                <div className="mt-3 pt-3 border-t flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">You can join {2 - (profile?.membershipCount ?? 0)} more community{2 - (profile?.membershipCount ?? 0) === 1 ? "" : "ies"}.</p>
                  <Button variant="outline" size="sm" onClick={() => navigate("/communities")}>Browse</Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Study Timelapses — thumbnails only; click to play via signed URL */}
      <ProfileTimelapses />

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
          <div className="mt-4 pt-4 border-t">
            <div className="text-xs text-muted-foreground mb-2">Contribution graph (last 20 weeks)</div>
            <ActivityHeatmap weeks={20} />
          </div>
        </CardContent>
      </Card>

      {/* Badges showcase — earned + locked */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between">
            <span className="flex items-center gap-2"><Award className="size-4 text-amber-500" /> Badges</span>
            <span className="text-xs font-normal text-muted-foreground">{earned.length}/{(allBadges?.badges?.length ?? 0)} earned</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            {earned.map((b: any) => (
              <div
                key={b.slug}
                className="group relative rounded-lg border p-3 text-center bg-gradient-to-b from-accent/40 to-accent/10 hover:shadow-md transition-all cursor-default"
                title={b.description}
              >
                <div className="text-2xl group-hover:scale-110 transition-transform">{tierEmoji(b.tier)}</div>
                <div className="text-[10px] font-semibold mt-1 leading-tight">{b.name}</div>
                <div className="text-[8px] text-muted-foreground mt-0.5 capitalize">{b.tier}</div>
                <div className="absolute z-10 bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-popover text-popover-foreground text-xs rounded-lg px-2 py-1 shadow-lg whitespace-nowrap border max-w-[160px] normal-case font-normal">
                  {b.description}
                </div>
              </div>
            ))}
            {locked.map((b: any) => (
              <div
                key={b.slug}
                className="group relative rounded-lg border border-dashed p-3 text-center opacity-50 hover:opacity-80 transition-opacity cursor-default"
                title={`Locked: ${b.description}`}
              >
                <div className="text-2xl grayscale">{tierEmoji(b.tier)}</div>
                <div className="text-[10px] font-semibold mt-1 leading-tight text-muted-foreground">{b.name}</div>
                <div className="text-[8px] text-muted-foreground/70 mt-0.5 capitalize">{b.tier}</div>
                <div className="absolute z-10 bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-popover text-popover-foreground text-xs rounded-lg px-2 py-1 shadow-lg whitespace-nowrap border max-w-[160px] normal-case font-normal">
                  🔒 {b.description}
                </div>
              </div>
            ))}
            {earned.length === 0 && locked.length === 0 && (
              <div className="col-span-full text-center py-6">
                <Award className="size-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm text-muted-foreground">No badges yet. Study to earn your first!</p>
              </div>
            )}
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
                <div key={s.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-accent">
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
                  <div className="text-right shrink-0">
                    <div className="text-sm font-semibold">{formatMinutes(s.durationMin)}</div>
                    <div className="text-xs text-brand-emerald">+{s.xpEarned} XP</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Streak calendar — month grid */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Flame className="size-4 text-orange-500" /> Streak calendar</CardTitle></CardHeader>
        <CardContent>
          <StreakCalendar />
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
