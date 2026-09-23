"use client"

import { useState } from "react"
import { useAuth } from "@/lib/auth-context"
import { useRouter } from "@/lib/router"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Logo, EXAM_META } from "@/components/app/brand"
import { Eye, EyeOff, Loader2, Mail, Lock } from "lucide-react"
import { toast } from "sonner"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { createBrowserClient } from "@/lib/supabase"

export function AuthView({ mode }: { mode: "login" | "signup" }) {
  const { login, signup, loginWithGoogle } = useAuth()
  const { navigate, route } = useRouter()
  const next = route.query.get("next") || "/dashboard"

  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      if (mode === "login") await login(email, password)
      else await signup(email, password)
      toast.success(mode === "login" ? "Welcome back!" : "Account created!")
      navigate(next, { replace: true })
    } catch (err: any) {
      toast.error(err.message || "Authentication failed")
    } finally {
      setBusy(false)
    }
  }

  const google = async () => {
    setBusy(true)
    try {
      await loginWithGoogle()
      // OAuth redirect — page will reload on callback
    } catch (err: any) {
      toast.error(err.message || "Google sign-in failed")
      setBusy(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12 hero-glow">
      <div className="w-full max-w-md fade-in">
        <div className="text-center mb-6">
          <Logo className="justify-center mb-3 scale-125" />
          <h1 className="text-2xl font-bold">{mode === "login" ? "Welcome back" : "Create your account"}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "login" ? "Log in to continue your streak." : "Start studying with people on the same journey."}
          </p>
        </div>

        <Tabs value={mode} onValueChange={(v) => navigate(v === "login" ? "/login" : "/signup")}>
          <TabsList className="grid grid-cols-2 w-full mb-4">
            <TabsTrigger value="login">Log in</TabsTrigger>
            <TabsTrigger value="signup">Sign up</TabsTrigger>
          </TabsList>
        </Tabs>

        <Card>
          <CardContent className="p-6">
            <Button variant="outline" className="w-full" onClick={google} disabled={busy} title="Requires Google OAuth to be enabled in Supabase Dashboard">
              <GoogleIcon className="size-4" /> Continue with Google
            </Button>
            <div className="relative my-4 text-center">
              <span className="text-xs text-muted-foreground bg-card px-2 relative">or with email</span>
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-px bg-border -z-10" />
            </div>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input id="email" type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="pl-9" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input id="password" type={show ? "text" : "password"} required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" className="pl-9 pr-9" />
                  <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
              <Button type="submit" className="w-full h-11" disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : mode === "login" ? "Log in" : "Create account"}
              </Button>
            </form>
            <p className="text-xs text-muted-foreground text-center mt-4">
              {mode === "login" ? "New to Sankalp? " : "Already have an account? "}
              <button onClick={() => navigate(mode === "login" ? "/signup" : "/login")} className="text-brand-emerald font-medium hover:underline">
                {mode === "login" ? "Create an account" : "Log in"}
              </button>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.973-8.6-8.8s3.773-8.8 8.6-8.8c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 16.133 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.187-3.067 2-2 2.64-4.84 2.64-7.147 0-.707-.053-1.36-.187-2H12.48z" />
    </svg>
  )
}
