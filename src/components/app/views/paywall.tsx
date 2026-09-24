"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useRouter } from "@/lib/router"
import { Check, Clock, Lock, Zap, Calendar, Crown, ArrowRight } from "lucide-react"

const PLANS = [
  { id: "focus_pass", name: "Focus Pass", price: 14, period: "24 hours", desc: "Unlimited room access for 24 hours. One-time payment.", icon: <Zap className="size-5 text-brand-emerald" /> },
  { id: "monthly", name: "Monthly", price: 179, period: "per month", desc: "Unlimited room access. Recurring monthly. Cancel anytime.", icon: <Calendar className="size-4 text-brand-emerald" />, highlight: true },
  { id: "halfyear", name: "6 Months", price: 699, period: "6 months", desc: "6 months of unlimited access. Save 35% vs monthly.", icon: <Calendar className="size-4 text-amber-500" /> },
  { id: "yearly", name: "Yearly", price: 999, period: "12 months", desc: "12 months of unlimited access. Save 53% vs monthly.", icon: <Crown className="size-4 text-amber-500" /> },
]

export function PaywallView() {
  const { navigate } = useRouter()

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12 hero-glow">
      <div className="w-full max-w-3xl fade-in">
        <div className="text-center mb-8">
          <div className="size-16 rounded-2xl bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center mx-auto mb-4">
            <Lock className="size-8 text-amber-500" />
          </div>
          <h1 className="text-2xl md:text-3xl font-bold">Your 30 free minutes are used up</h1>
          <p className="mt-2 text-muted-foreground max-w-md mx-auto">
            You've used all 30 minutes of your free live study-room access.
            Choose a plan below to continue studying with unlimited room access.
            Your free allowance resets 24 hours after it started.
          </p>
          <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5 text-sm">
            <Clock className="size-4 text-muted-foreground" />
            <span className="text-muted-foreground">Solo study & Pomodoro are still free — no room access needed.</span>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          {PLANS.map((plan) => (
            <Card key={plan.id} className={`relative ${plan.highlight ? "border-primary ring-2 ring-primary/20" : ""}`}>
              {plan.highlight && (
                <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-semibold bg-brand-gradient text-white px-2.5 py-0.5 rounded-full whitespace-nowrap">
                  Best value
                </span>
              )}
              <CardContent className="p-5">
                <div className="flex items-center gap-2 mb-1">
                  {plan.icon}
                  <h3 className="font-bold">{plan.name}</h3>
                </div>
                <p className="text-xs text-muted-foreground mb-3">{plan.desc}</p>
                <div className="flex items-baseline gap-1 mb-4">
                  <span className="text-2xl font-bold">₹{plan.price}</span>
                  <span className="text-xs text-muted-foreground">/{plan.period}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-brand-emerald mb-4">
                  <Check className="size-3" /> Unlimited live study-room access
                </div>
                <Button className="w-full" variant={plan.highlight ? "default" : "outline"} onClick={() => navigate("/pricing")}>
                  Get {plan.name} <ArrowRight className="size-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="mt-6 text-center">
          <Button variant="ghost" size="sm" onClick={() => navigate("/study")}>
            Continue with Solo Study (free) →
          </Button>
        </div>
      </div>
    </div>
  )
}
