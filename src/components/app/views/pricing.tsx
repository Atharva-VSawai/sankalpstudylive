"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api, ApiError } from "@/lib/api-client"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth-context"
import { useRouter } from "@/lib/router"
import { Check, Crown, Zap, X, Clock, Calendar, Infinity as InfinityIcon, Loader2, Lock } from "lucide-react"
import { toast } from "sonner"
import { useState } from "react"

// Razorpay Checkout script
const RAZORPAY_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js"

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).Razorpay) return resolve()
    const script = document.createElement("script")
    script.src = RAZORPAY_SCRIPT
    script.onload = () => resolve()
    script.onerror = () => reject(new Error("Failed to load Razorpay Checkout"))
    document.body.appendChild(script)
  })
}

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
    planCode: null,
  },
  {
    id: "focus_pass", name: "Focus Pass", price: 14, period: "24 hours",
    tagline: "Unlimited rooms for a day.",
    features: [
      "Unlimited live study-room access",
      "Valid for 24 hours",
      "All Free features",
      "One-time payment — no recurring charge",
    ],
    cta: "Get Focus Pass",
    highlight: false,
    planCode: "FOCUS_PASS",
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
    planCode: "MONTHLY",
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
    planCode: "SIX_MONTH",
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
    planCode: "YEARLY",
  },
]

export function PricingView() {
  const { me } = useAuth()
  const { navigate } = useRouter()
  const qc = useQueryClient()
  const [purchasing, setPurchasing] = useState<string | null>(null)

  const { data: subData } = useQuery({
    queryKey: ["subscription"],
    queryFn: () => api.get<any>("/subscriptions"),
    enabled: !!me,
  })
  const { data: paymentHistory } = useQuery({
    queryKey: ["payments", "history"],
    queryFn: () => api.get<{ payments: any[] }>("/payments/history"),
    enabled: !!me,
  })

  const currentPlan = subData?.subscription?.plan ?? "free"
  const hasPaidAccess = subData?.hasPaidAccess ?? false

  // ── One-time payment flow (Focus Pass, 6-Month, Yearly) ──
  const purchaseOneTime = async (planCode: string) => {
    setPurchasing(planCode)
    try {
      // 1. Create Razorpay order server-side
      const orderRes = await api.post<{ keyId: string; orderId: string; amount: number; currency: string }>(
        "/payments/razorpay/order",
        { planCode }
      )

      // 2. Load Razorpay Checkout script
      await loadRazorpayScript()

      // 3. Open Razorpay Checkout
      const rzp = new (window as any).Razorpay({
        key: orderRes.keyId,
        amount: orderRes.amount,
        currency: orderRes.currency,
        order_id: orderRes.orderId,
        name: "Sankalp",
        description: `${planCode} — Unlimited study rooms`,
        prefill: {
          name: me?.profile?.displayName,
          email: me?.email,
        },
        theme: { color: "#10b981" },
        handler: async (response: any) => {
          // 4. Send Razorpay response to backend for verification
          try {
            const verifyRes = await api.post<{ verified: boolean; plan: string; entitlementEnd: string }>(
              "/payments/razorpay/verify",
              {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }
            )

            if (verifyRes.verified) {
              toast.success(`Payment successful! ${verifyRes.plan} plan activated.`)
              qc.invalidateQueries({ queryKey: ["subscription"] })
              qc.invalidateQueries({ queryKey: ["me"] })
              qc.invalidateQueries({ queryKey: ["payments"] })
            } else {
              toast.error("Payment verification failed. Please contact support.")
            }
          } catch (e: any) {
            toast.error(e.message || "Payment verification failed.")
          } finally {
            setPurchasing(null)
          }
        },
        modal: {
          ondismiss: () => {
            setPurchasing(null)
            toast.info("Payment cancelled.")
          },
        },
      })

      rzp.on("payment.failed", (response: any) => {
        toast.error(`Payment failed: ${response.error?.description || "Unknown error"}`)
        setPurchasing(null)
      })

      rzp.open()
    } catch (e: any) {
      toast.error(e.message || "Failed to initiate payment.")
      setPurchasing(null)
    }
  }

  // ── Monthly subscription flow ──
  const purchaseSubscription = async () => {
    setPurchasing("MONTHLY")
    try {
      // 1. Create Razorpay subscription server-side
      const subRes = await api.post<{ keyId: string; subscriptionId: string }>(
        "/payments/razorpay/subscription",
        {}
      )

      // 2. Load Razorpay Checkout
      await loadRazorpayScript()

      // 3. Open Razorpay Checkout for subscription
      const rzp = new (window as any).Razorpay({
        key: subRes.keyId,
        subscription_id: subRes.subscriptionId,
        name: "Sankalp Monthly",
        description: "₹179/month — Unlimited study rooms",
        prefill: {
          name: me?.profile?.displayName,
          email: me?.email,
        },
        theme: { color: "#10b981" },
        handler: async () => {
          // Subscription checkout — the webhook will activate the subscription
          toast.success("Subscription initiated! Your plan will activate once payment is confirmed.")
          qc.invalidateQueries({ queryKey: ["subscription"] })
          setPurchasing(null)
        },
        modal: {
          ondismiss: () => {
            setPurchasing(null)
            toast.info("Subscription cancelled.")
          },
        },
      })

      rzp.on("payment.failed", (response: any) => {
        toast.error(`Payment failed: ${response.error?.description || "Unknown error"}`)
        setPurchasing(null)
      })

      rzp.open()
    } catch (e: any) {
      toast.error(e.message || "Failed to create subscription.")
      setPurchasing(null)
    }
  }

  const handlePurchase = (planCode: string | null) => {
    if (!planCode) return
    if (planCode === "MONTHLY") {
      purchaseSubscription()
    } else {
      purchaseOneTime(planCode)
    }
  }

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
          return (
            <Card key={plan.id} className={`relative flex flex-col ${plan.highlight ? "border-primary ring-2 ring-primary/20 shadow-lg" : ""}`}>
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
                  {isCurrent && plan.id !== "free" ? (
                    <Button className="w-full" variant="secondary" disabled>
                      <Check className="size-4" /> Current Plan
                    </Button>
                  ) : isCurrent && plan.id === "free" ? (
                    <Button className="w-full" variant="outline" disabled={!me} onClick={() => navigate("/dashboard")}>
                      {me ? "Go to dashboard" : "Sign up free"}
                    </Button>
                  ) : hasPaidAccess && plan.planCode ? (
                    // User has an active paid plan — block purchasing other plans
                    <div className="space-y-1">
                      <Button className="w-full" variant="outline" disabled>
                        <Lock className="size-4" /> Active Plan
                      </Button>
                      <p className="text-[10px] text-muted-foreground text-center">
                        Your {subData?.planName ?? "plan"} is active until {subData?.planExpiresAt ? new Date(subData.planExpiresAt).toLocaleDateString("en-IN", { month: "short", day: "numeric" }) : "—"}.
                        You can purchase after that.
                      </p>
                    </div>
                  ) : (
                    <Button
                      className="w-full"
                      variant={plan.highlight ? "default" : "outline"}
                      disabled={!me || purchasing !== null}
                      onClick={() => handlePurchase(plan.planCode)}
                    >
                      {purchasing !== null && purchasing === plan.planCode ? (
                        <><Loader2 className="size-4 animate-spin" /> Processing…</>
                      ) : plan.cta}
                    </Button>
                  )}
                  {plan.id === "monthly" && (
                    <p className="text-[10px] text-muted-foreground text-center mt-1">Recurring autopay via Razorpay</p>
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

      {/* Payment History */}
      {me && paymentHistory?.payments?.length > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-semibold mb-3">Payment History</h2>
          <div className="space-y-2">
            {paymentHistory.payments.map((p: any) => (
              <Card key={p.id}>
                <CardContent className="p-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium capitalize">{p.plan.replace("_", " ")}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(p.createdAt).toLocaleDateString("en-IN", { year: "numeric", month: "short", day: "numeric" })}
                      {p.entitlementEnd && ` · Access until ${new Date(p.entitlementEnd).toLocaleDateString("en-IN")}`}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold">₹{(p.amount / 100).toFixed(0)}</div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${p.status === "captured" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>
                      {p.status}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      <div className="mt-8 text-center text-xs text-muted-foreground">
        <p>Paid plans provide <strong>unlimited live study-room access</strong> during their active period.</p>
        <p className="mt-1">Solo study, Pomodoro, communities, and browsing rooms are always free.</p>
        <p className="mt-2">Payments processed securely by Razorpay. Sandbox test mode.</p>
      </div>
    </div>
  )
}
