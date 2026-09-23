"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, formatMinutes, EXAM_META } from "@/components/app/brand"
import { useAuth } from "@/lib/auth-context"
import { Link } from "@/lib/router"
import { Trophy, Crown, Medal, Globe, Users, Heart } from "lucide-react"
import { cn } from "@/lib/utils"

export function LeaderboardView() {
  const { me } = useAuth()
  const [scope, setScope] = useState<"global" | "community" | "friends">("global")
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly" | "alltime">("weekly")
  const [communitySlug, setCommunitySlug] = useState(me?.profile?.examGoal?.toLowerCase().replace(/\s+/g, "-") || "gate")

  const { data: commData } = useQuery({ queryKey: ["communities"], queryFn: () => api.get<{ communities: any[] }>("/communities") })
  const { data, isLoading } = useQuery({
    queryKey: ["leaderboard", scope, period, communitySlug],
    queryFn: () => api.get<{ rows: any[] }>("/leaderboard", {
      scope,
      period,
      communitySlug: scope === "community" ? communitySlug : undefined,
      limit: 50,
    }),
  })

  const rows = data?.rows ?? []

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 pb-24 md:pb-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Trophy className="size-6 text-amber-500" /> Leaderboard</h1>
        <p className="text-muted-foreground">Server-tracked study minutes. No client-reported time counts.</p>
      </div>

      {/* Scope + period */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="inline-flex rounded-lg bg-muted p-1">
          {([
            { id: "global", icon: <Globe className="size-3.5" />, label: "Global" },
            { id: "community", icon: <Users className="size-3.5" />, label: "Community" },
            { id: "friends", icon: <Heart className="size-3.5" />, label: "Friends" },
          ] as const).map((s) => (
            <button key={s.id} onClick={() => setScope(s.id)} className={cn("px-3 py-1.5 rounded-md text-sm font-medium inline-flex items-center gap-1.5 transition", scope === s.id ? "bg-background shadow-sm" : "text-muted-foreground")}>
              {s.icon} {s.label}
            </button>
          ))}
        </div>
        <div className="inline-flex rounded-lg bg-muted p-1">
          {(["daily", "weekly", "monthly", "alltime"] as const).map((p) => (
            <button key={p} onClick={() => setPeriod(p)} className={cn("px-3 py-1.5 rounded-md text-sm font-medium capitalize transition", period === p ? "bg-background shadow-sm" : "text-muted-foreground")}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {scope === "community" && (
        <select value={communitySlug} onChange={(e) => setCommunitySlug(e.target.value)} className="mb-4 h-9 rounded-md border bg-background px-3 text-sm">
          {commData?.communities.map((c: any) => <option key={c.id} value={c.slug}>{c.name}</option>)}
        </select>
      )}

      <Card>
        <CardContent className="p-0">
          {isLoading ? <div className="py-10 text-center text-muted-foreground">Loading…</div> : rows.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <Trophy className="size-10 mx-auto mb-2 opacity-30" />
              No one on this leaderboard yet. Be the first — start studying!
            </div>
          ) : (
            <div className="divide-y">
              {/* Podium for top 3 */}
              {rows.length >= 3 && (
                <div className="grid grid-cols-3 gap-2 p-4 bg-gradient-to-b from-amber-50/50 to-transparent dark:from-amber-950/20">
                  {[1, 0, 2].map((idx) => {
                    const r = rows[idx]
                    const heights = ["h-24", "h-28", "h-20"]
                    const medals = ["🥈", "🥇", "🥉"]
                    return (
                      <div key={r.userId} className="flex flex-col items-center">
                        <Avatar name={r.displayName} src={r.avatarUrl} size={48} ring speaking={idx === 0} />
                        <div className="text-sm font-semibold truncate max-w-full mt-1">{r.displayName}</div>
                        <div className="text-xs text-muted-foreground">{formatMinutes(r.minutes)}</div>
                        <div className={cn("mt-1 w-full rounded-t-lg flex items-start justify-center text-2xl", heights[idx], idx === 0 ? "bg-amber-500/20" : idx === 1 ? "bg-slate-400/20" : "bg-amber-700/20")}>
                          <span className="pt-1">{medals[idx]}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              {/* List */}
              {rows.map((r: any, i: number) => (
                <Link key={r.userId} to={`/profile/${r.username}`}>
                  <div className={cn("flex items-center gap-3 p-3 hover:bg-accent transition", r.userId === me?.id && "bg-primary/5")}>
                    <span className="size-8 flex items-center justify-center text-sm font-bold text-muted-foreground w-8">{r.rank}</span>
                    {r.rank <= 3 ? (
                      <span className="text-lg">{["🥇", "🥈", "🥉"][r.rank - 1]}</span>
                    ) : null}
                    <Avatar name={r.displayName} src={r.avatarUrl} size={36} />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{r.displayName}{r.userId === me?.id && <span className="text-xs text-muted-foreground ml-1">(you)</span>}</div>
                      <div className="text-xs text-muted-foreground">@{r.username} · {r.examGoal ?? "—"} · Lvl {r.level}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold">{formatMinutes(r.minutes)}</div>
                      <div className="text-xs text-brand-emerald">{r.xp.toLocaleString()} XP</div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
