"use client"

import { createContext, useContext, useEffect, useState, useCallback, useMemo, ReactNode } from "react"
import { createBrowserClient, isSupabaseConfigured } from "@/lib/supabase"
import { api, setToken, getToken, ApiError } from "@/lib/api-client"

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
  // Memoize the Supabase client so it is created ONCE per provider mount.
  // Previously this was called in the render body, creating a new client on
  // every render → fetchMe callback was recreated every render → the auth
  // useEffect re-ran every render → setMe() → re-render → infinite loop of
  // /api/auth/me calls. This also destabilized `me` identity for every
  // consumer (e.g. RoomView's connect effect), causing token-request loops.
  const supabase = useMemo(() => createBrowserClient(), [])

  // ── Fetch user profile from our backend API ──
  const fetchMe = useCallback(async () => {
    try {
      const { data: session } = await supabase.auth.getSession()
      if (session?.session?.access_token) {
        // Set the token for API client
        setToken(session.session.access_token)
        // Fetch user profile from our API
        try {
          const data = await api.get<Me>("/auth/me")
          setMe(data)
        } catch (e) {
          // If our API returns 401, the Supabase-auth'd user may not exist in
          // our DB yet (first Google OAuth login, or first Supabase email
          // signup). Call /auth/sync to create them, then re-fetch /auth/me.
          if (e instanceof ApiError && e.status === 401 && isSupabaseConfigured) {
            try {
              const { data: userData } = await supabase.auth.getUser()
              if (userData?.user) {
                await api.post("/auth/sync", {
                  email: userData.user.email,
                  supabaseId: userData.user.id,
                })
                const data = await api.get<Me>("/auth/me")
                setMe(data)
                return
              }
            } catch {
              setToken(null)
              setMe(null)
            }
          } else {
            throw e
          }
        }
      } else {
        // ── Sankalp signed session token fallback ──
        // The local /api/auth/login endpoint (sandbox stand-in for Supabase Auth)
        // issues a Sankalp HMAC-signed token. If we have one in localStorage but no
        // Supabase session, use it to fetch the user profile.
        const localToken = getToken()
        if (localToken) {
          try {
            const data = await api.get<Me>("/auth/me")
            setMe(data)
          } catch (e) {
            if (e instanceof ApiError && e.status === 401) {
              setToken(null)
              setMe(null)
            } else {
              throw e
            }
          }
        } else {
          setMe(null)
        }
      }
    } catch {
      setMe(null)
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

  // ── Login via Supabase Auth (with Sankalp local-login fallback) ──
  // If Supabase is configured, try Supabase Auth first (this is the production
  // path — real Supabase email/password users). If Supabase is NOT configured,
  // or if Supabase returns an error (e.g. the user only exists in our local DB
  // like the seeded demo accounts), fall back to /api/auth/login which issues a
  // Sankalp signed session token. This makes the app work with OR without
  // Supabase configured — no code changes needed to switch.
  const login = useCallback(async (email: string, password: string) => {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error || !data.session || !data.user) {
        throw new Error(error?.message || "Invalid email or password")
      }
      setToken(data.session.access_token)
      await api.post("/auth/sync", { email: data.user.email, supabaseId: data.user.id })
      await fetchMe()
      return
    }

    // ── Sankalp local-login fallback ──
    try {
      const res = await api.post<{ token: string }>("/auth/login", { email, password })
      setToken(res.token)
      await fetchMe()
    } catch (e: any) {
      throw new Error(e?.message || "Invalid email or password")
    }
  }, [supabase, fetchMe])

  // ── Signup via Supabase Auth (with Sankalp local-signup fallback) ──
  // If Supabase is configured, use it (this is the production path — real
  // Supabase email/password signup, with email confirmation if enabled in the
  // Supabase dashboard). If Supabase is NOT configured, or if Supabase requires
  // email confirmation (no immediate session), fall back to the Sankalp local
  // /api/auth/signup endpoint which creates the user + issues a Sankalp signed
  // session token immediately (no email confirmation needed). This makes the
  // app work with OR without Supabase configured.
  const signup = useCallback(async (email: string, password: string) => {
    if (isSupabaseConfigured) {
      const { data, error } = await supabase.auth.signUp({ email, password })
      if (error) throw new Error(error.message)
      if (!data.session || !data.user) {
        throw new Error("Account created. Check your email to confirm your address, then log in.")
      }
      setToken(data.session.access_token)
      await api.post("/auth/sync", { email: data.user.email, supabaseId: data.user.id })
      await fetchMe()
      return
    }

    // ── Sankalp local-signup fallback ──
    try {
      const res = await api.post<{ token: string }>("/auth/signup", { email, password })
      setToken(res.token)
      await fetchMe()
    } catch (e: any) {
      throw new Error(e?.message || "Sign up failed")
    }
  }, [supabase, fetchMe])

  // ── Google OAuth via Supabase ──
  // Requires Supabase to be configured AND the Google provider to be enabled
  // in Supabase Dashboard → Authentication → Providers → Google. If Supabase
  // is not configured at all, or the Google provider is not enabled, shows a
  // clear actionable error instead of a generic crash.
  const loginWithGoogle = useCallback(async () => {
    if (!isSupabaseConfigured) {
      throw new Error("Google sign-in requires Supabase to be configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to your environment, then enable the Google provider in Supabase Dashboard → Authentication → Providers → Google.")
    }
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
