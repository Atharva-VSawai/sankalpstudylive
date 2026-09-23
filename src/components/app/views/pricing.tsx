"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api, ApiError } from "@/lib/api-client"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth-context"
import { useRouter } from "@/lib/router"
import { Check, Crown, Zap, X, Clock, Calendar, Infinity as InfinityIcon } from "lucide-react"
import { toast } from "sonner"

// 5-tier pricing matching the spec exactly
const PLANS = [
  {
    id: "free", name: "Free", price: 0, period: "forever",
    tagline: "Start studying for free.",
    features: [
      "60 minutes live-room access (lifetime)",
      "Join all communities",
      "Solo Pomodoro study (unlimited)",
      "Streaks & badges",
      "Friends & leaderboard",
    ],
    cta: "Current plan",
    highlight: false,
  },
  {
    id: "focus_pass", name: "Focus Pass", price: 14, period: "24 hours",
    tagline: "Unlimited rooms for a day.",
    features: [
      "Unlimited live study-room access",
      "Valid for 24 hours",
      "All Free features",
      "No recurring charge",
    ],
    cta: "Get Focus Pass",
    highlight: false,
  },
  {
    id: "monthly", name: "Monthly", price: 179, period: "per month",
    tagline: "Unlimited rooms, every month.",
    features: [
      "Unlimited live study-room access",
      "Recurring monthly subscription",
      "All Free features",
      "Cancel anytime",
    ],
    cta: "Subscribe Monthly",
    highlight: true,
  },
  {
    id: "halfyear", name: "6 Months", price: 699, period: "6 months",
    tagline: "Best value for serious prep.",
    features: [
      "Unlimited live study-room access",
      "6 months of unlimited access",
      "All Free features",
      "Save 35% vs monthly",
    ],
    cta: "Get 6 Months",
    highlight: false,
  },
  {
    id: "yearly", name: "Yearly", price: 999, period: "12 months",
    tagline: "For the long haul.",
    features: [
      "Unlimited live study-room access",
      "12 months of unlimited access",
      "All Free features",
      "Save 53% vs monthly",
    ],
    cta: "Get Yearly",
    highlight: false,
  },
]

export function PricingView() {
  const { me } = useAuth()
  const { navigate } = useRouter()
  const qc = useQueryClient()
  const { data: subData } = useQuery({
    queryKey: ["subscription"],
    queryFn: () => api.get<any>("/subscriptions"),
    enabled: !!me,
  })

  const purchase = useMutation({
    mutationFn: (plan: string) => api.post("/subscriptions", { plan }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["subscription"] })
      qc.invalidateQueries({ queryKey: ["me"] })
      toast.success("Payment successful! Plan activated.")
    },
    onError: (e: ApiError) => toast.error(e.message),
  })

  const currentPlan = subData?.subscription?.plan ?? "free"
  const hasPaidAccess = subData?.hasPaidAccess ?? false

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 pb-24 md:pb-12">
      <div className="text-center max-w-2xl mx-auto mb-10">
        <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground mb-3">
          <Zap className="size-3 text-brand-emerald" /> Pricing in INR
        </span>
        <h1 className="text-3xl md:text-4xl font-bold">Plans for every aspirant</h1>
        <p className="mt-3 text-muted-foreground">
          Start free with 60 minutes of live-room access. Upgrade for unlimited study rooms.
        </p>
        {hasPaidAccess && subData?.planExpiresAt && (
          <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 px-4 py-2 text-sm">
            <Crown className="size-4 text-brand-emerald" />
            <span className="font-medium">{subData?.planName}</span>
            <span className="text-muted-foreground">active until {new Date(subData.planExpiresAt).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" })}</span>
          </div>
        )}
        {!hasPaidAccess && me && subData?.remainingFreeMin != null && (
          <div className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/30 px-4 py-2 text-sm">
            <Clock className="size-4 text-amber-500" />
            <span className="font-medium">{subData.remainingFreeMin} min remaining</span>
            <span className="text-muted-foreground">of 60 free room minutes</span>
          </div>
        )}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {PLANS.map((plan) => {
          const isCurrent = currentPlan === plan.id
          const isPaid = plan.id !== "free"
          return (
            <Card
              key={plan.id}
              className={`relative flex flex-col ${plan.highlight ? "border-primary ring-2 ring-primary/20 shadow-lg" : ""}`}
            >
              {plan.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-semibold bg-brand-gradient text-white px-3 py-1 rounded-full whitespace-nowrap">
                  Most popular
                </span>
              )}
              <CardContent className="p-5 flex flex-col flex-1">
                <div className="flex items-center gap-2 mb-1">
                  {plan.id === "focus_pass" && <Zap className="size-4 text-brand-emerald" />}
                  {plan.id === "monthly" && <Calendar className="size-4 text-brand-emerald" />}
                  {plan.id === "halfyear" && <Calendar className="size-4 text-amber-500" />}
                  {plan.id === "yearly" && <Crown className="size-4 text-amber-500" />}
                  {plan.id === "free" && <Clock className="size-4 text-muted-foreground" />}
                  <h3 className="font-bold text-base">{plan.name}</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-3">{plan.tagline}</p>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-3xl font-bold">₹{plan.price}</span>
                  {plan.price > 0 && <span className="text-xs text-muted-foreground">/{plan.period}</span>}
                </div>
                <ul className="space-y-1.5 text-xs flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-1.5">
                      <Check className="size-3 text-brand-emerald mt-0.5 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4">
                  {isCurrent && isPaid ? (
                    <Button className="w-full" variant="secondary" disabled>
                      <Check className="size-4" /> Current Plan
                    </Button>
                  ) : isCurrent && !isPaid ? (
                    <Button className="w-full" variant="outline" disabled>
                      Current Plan
                    </Button>
                  ) : plan.id === "free" ? (
                    <Button className="w-full" variant="outline" disabled={!me} onClick={() => navigate("/dashboard")}>
                      {me ? "Go to dashboard" : "Sign up free"}
                    </Button>
                  ) : (
                    <Button
                      className="w-full"
                      variant={plan.highlight ? "default" : "outline"}
                      disabled={!me || purchase.isPending}
                      onClick={() => purchase.mutate(plan.id)}
                    >
                      {purchase.isPending && purchase.variables === plan.id ? "Processing…" : plan.cta}
                    </Button>
                  )}
                  {plan.id === "monthly" && (
                    <p className="text-[10px] text-muted-foreground text-center mt-1">Recurring autopay</p>
                  )}
                  {plan.id === "focus_pass" && (
                    <p className="text-[10px] text-muted-foreground text-center mt-1">One-time, no auto-renew</p>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="mt-8 text-center text-xs text-muted-foreground">
        <p>Paid plans provide <strong>unlimited live study-room access</strong> during their active period.</p>
        <p className="mt-1">Solo study, Pomodoro, communities, and browsing rooms are always free.</p>
      </div>
    </div>
  )
}
