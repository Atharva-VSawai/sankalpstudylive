"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Award, Flame, Zap, Target, Clock, TrendingUp } from "lucide-react"
import { formatMinutes } from "@/components/app/brand"
import { cn } from "@/lib/utils"

export function AchievementsThisWeek() {
  const { data, isLoading } = useQuery({
    queryKey: ["achievements"],
    queryFn: () => api.get<any>("/study/achievements"),
  })

  if (isLoading) return <div className="h-40 rounded-xl bg-muted/40 animate-pulse" />
  if (!data) return null

  const a = data
  const hasAny =
    (a.badges?.length ?? 0) > 0 ||
    a.totalXp > 0 ||
    a.longestSession > 0 ||
    a.goalHitDays > 0 ||
    a.streakMilestone

  if (!hasAny) {
    return (
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Award className="size-4 text-amber-500" /> This week's achievements</CardTitle></CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <p className="text-sm text-muted-foreground">No achievements yet this week.</p>
            <p className="text-xs text-muted-foreground mt-1">Study to earn XP, badges and streak milestones! 🔥</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const tierEmoji = (t: string) => ({ bronze: "🥉", silver: "🥈", gold: "🥇", platinum: "💎" }[t] || "🏅")

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Award className="size-4 text-amber-500" /> This week's achievements</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {/* Stat pills */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {a.totalXp > 0 && (
            <Pill icon={<Zap className="size-3.5 text-amber-500" />} label="XP earned" value={`+${a.totalXp}`} tint="bg-amber-50 dark:bg-amber-950/30" />
          )}
          {a.longestSession > 0 && (
            <Pill icon={<Clock className="size-3.5 text-sky-600" />} label="Longest" value={formatMinutes(a.longestSession)} tint="bg-sky-50 dark:bg-sky-950/30" />
          )}
          {a.goalHitDays > 0 && (
            <Pill icon={<Target className="size-3.5 text-brand-emerald" />} label="Goals hit" value={`${a.goalHitDays}/7`} tint="bg-emerald-50 dark:bg-emerald-950/30" />
          )}
          {a.streakMilestone && (
            <Pill icon={<Flame className="size-3.5 text-orange-500" />} label="Streak" value={`${a.streakMilestone}d 🔥`} tint="bg-orange-50 dark:bg-orange-950/30" />
          )}
        </div>

        {/* Badges earned */}
        {a.badges?.length > 0 && (
          <div>
            <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1"><TrendingUp className="size-3" /> Badges earned this week</div>
            <div className="flex flex-wrap gap-2">
              {a.badges.map((b: any) => (
                <div key={b.slug} className="flex items-center gap-2 rounded-lg border bg-accent/30 px-3 py-1.5" title={b.description}>
                  <span className="text-lg">{tierEmoji(b.tier)}</span>
                  <div>
                    <div className="text-xs font-semibold">{b.name}</div>
                    <div className="text-[10px] text-muted-foreground">{b.tier}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Session count footer */}
        {a.sessionCount > 0 && (
          <div className="text-xs text-muted-foreground pt-2 border-t">
            {a.sessionCount} session{a.sessionCount !== 1 ? "s" : ""} this week
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function Pill({ icon, label, value, tint }: { icon: React.ReactNode; label: string; value: string; tint: string }) {
  return (
    <div className={cn("rounded-lg p-2.5 text-center", tint)}>
      <div className="flex items-center justify-center gap-1 text-[10px] text-muted-foreground mb-0.5">{icon}{label}</div>
      <div className="text-sm font-bold">{value}</div>
    </div>
  )
}
