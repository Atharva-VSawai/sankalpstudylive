"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import { cn } from "@/lib/utils"

// GitHub-style contribution graph for study minutes.
// 12 weeks × 7 days. Color intensity by minutes studied.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const DOW = ["Mon", "Wed", "Fri"]

function intensity(min: number): string {
  if (min <= 0) return "bg-muted"
  if (min < 30) return "bg-brand-emerald/20"
  if (min < 60) return "bg-brand-emerald/40"
  if (min < 120) return "bg-brand-emerald/60"
  if (min < 240) return "bg-brand-emerald/80"
  return "bg-brand-emerald"
}

export function ActivityHeatmap({ weeks = 12, compact = false }: { weeks?: number; compact?: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ["heatmap", weeks],
    queryFn: () => api.get<{ days: { date: string; minutes: number }[]; totalMinutes: number; activeDays: number }>(`/study/heatmap?weeks=${weeks}`),
  })

  if (isLoading) {
    return <div className="h-24 rounded-lg bg-muted/40 animate-pulse" />
  }
  const days = data?.days ?? []
  if (days.length === 0) return <div className="text-xs text-muted-foreground">No activity yet.</div>

  // group into weeks (columns), each week is 7 days Sun→Sat
  const weekCols: { date: string; minutes: number }[][] = []
  for (let i = 0; i < days.length; i += 7) {
    weekCols.push(days.slice(i, i + 7))
  }

  // month labels: show month when the first day of a week changes month
  const monthLabels: { col: number; label: string }[] = []
  let lastMonth = -1
  weekCols.forEach((week, i) => {
    const first = new Date(week[0].date + "T00:00:00Z")
    const m = first.getUTCMonth()
    if (m !== lastMonth) {
      monthLabels.push({ col: i, label: MONTHS[m] })
      lastMonth = m
    }
  })

  return (
    <div>
      {!compact && (
        <div className="flex items-center justify-between mb-2 text-xs">
          <span className="text-muted-foreground">
            <span className="font-semibold text-foreground">{data?.activeDays ?? 0}</span> active days · <span className="font-semibold text-foreground">{Math.round((data?.totalMinutes ?? 0) / 60 * 10) / 10}h</span> in {weeks} weeks
          </span>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            Less
            <span className="size-2.5 rounded-sm bg-muted" />
            <span className="size-2.5 rounded-sm bg-brand-emerald/20" />
            <span className="size-2.5 rounded-sm bg-brand-emerald/40" />
            <span className="size-2.5 rounded-sm bg-brand-emerald/60" />
            <span className="size-2.5 rounded-sm bg-brand-emerald/80" />
            <span className="size-2.5 rounded-sm bg-brand-emerald" />
            More
          </div>
        </div>
      )}
      <div className="flex gap-1 overflow-x-auto scroll-thin pb-1">
        {/* day-of-week labels column */}
        <div className="flex flex-col gap-1 pr-1 shrink-0">
          <div className="h-2.5" />
          {DOW.map((d, i) => (
            <div key={d} className="h-2.5 text-[8px] text-muted-foreground" style={{ marginTop: i === 0 ? 0 : 8 }}>{d}</div>
          ))}
        </div>
        <div className="flex gap-1">
          {weekCols.map((week, wi) => (
            <div key={wi} className="flex flex-col gap-1 relative">
              {/* month label */}
              {monthLabels.find((m) => m.col === wi) && (
                <div className="absolute -top-3 left-0 text-[8px] text-muted-foreground whitespace-nowrap">
                  {monthLabels.find((m) => m.col === wi)!.label}
                </div>
              )}
              <div className="h-2.5" /> {/* spacer for month label */}
              {week.map((day) => {
                const date = new Date(day.date + "T00:00:00Z")
                const isToday = day.date === new Date().toISOString().slice(0, 10)
                return (
                  <div
                    key={day.date}
                    title={`${date.toLocaleDateString("en", { month: "short", day: "numeric" })}: ${day.minutes}m`}
                    className={cn(
                      "size-2.5 rounded-sm transition-transform hover:scale-150 hover:ring-1 hover:ring-ring",
                      intensity(day.minutes),
                      isToday && "ring-1 ring-ring"
                    )}
                  />
                )
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
