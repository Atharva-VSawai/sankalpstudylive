"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import { cn } from "@/lib/utils"
import { ChevronLeft, ChevronRight, Flame } from "lucide-react"
import { useState } from "react"

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const DOW = ["S", "M", "T", "W", "T", "F", "S"]

function currentMonth() {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() }
}

export function StreakCalendar() {
  const [selected, setSelected] = useState(() => currentMonth())
  const current = currentMonth()
  const isCurrentMonth = selected.year === current.year && selected.month === current.month

  const { data, isLoading } = useQuery({
    queryKey: ["heatmap", "calendar", selected.year, selected.month],
    queryFn: () => api.get<{ days: { date: string; minutes: number }[] }>("/study/heatmap", {
      year: selected.year,
      month: selected.month + 1,
    }),
    refetchOnWindowFocus: true,
  })

  const dayMap = new Map<string, number>()
  for (const day of data?.days ?? []) dayMap.set(day.date, day.minutes)
  const todayKey = new Date().toLocaleDateString("en-CA")
  const firstDay = new Date(Date.UTC(selected.year, selected.month, 1))
  const daysInMonth = new Date(Date.UTC(selected.year, selected.month + 1, 0)).getUTCDate()
  const cells: ({ day: number; date: string } | null)[] = []
  for (let i = 0; i < firstDay.getUTCDay(); i++) cells.push(null)
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ day, date: new Date(Date.UTC(selected.year, selected.month, day)).toISOString().slice(0, 10) })
  }
  while (cells.length % 7 !== 0) cells.push(null)

  const moveMonth = (delta: number) => {
    const next = new Date(Date.UTC(selected.year, selected.month + delta, 1))
    setSelected({ year: next.getUTCFullYear(), month: next.getUTCMonth() })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => moveMonth(-1)} className="inline-flex size-8 items-center justify-center rounded-md hover:bg-accent" aria-label="Previous month">
          <ChevronLeft className="size-4" />
        </button>
        <div className="text-sm font-semibold">{MONTHS[selected.month]} {selected.year}</div>
        <button type="button" onClick={() => moveMonth(1)} disabled={isCurrentMonth} className="inline-flex size-8 items-center justify-center rounded-md hover:bg-accent disabled:cursor-not-allowed disabled:opacity-30" aria-label="Next month">
          <ChevronRight className="size-4" />
        </button>
      </div>

      {isLoading ? (
        <div className="h-56 rounded-lg bg-muted/40 animate-pulse" />
      ) : (
        <div className="grid grid-cols-7 gap-1">
          {DOW.map((day, index) => <div key={index} className="pb-1 text-center text-[10px] text-muted-foreground">{day}</div>)}
          {cells.map((cell, index) => {
            if (!cell) return <div key={index} className="aspect-square" />
            const minutes = dayMap.get(cell.date) ?? 0
            const isToday = cell.date === todayKey
            return (
              <div
                key={cell.date}
                title={`${cell.date}: ${minutes > 0 ? `${minutes}m studied` : "no study"}`}
                className={cn(
                  "aspect-square rounded-md flex flex-col items-center justify-center text-[10px] font-medium transition-all",
                  minutes === 0 && "bg-muted/50 text-muted-foreground",
                  minutes > 0 && minutes < 60 && "bg-brand-emerald/30 text-emerald-900 dark:text-emerald-100",
                  minutes >= 60 && minutes < 180 && "bg-brand-emerald/50 text-white",
                  minutes >= 180 && "bg-brand-emerald text-white",
                  isToday && "ring-2 ring-brand-saffron"
                )}
              >
                <span>{cell.day}</span>
                {minutes >= 180 && <Flame className="mt-0.5 size-2.5" />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
