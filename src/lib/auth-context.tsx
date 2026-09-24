"use client"

import { createContext, useContext, useEffect, useState, useCallback, useMemo, useRef, ReactNode } from "react"
import { createBrowserClient, isSupabaseConfigured } from "@/lib/supabase"
import { api, setToken, getToken, ApiError } from "@/lib/api-client"

export type Me = {
  id: string
  email: string
  hasPassword: boolean
  timezone?: string
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
  loginWithGoogle: (next?: string) => Promise<void>
  logout: () => void
  refresh: (updatedMe?: Me) => Promise<void>
}

const SUPABASE_AUTH_TIMEOUT_MS = 8000

function withAuthTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error("Supabase Auth timed out")), SUPABASE_AUTH_TIMEOUT_MS)
    promise.then(
      (value) => { window.clearTimeout(timer); resolve(value) },
      (error) => { window.clearTimeout(timer); reject(error) },
    )
  })
}

function isTransientAuthError(error: any): boolean {
  const message = String(error?.message || error || "").toLowerCase()
  return error?.status >= 500 || message.includes("timed out") || message.includes("timeout") ||
    message.includes("failed to fetch") || message.includes("network") || message.includes("fetch failed")
}

const Ctx = createContext<AuthState>(null as any)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null)
  const [loading, setLoading] = useState(true)
  const authActionInFlight = useRef(false)
  const authInitialized = useRef(false)
  // Memoize the Supabase client so it is created ONCE per provider mount.
  // Previously this was called in the render body, creating a new client on
  // every render → fetchMe callback was recreated every render → the auth
  // useEffect re-ran every render → setMe() → re-render → infinite loop of
  // /api/auth/me calls. This also destabilized `me` identity for every
  // consumer (e.g. RoomView's connect effect), causing token-request loops.
  const supabase = useMemo(() => createBrowserClient(), [])

  // ── Fetch user profile from our backend API ──
  const fetchMe = useCallback(async (): Promise<Me | null> => {
    try {
      const { data: session } = await withAuthTimeout(supabase.auth.getSession())
      if (session?.session?.access_token) {
        // Set the token for API client
        setToken(session.session.access_token)
        // Fetch user profile from our API
        try {
          const data = await api.get<Me>("/auth/me")
          setMe(data)
          return data
        } catch (e) {
          // If our API returns 401, the Supabase-auth'd user may not exist in
          // our DB yet (first Google OAuth login, or first Supabase email
          // signup). Call /auth/sync to create them, then re-fetch /auth/me.
          if (e instanceof ApiError && e.status === 401 && isSupabaseConfigured) {
            try {
              const { data: userData } = await supabase.auth.getUser()
              if (userData?.user) {
                const synced = await api.post<Me>("/auth/sync", {
                  email: userData.user.email,
                  supabaseId: userData.user.id,
                })
                setMe(synced)
                return synced
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
            return data
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
          return null
        }
      }
      return null
    } catch {
      setMe(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    let active = true

    const restoreOAuthRoute = (currentMe: Me | null) => {
      if (typeof window === "undefined") return
      const next = localStorage.getItem("sankalp_oauth_next")
      if (!next) return
      localStorage.removeItem("sankalp_oauth_next")
      // Google can be used from either Log in or Sign up. The first OAuth
      // login has a synced account but an incomplete profile, so it must go
      // straight to the same details screen instead of briefly landing on
      // the dashboard and requiring another sign-in/room navigation.
      const target = currentMe && !currentMe.profile.onboardingComplete ? "/onboarding" : next
      if (target.startsWith("/")) window.location.hash = `#${target}`
    }

    const initializeAuth = async () => {
      // PKCE returns an authorization code in the query string. Exchange it
      // before the first /auth/me call so a first-time Google user is synced
      // on the same callback instead of requiring a second sign-in attempt.
      if (isSupabaseConfigured && typeof window !== "undefined") {
        const code = new URLSearchParams(window.location.search).get("code")
        if (code) {
          const { error } = await withAuthTimeout(supabase.auth.exchangeCodeForSession(code))
          if (!error) {
            const cleanUrl = `${window.location.pathname}${window.location.hash}`
            window.history.replaceState(null, "", cleanUrl)
          }
        }
      }
      const currentMe = await fetchMe()
      if (active) {
        authInitialized.current = true
        restoreOAuthRoute(currentMe)
      }
    }

    void initializeAuth()

    // Listen for auth state changes
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if ((event === "SIGNED_IN" || event === "TOKEN_REFRESHED") && authInitialized.current) {
        if (session?.access_token && !authActionInFlight.current) {
          setToken(session.access_token)
          const currentMe = await fetchMe()
          restoreOAuthRoute(currentMe)
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
      authActionInFlight.current = true
      try {
        const { data, error } = await withAuthTimeout(supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password }))
        if (error || !data.session || !data.user) {
          throw new Error(error?.message || "Invalid email or password")
        }
        setToken(data.session.access_token)
        const synced = await api.post<Me>("/auth/sync", { email: data.user.email, supabaseId: data.user.id })
        setMe(synced)
        setLoading(false)
        return
      } catch (supabaseError: any) {
        // Keep local/demo accounts usable when Supabase is unavailable or when
        // the account has not been migrated into Supabase Auth yet.
        if (!isTransientAuthError(supabaseError) && !String(supabaseError?.message || "").toLowerCase().includes("invalid login credentials")) throw supabaseError
      } finally {
        authActionInFlight.current = false
      }
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
      authActionInFlight.current = true
      try {
        const { data, error } = await withAuthTimeout(supabase.auth.signUp({ email: email.trim().toLowerCase(), password }))
        if (error) throw new Error(error.message)
        if (!data.session || !data.user) {
          throw new Error("Account created. Check your email to confirm your address, then log in.")
        }
        setToken(data.session.access_token)
        const synced = await api.post<Me>("/auth/sync", { email: data.user.email, supabaseId: data.user.id })
        setMe(synced)
        setLoading(false)
        return
      } catch (supabaseError: any) {
        // Never fall back to local signup after a timed-out Supabase request:
        // the remote request may have succeeded even though its response was
        // delayed, and creating a second local account would split identities.
        if (isTransientAuthError(supabaseError)) {
          throw new Error("Supabase Auth is taking too long to respond. Please try again shortly.")
        }
        throw supabaseError
      } finally {
        authActionInFlight.current = false
      }
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
  const loginWithGoogle = useCallback(async (next = "/dashboard") => {
    if (!isSupabaseConfigured) {
      throw new Error("Google sign-in requires Supabase to be configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY to your environment, then enable the Google provider in Supabase Dashboard → Authentication → Providers → Google.")
    }
    try {
      localStorage.setItem("sankalp_oauth_next", next)
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

  const refresh = useCallback(async (updatedMe?: Me) => {
    if (updatedMe) {
      setMe(updatedMe)
      return
    }
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
