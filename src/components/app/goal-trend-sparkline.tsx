"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp } from "lucide-react"
import { formatMinutes } from "@/components/app/brand"

// A compact sparkline showing the last 14 days of study minutes vs the daily goal line.
// Uses /api/study/goals (last 14 days) data.
export function GoalTrendSparkline() {
  const { data } = useQuery({
    queryKey: ["goals"],
    queryFn: () => api.get<{ goals: any[] }>("/study/goals"),
  })

  const goals = (data?.goals ?? []).slice(-14)
  if (goals.length === 0) return null

  const max = Math.max(...goals.map((g: any) => Math.max(g.achievedMin, g.targetMin)), 60)
  const w = 100
  const h = 36
  const stepX = w / Math.max(1, goals.length - 1)

  // Build the achieved line path
  const achievedPoints = goals.map((g: any, i: number) => ({
    x: i * stepX,
    y: h - (g.achievedMin / max) * h,
  }))
  const linePath = achievedPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ")
  // Area under the line
  const areaPath = `${linePath} L ${w} ${h} L 0 ${h} Z`

  // Goal line (target)
  const goalY = h - (goals[0].targetMin / max) * h

  const hitCount = goals.filter((g: any) => g.completed).length
  const avg = goals.reduce((a: number, b: any) => a + b.achievedMin, 0) / goals.length

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2"><TrendingUp className="size-4 text-brand-emerald" /> Goal trend</span>
          <span className="text-xs font-normal text-muted-foreground">{hitCount}/{goals.length} hit</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-12" preserveAspectRatio="none">
              {/* goal line (dashed) */}
              <line x1="0" y1={goalY} x2={w} y2={goalY} stroke="var(--brand-saffron)" strokeWidth="1" strokeDasharray="3 2" opacity="0.6" />
              {/* area under achieved */}
              <path d={areaPath} fill="var(--brand-emerald)" opacity="0.15" />
              {/* achieved line */}
              <path d={linePath} fill="none" stroke="var(--brand-emerald)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
              {/* dots */}
              {achievedPoints.map((p, i) => (
                <circle
                  key={i}
                  cx={p.x}
                  cy={p.y}
                  r={goals[i].completed ? 1.8 : 1}
                  fill={goals[i].completed ? "var(--brand-saffron)" : "var(--brand-emerald)"}
                />
              ))}
            </svg>
            <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
              <span>{new Date(goals[0].date).toLocaleDateString("en", { day: "numeric", month: "short" })}</span>
              <span>avg {formatMinutes(avg)}/day</span>
              <span>today</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-brand-emerald" /> Studied</span>
          <span className="inline-flex items-center gap-1"><span className="size-2 rounded-full bg-brand-saffron" /> Goal hit</span>
          <span className="inline-flex items-center gap-1"><span className="w-3 h-px bg-brand-saffron opacity-60" style={{ backgroundImage: "repeating-linear-gradient(to right, currentColor 0, currentColor 2px, transparent 2px, transparent 4px)" }} /> Target</span>
        </div>
      </CardContent>
    </Card>
  )
}
