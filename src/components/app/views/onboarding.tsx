"use client"

import { useState } from "react"
import { Me, useAuth } from "@/lib/auth-context"
import { useRouter } from "@/lib/router"
import { api } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { EXAM_META, Logo } from "@/components/app/brand"
import { ApiError } from "@/lib/api-client"
import { toast } from "sonner"
import { ArrowLeft, ArrowRight, Check, Loader2, Sparkles } from "lucide-react"
import { Progress } from "@/components/ui/progress"

const EXAMS = Object.keys(EXAM_META)

export function OnboardingView() {
  const { me, refresh } = useAuth()
  const { navigate } = useRouter()
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)

  const [displayName, setDisplayName] = useState(me?.profile?.displayName ?? "")
  const [username, setUsername] = useState(me?.profile?.username ?? "")
  const [examGoal, setExamGoal] = useState(me?.profile?.examGoal ?? "")
  const [targetYear, setTargetYear] = useState<number | "">(me?.profile?.targetYear ?? "")
  const [hoursPerDay, setHoursPerDay] = useState(6)

  const steps = ["Profile", "Exam goal", "Daily target", "Ready"]

  const canNext = () => {
    if (step === 0) return displayName.trim().length >= 2 && username.trim().length >= 3
    if (step === 1) return Boolean(examGoal)
    if (step === 2) return hoursPerDay >= 0.25 && hoursPerDay <= 24
    return true
  }

  const finish = async () => {
    setBusy(true)
    try {
      const updatedMe = await api.patch<Me>("/onboarding", {
        displayName,
        username,
        examGoal,
        targetYear: targetYear === "" ? null : Number(targetYear),
        studyHoursGoal: Math.round(hoursPerDay * 60),
      })
      // The endpoint returns the authoritative completed profile. Apply it
      // immediately instead of making a second /auth/me request; this avoids
      // the stale onboarding state that previously made users open a room
      // before the welcome/dashboard transition completed.
      await refresh(updatedMe)
      toast.success("You're all set! Welcome to Sankalp.")
      navigate("/dashboard", { replace: true })
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Onboarding failed")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] hero-glow">
      <div className="mx-auto max-w-2xl px-4 py-12">
        <div className="text-center mb-8">
          <Logo className="justify-center mb-4" />
          <h1 className="text-3xl font-bold">Let's set up your study goal</h1>
          <p className="text-muted-foreground mt-2">Takes less than a minute. You can change everything later.</p>
        </div>

        <Progress value={(step + 1) / steps.length * 100} className="mb-6 h-2" />

        <div className="flex items-center justify-between mb-6 text-sm">
          {steps.map((s, i) => (
            <div key={s} className={`flex items-center gap-1.5 ${i <= step ? "text-foreground" : "text-muted-foreground"}`}>
              <span className={`size-6 rounded-full flex items-center justify-center text-xs font-semibold ${i < step ? "bg-brand-emerald text-white" : i === step ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                {i < step ? <Check className="size-3" /> : i + 1}
              </span>
              <span className="hidden sm:inline">{s}</span>
            </div>
          ))}
        </div>

        <Card className="fade-in" key={step}>
          <CardContent className="p-6">
            {step === 0 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl font-semibold">What should we call you?</h2>
                  <p className="text-sm text-muted-foreground">Your display name appears in rooms and leaderboards.</p>
                </div>
                <div className="space-y-1.5">
                  <Label>Display name</Label>
                  <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="e.g. Aarav Sharma" autoFocus />
                </div>
                <div className="space-y-1.5">
                  <Label>Username</Label>
                  <div className="flex items-center relative">
                    <span className="absolute left-3 text-muted-foreground">@</span>
                    <Input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} placeholder="aarav" className="pl-7" />
                  </div>
                  <p className="text-xs text-muted-foreground">Letters, numbers and underscores only.</p>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl font-semibold">What are you preparing for?</h2>
                  <p className="text-sm text-muted-foreground">Pick a goal. We'll suggest a community and rooms.</p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {EXAMS.map((exam) => {
                    const meta = EXAM_META[exam]
                    const active = examGoal === exam
                    return (
                      <button
                        key={exam}
                        onClick={() => setExamGoal(exam)}
                        className={`text-left rounded-xl border p-3 transition-all ${active ? "border-primary ring-2 ring-primary/30 bg-primary/5" : "hover:border-primary/40"}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-semibold text-sm">{exam}</span>
                          <span className="size-2.5 rounded-full" style={{ background: meta.color }} />
                        </div>
                        <p className="text-xs text-muted-foreground">{meta.tagline}</p>
                      </button>
                    )
                  })}
                </div>
                <div className="space-y-1.5">
                  <Label>Target year (optional)</Label>
                  <Input type="number" value={targetYear} onChange={(e) => setTargetYear(e.target.value === "" ? "" : Number(e.target.value))} placeholder="2026" min={2024} max={2035} />
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-xl font-semibold">How much will you study daily?</h2>
                  <p className="text-sm text-muted-foreground">A realistic daily goal builds real streaks. Start small.</p>
                </div>
                <Card className="border-dashed"><CardContent className="p-5 text-center">
                  <div className="text-5xl font-bold text-brand-gradient">{hoursPerDay}h</div>
                  <p className="text-sm text-muted-foreground mt-1">per day</p>
                </CardContent></Card>
                <input type="range" min={0.25} max={12} step={0.25} value={hoursPerDay} onChange={(e) => setHoursPerDay(Number(e.target.value))} className="w-full accent-[var(--brand-emerald)]" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>15 min</span><span>3h</span><span>6h</span><span>12h</span>
                </div>
                <p className="text-xs text-muted-foreground">That's about {Math.round(hoursPerDay * 60)} minutes of focused study a day.</p>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-4 text-center py-4">
                <div className="size-16 rounded-2xl bg-brand-gradient text-white flex items-center justify-center mx-auto"><Sparkles className="size-8" /></div>
                <h2 className="text-xl font-semibold">You're ready!</h2>
                <div className="rounded-xl border p-4 text-left space-y-1.5 text-sm">
                  <Row label="Name" value={displayName} />
                  <Row label="Username" value={`@${username}`} />
                  <Row label="Goal" value={examGoal} />
                  {targetYear && <Row label="Target year" value={String(targetYear)} />}
                  <Row label="Daily target" value={`${hoursPerDay}h`} />
                </div>
                <p className="text-sm text-muted-foreground">We'll auto-join you to the {examGoal} community.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-between mt-6">
          <Button variant="ghost" onClick={() => (step === 0 ? navigate("/") : setStep(step - 1))} disabled={busy}>
            <ArrowLeft className="size-4" /> {step === 0 ? "Cancel" : "Back"}
          </Button>
          {step < steps.length - 1 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canNext()}>
              Continue <ArrowRight className="size-4" />
            </Button>
          ) : (
            <Button onClick={finish} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : "Start studying"} <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
