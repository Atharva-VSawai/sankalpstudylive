"use client"

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react"
import { createBrowserClient } from "@/lib/supabase"
import { api, setToken, ApiError } from "@/lib/api-client"

export type Me = {
  id: string
  email: string
  role: string
  status: string
  profile: {
    id: string
    username: string
    displayName: string
    avatarUrl: string | null
    bio: string | null
    examGoal: string | null
    targetYear: number | null
    studyHoursGoal: number
    onboardingComplete: boolean
    streakCount: number
    totalMinutes: number
    totalXp: number
    level: number
    roomMinutesUsed?: number
    sessionTimeoutMin?: number
    pomodoroConfig?: string
  }
  streak: {
    current: number
    longest: number
    lastStudyDate: string | null
    freezesAvailable: number
    freezesUsed: number
    lastFreezeDate: string | null
  } | null
}

type AuthState = {
  me: Me | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  signup: (email: string, password: string) => Promise<void>
  loginWithGoogle: () => Promise<void>
  logout: () => void
  refresh: () => Promise<void>
}

const Ctx = createContext<AuthState>(null as any)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createBrowserClient()

  // ── Fetch user profile from our backend API ──
  const fetchMe = useCallback(async () => {
    try {
      const { data: session } = await supabase.auth.getSession()
      if (!session?.session?.access_token) {
        setMe(null)
        setLoading(false)
        return
      }
      // Set the token for API client
      setToken(session.session.access_token)
      // Fetch user profile from our API
      const data = await api.get<Me>("/auth/me")
      setMe(data)
    } catch (e) {
      // If our API returns 401, the user may be Supabase-auth'd but not in our DB yet
      if (e instanceof ApiError && e.status === 401) {
        // Try to create profile via signup endpoint
        try {
          const { data: session } = await supabase.auth.getSession()
          if (session?.session?.access_token) {
            const { data: userData } = await supabase.auth.getUser()
            if (userData?.user) {
              // Call our sync endpoint to create profile
              await api.post("/auth/sync", {
                email: userData.user.email,
                supabaseId: userData.user.id,
              })
              const data = await api.get<Me>("/auth/me")
              setMe(data)
            }
          }
        } catch {
          setMe(null)
        }
      } else {
        setMe(null)
      }
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    fetchMe()

    // Listen for auth state changes
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        if (session?.access_token) {
          setToken(session.access_token)
          await fetchMe()
        }
      } else if (event === "SIGNED_OUT") {
        setToken(null)
        setMe(null)
      }
    })

    return () => {
      authListener.subscription.unsubscribe()
    }
  }, [fetchMe, supabase])

  // ── Login via Supabase Auth ──
  const login = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(error.message)
    // The auth state change listener will fetchMe automatically
    // But also do it immediately for UI responsiveness
    await fetchMe()
  }, [supabase, fetchMe])

  // ── Signup via Supabase Auth ──
  const signup = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) throw new Error(error.message)
    // After signup, Supabase may auto-sign-in (depending on email confirmation settings)
    // Try to get session
    const { data } = await supabase.auth.getSession()
    if (data?.session?.access_token) {
      setToken(data.session.access_token)
      // Sync profile with our backend
      try {
        await api.post("/auth/sync", { email })
      } catch {}
      await fetchMe()
    } else {
      // Email confirmation required — set loading false
      setLoading(false)
      throw new Error("Check your email to confirm your account")
    }
  }, [supabase, fetchMe])

  // ── Google OAuth via Supabase ──
  // Requires Google provider to be enabled in Supabase Dashboard → Authentication → Providers → Google.
  // If not enabled, shows a clear error instead of a generic crash.
  const loginWithGoogle = useCallback(async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin }
      })
      if (error) {
        if (error.message.includes("provider is not enabled") || error.message.includes("Unsupported provider")) {
          throw new Error("Google sign-in is not enabled yet. Please use email/password to sign up, or ask the admin to enable Google OAuth in Supabase Dashboard → Authentication → Providers → Google.")
        }
        throw new Error(error.message)
      }
    } catch (e: any) {
      if (e.message.includes("provider is not enabled") || e.message.includes("Unsupported provider")) {
        throw new Error("Google sign-in is not enabled yet. Please use email/password to sign up, or ask the admin to enable Google OAuth in Supabase Dashboard → Authentication → Providers → Google.")
      }
      throw e
    }
  }, [supabase])

  // ── Logout ──
  const logout = useCallback(() => {
    supabase.auth.signOut()
    setToken(null)
    setMe(null)
  }, [supabase])

  const refresh = useCallback(async () => {
    await fetchMe()
  }, [fetchMe])

  return (
    <Ctx.Provider value={{ me, loading, login, signup, loginWithGoogle, logout, refresh }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAuth() {
  return useContext(Ctx)
}
