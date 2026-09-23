"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import { Card, CardContent } from "@/components/ui/card"
import { Clock, Crown, Infinity as InfinityIcon } from "lucide-react"
import { Link } from "@/lib/router"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// Shows the user's current room-access status on the dashboard:
// - Paid: shows plan name + expiry
// - Free with remaining: shows "X min remaining" + upgrade CTA
// - Free exhausted: shows paywall CTA
export function RoomAccessWidget() {
  const { data } = useQuery({
    queryKey: ["room-usage"],
    queryFn: () => api.get<any>("/rooms/usage"),
  })

  if (!data) return null

  const paid = data.hasPaidAccess
  const remaining = data.remainingFreeMin
  const exhausted = !paid && remaining === 0

  return (
    <Card className={cn(
      "overflow-hidden",
      paid ? "border-brand-emerald/30" : exhausted ? "border-destructive/30" : ""
    )}>
      <CardContent className="p-4">
        {paid ? (
          <div className="flex items-center gap-3">
            <span className="size-10 rounded-xl bg-brand-emerald/10 flex items-center justify-center shrink-0">
              <Crown className="size-5 text-brand-emerald" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">{data.planName}</div>
              <div className="text-xs text-muted-foreground">
                {data.planExpiresAt
                  ? `Unlimited rooms until ${new Date(data.planExpiresAt).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}`
                  : "Unlimited room access"}
              </div>
            </div>
            <InfinityIcon className="size-5 text-brand-emerald shrink-0" />
          </div>
        ) : exhausted ? (
          <div className="flex items-center gap-3">
            <span className="size-10 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
              <Clock className="size-5 text-destructive" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">Free minutes used up</div>
              <div className="text-xs text-muted-foreground">Upgrade for unlimited room access</div>
            </div>
            <Button size="sm" onClick={() => window.location.hash = "#/paywall"}>
              Upgrade
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="size-10 rounded-xl bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center shrink-0">
              <Clock className="size-5 text-amber-500" />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">{remaining} min remaining</div>
              <div className="text-xs text-muted-foreground">of 30 free live-room minutes today</div>
            </div>
            <Link to="/pricing">
              <Button size="sm" variant="outline">
                Upgrade
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
