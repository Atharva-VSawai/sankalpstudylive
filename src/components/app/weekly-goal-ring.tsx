"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Target, Check } from "lucide-react"
import { cn } from "@/lib/utils"

// A circular progress ring showing how many of the last 7 days hit the daily goal.
// Uses /api/study/weekly + /api/study/goals data.

export function WeeklyGoalRing() {
  const { data: weekly } = useQuery({
    queryKey: ["study", "weekly"],
    queryFn: () => api.get<any>("/study/weekly"),
  })
  const { data: goals } = useQuery({
    queryKey: ["goals"],
    queryFn: () => api.get<{ goals: any[] }>("/study/goals"),
  })

  // Count goal-hit days in the last 7 days from the goals history
  const last7Goals = (goals?.goals ?? []).slice(-7)
  const goalHitDays = last7Goals.filter((g: any) => g.completed).length
  const totalDays = last7Goals.length || 1
  const pct = (goalHitDays / totalDays) * 100

  // SVG ring
  const radius = 42
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (pct / 100) * circumference

  const allHit = goalHitDays >= 7
  const someHit = goalHitDays > 0

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="size-4 text-brand-emerald" /> Weekly goal progress
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-5">
          {/* Ring */}
          <div className="relative shrink-0">
            <svg width="110" height="110" viewBox="0 0 110 110" className="-rotate-90">
              <circle cx="55" cy="55" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="9" />
              <circle
                cx="55"
                cy="55"
                r={radius}
                fill="none"
                stroke={allHit ? "var(--brand-saffron)" : "var(--brand-emerald)"}
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={offset}
                className="transition-all duration-700"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {allHit ? (
                <Check className="size-7 text-brand-saffron" />
              ) : (
                <>
                  <span className="text-2xl font-bold tabular-nums">{goalHitDays}</span>
                  <span className="text-[10px] text-muted-foreground">/ {totalDays} days</span>
                </>
              )}
            </div>
          </div>

          {/* Legend + days dots */}
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium mb-1">
              {allHit ? "Perfect week! 🎉" : someHit ? `${goalHitDays} of ${totalDays} days hit` : "No goals hit yet"}
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              {allHit
                ? "You hit your daily goal every day this week. Incredible resolve."
                : someHit
                  ? "Keep showing up. Every green day compounds."
                  : "Start a session today to hit your first goal this week."}
            </p>
            {/* Day dots */}
            <div className="flex gap-1.5">
              {last7Goals.map((g: any, i: number) => {
                const d = new Date(g.date)
                const label = d.toLocaleDateString("en", { weekday: "narrow" })
                return (
                  <div
                    key={i}
                    title={`${d.toLocaleDateString("en", { weekday: "short", day: "numeric" })}: ${g.completed ? "goal hit" : `${g.achievedMin}/${g.targetMin}m`}`}
                    className={cn(
                      "flex flex-col items-center gap-0.5",
                    )}
                  >
                    <div
                      className={cn(
                        "size-7 rounded-md flex items-center justify-center text-[10px] font-bold",
                        g.completed
                          ? "bg-brand-emerald text-white"
                          : g.achievedMin > 0
                            ? "bg-brand-emerald/30 text-emerald-900 dark:text-emerald-100"
                            : "bg-muted text-muted-foreground"
                      )}
                    >
                      {g.completed ? <Check className="size-3.5" /> : label}
                    </div>
                  </div>
                )
              })}
              {last7Goals.length === 0 && (
                <div className="text-xs text-muted-foreground py-2">No goal history yet.</div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
