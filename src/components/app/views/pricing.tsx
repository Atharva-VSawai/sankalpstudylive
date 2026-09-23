"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api, ApiError } from "@/lib/api-client"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth-context"
import { useRouter } from "@/lib/router"
import { Check, Crown, Sparkles, Zap, X } from "lucide-react"
import { toast } from "sonner"

const PLANS = [
  {
    id: "free", name: "Free", price: 0, period: "forever", tagline: "Everything you need to start.",
    features: ["Join all communities", "Join unlimited live rooms", "Solo Pomodoro study", "Streaks & badges", "Friends & leaderboard", "Up to 20 participants per hosted room"],
    cta: "Current plan", highlight: false,
  },
  {
    id: "plus", name: "Plus", price: 299, period: "month", tagline: "For serious aspirants.",
    features: ["Everything in Free", "Host rooms up to 50 people", "Deep study analytics", "Custom daily goals", "Priority support", "Exclusive Plus badge"],
    cta: "Upgrade to Plus", highlight: true,
  },
  {
    id: "pro", name: "Pro", price: 799, period: "month", tagline: "Coaching-grade tools.",
    features: ["Everything in Plus", "Unlimited hosted rooms", "Advanced leaderboards & exports", "Early access to features", "Dedicated support", "Pro badge & profile flair"],
    cta: "Go Pro", highlight: false,
  },
]

export function PricingView() {
  const { me } = useAuth()
  const { navigate } = useRouter()
  const qc = useQueryClient()
  const { data: sub } = useQuery({ queryKey: ["subscription"], queryFn: () => api.get<{ subscription: any }>("/subscriptions"), enabled: !!me })

  const upgrade = useMutation({
    mutationFn: (plan: string) => api.post("/subscriptions", { plan }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["subscription"] }); toast.success("Plan upgraded! (demo)") },
    onError: (e: ApiError) => toast.error(e.message),
  })

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 pb-24 md:pb-12">
      <div className="text-center max-w-2xl mx-auto mb-10">
        <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground mb-3">
          <Sparkles className="size-3 text-brand-emerald" /> Pricing in INR
        </span>
        <h1 className="text-3xl md:text-4xl font-bold">Plans for every aspirant</h1>
        <p className="mt-3 text-muted-foreground">Start free. Upgrade when you're ready to go deep. Cancel anytime.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {PLANS.map((plan) => {
          const current = sub?.subscription?.plan === plan.id
          return (
            <Card key={plan.id} className={`relative ${plan.highlight ? "border-primary ring-2 ring-primary/20 shadow-lg" : ""}`}>
              {plan.highlight && <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-semibold bg-brand-gradient text-white px-3 py-1 rounded-full">Most popular</span>}
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-1">
                  {plan.id === "plus" ? <Zap className="size-5 text-brand-emerald" /> : plan.id === "pro" ? <Crown className="size-5 text-amber-500" /> : <Sparkles className="size-5 text-muted-foreground" />}
                  <h3 className="text-lg font-bold">{plan.name}</h3>
                </div>
                <p className="text-sm text-muted-foreground">{plan.tagline}</p>
                <div className="mt-4 flex items-baseline gap-1">
                  <span className="text-3xl font-bold">₹{plan.price}</span>
                  <span className="text-sm text-muted-foreground">/{plan.period}</span>
                </div>
                <ul className="mt-5 space-y-2 text-sm">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="size-4 text-brand-emerald mt-0.5 shrink-0" />
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className="mt-6 w-full"
                  variant={plan.highlight ? "default" : "outline"}
                  disabled={!me || current}
                  onClick={() => plan.id === "free" ? navigate("/dashboard") : upgrade.mutate(plan.id)}
                >
                  {current ? "Current plan" : !me ? "Sign up first" : plan.cta}
                </Button>
                {plan.id !== "free" && !current && me && (
                  <p className="text-xs text-muted-foreground text-center mt-2">Sandbox: simulates a successful payment.</p>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      <div className="mt-10 text-center text-sm text-muted-foreground">
        <p>All plans include mic-off-by-default rooms, server-tracked study time, and access to every exam community.</p>
      </div>
    </div>
  )
}
