"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import { Flame } from "lucide-react"

// A month-grid calendar showing studied days (green), goal-hit days (emerald solid),
// missed days (muted), today (ring). Reuses /api/study/heatmap data but renders as
// a traditional calendar instead of a contribution graph.

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const DOW = ["S", "M", "T", "W", "T", "F", "S"]

export function StreakCalendar({ months = 3 }: { months?: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ["heatmap", "calendar", months],
    queryFn: () => api.get<{ days: { date: string; minutes: number }[] }>("/study/heatmap", { weeks: months * 4 + 2 }),
  })

  if (isLoading) return <div className="h-64 rounded-lg bg-muted/40 animate-pulse" />

  const dayMap = new Map<string, number>()
  for (const d of data?.days ?? []) dayMap.set(d.date, d.minutes)

  const today = new Date()
  const todayKey = today.toISOString().slice(0, 10)

  // Build the last N months, oldest first
  const monthList: { year: number; month: number }[] = []
  let y = today.getFullYear()
  let m = today.getMonth() // 0-indexed
  for (let i = 0; i < months; i++) {
    monthList.unshift({ year: y, month: m })
    m -= 1
    if (m < 0) { m = 11; y -= 1 }
  }

  return (
    <div className="space-y-5">
      {monthList.map(({ year, month }) => {
        const firstDay = new Date(Date.UTC(year, month, 1))
        const lastDay = new Date(Date.UTC(year, month + 1, 0))
        const startDow = firstDay.getUTCDay()
        const daysInMonth = lastDay.getUTCDate()
        const cells: ({ day: number; date: string } | null)[] = []
        for (let i = 0; i < startDow; i++) cells.push(null)
        for (let d = 1; d <= daysInMonth; d++) {
          const date = new Date(Date.UTC(year, month, d)).toISOString().slice(0, 10)
          cells.push({ day: d, date })
        }
        // pad to 7-grid
        while (cells.length % 7 !== 0) cells.push(null)

        return (
          <div key={`${year}-${month}`}>
            <div className="text-sm font-semibold mb-2">{MONTHS[month]} {year}</div>
            <div className="grid grid-cols-7 gap-1">
              {DOW.map((d, i) => (
                <div key={i} className="text-[10px] text-muted-foreground text-center pb-1">{d}</div>
              ))}
              {cells.map((c, i) => {
                if (!c) return <div key={i} className="aspect-square" />
                const minutes = dayMap.get(c.date) ?? 0
                const isToday = c.date === todayKey
                return (
                  <div
                    key={i}
                    title={`${c.date}: ${minutes > 0 ? `${minutes}m studied` : "no study"}`}
                    className={cn(
                      "aspect-square rounded-md flex flex-col items-center justify-center text-[10px] font-medium transition-all cursor-default",
                      minutes === 0 && "bg-muted/50 text-muted-foreground",
                      minutes > 0 && minutes < 60 && "bg-brand-emerald/30 text-emerald-900 dark:text-emerald-100",
                      minutes >= 60 && minutes < 180 && "bg-brand-emerald/50 text-white",
                      minutes >= 180 && "bg-brand-emerald text-white",
                      isToday && "ring-2 ring-brand-saffron"
                    )}
                  >
                    <span>{c.day}</span>
                    {minutes >= 180 && <Flame className="size-2.5 mt-0.5" />}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
