"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Trophy, TrendingUp, TrendingDown, Calendar, Flame, Minus } from "lucide-react"
import { formatMinutes, EXAM_META } from "@/components/app/brand"
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Cell } from "recharts"
import { cn } from "@/lib/utils"

export function WeeklyStatsCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["study", "weekly"],
    queryFn: () => api.get<any>("/study/weekly"),
  })

  if (isLoading) return <div className="h-48 rounded-xl bg-muted/40 animate-pulse" />
  if (!data) return null

  const up = (data.changePct ?? 0) >= 0
  const hasData = (data.thisTotal ?? 0) > 0 || (data.lastTotal ?? 0) > 0

  const chartData = (data.thisWeek ?? []).map((d: any) => ({
    day: d.day,
    minutes: d.minutes,
    isBest: data.bestDay?.date === d.date,
    isToday: d.date === new Date().toISOString().slice(0, 10),
  }))

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2"><Calendar className="size-4 text-brand-emerald" /> This week</span>
          {hasData && (
            <span className={cn("inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full", up ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300")}>
              {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
              {up ? "+" : ""}{data.changePct}% vs last
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Best day highlight */}
        {data.bestDay ? (
          <div className="rounded-lg bg-gradient-to-r from-amber-50 to-emerald-50 dark:from-amber-950/30 dark:to-emerald-950/30 border p-3 flex items-center gap-3">
            <span className="size-9 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center shrink-0">
              <Trophy className="size-4 text-amber-600" />
            </span>
            <div className="min-w-0">
              <div className="text-xs text-muted-foreground">Best day</div>
              <div className="font-semibold text-sm">{data.bestDay.day} · {formatMinutes(data.bestDay.minutes)}</div>
            </div>
            <div className="ml-auto text-right">
              <div className="text-xs text-muted-foreground">{data.bestDay.sessions} session{data.bestDay.sessions !== 1 ? "s" : ""}</div>
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed p-3 text-center text-xs text-muted-foreground">
            No sessions yet this week. Start studying to set your best day! 🔥
          </div>
        )}

        {/* Bar chart */}
        <div className="h-28">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barCategoryGap="20%">
              <XAxis dataKey="day" tickLine={false} axisLine={false} fontSize={10} />
              <YAxis hide />
              <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", fontSize: 12 }} formatter={(v: any) => [`${v} min`, "Studied"]} />
              <Bar dataKey="minutes" radius={[4, 4, 0, 0]} maxBarSize={28}>
                {chartData.map((d, i) => (
                  <Cell
                    key={i}
                    fill={d.minutes === 0 ? "hsl(var(--muted-foreground) / 0.25)" : d.isBest ? "var(--brand-saffron)" : "var(--brand-emerald)"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Today + total */}
        <div className="grid grid-cols-2 gap-2 pt-1 border-t">
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Today</div>
            <div className="text-lg font-bold">{formatMinutes(data.today?.minutes ?? 0)}</div>
            <div className="text-[10px] text-muted-foreground">{data.today?.sessions ?? 0} session{(data.today?.sessions ?? 0) !== 1 ? "s" : ""}</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide">Week total</div>
            <div className="text-lg font-bold">{formatMinutes(data.thisTotal ?? 0)}</div>
            <div className="text-[10px] text-muted-foreground">
              {data.goalCompletedToday ? "Goal hit today ✓" : "Keep going"}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
