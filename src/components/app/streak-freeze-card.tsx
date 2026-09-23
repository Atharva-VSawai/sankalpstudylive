"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api, ApiError } from "@/lib/api-client"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Snowflake, Zap, Info } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/lib/auth-context"

// A streak freeze protects your streak on a day you can't study.
// Free users get 2; Plus users get more (planned).
export function StreakFreezeCard() {
  const { me } = useAuth()
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ["streak", "freeze"],
    queryFn: () => api.get<{ freezesAvailable: number; freezesUsed: number; lastFreezeDate: string | null }>("/study/streak/freeze"),
  })

  const activate = useMutation({
    mutationFn: () => api.post("/study/streak/freeze"),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["streak"] })
      qc.invalidateQueries({ queryKey: ["me"] })
      qc.invalidateQueries({ queryKey: ["goals"] })
      toast.success("Streak freeze activated! 🔒 Your streak is protected for today.")
    },
    onError: (e: ApiError) => toast.error(e.message),
  })

  const available = data?.freezesAvailable ?? me?.streak?.freezesAvailable ?? 0
  const used = data?.freezesUsed ?? me?.streak?.freezesUsed ?? 0
  const lastFreeze = data?.lastFreezeDate
  const frozenToday = lastFreeze ? new Date(lastFreeze).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10) : false

  return (
    <Card className="overflow-hidden border-sky-200/50 dark:border-sky-900/40">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <span className="size-10 rounded-xl bg-sky-50 dark:bg-sky-950/40 flex items-center justify-center shrink-0">
            <Snowflake className="size-5 text-sky-500" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm">Streak freeze</h3>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300 font-medium">
                {available} left
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {frozenToday
                ? "Active today — your streak is protected."
                : available > 0
                  ? "Can't study today? Use a freeze to keep your streak alive."
                  : "You're out of freezes. Earn more with Sankalp Plus."}
            </p>
            <div className="mt-3 flex items-center gap-2">
              <Button
                size="sm"
                variant={available > 0 && !frozenToday ? "outline" : "ghost"}
                disabled={available === 0 || frozenToday || activate.isPending}
                onClick={() => activate.mutate()}
              >
                <Snowflake className="size-3.5" />
                {frozenToday ? "Frozen today" : available > 0 ? "Freeze today" : "No freezes left"}
              </Button>
              <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
                <Info className="size-3" /> {used} used all-time
              </span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
