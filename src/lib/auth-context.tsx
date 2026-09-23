"use client"

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react"
import { api, getToken, setToken, ApiError } from "@/lib/api-client"

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
  }
  streak: { current: number; longest: number; lastStudyDate: string | null } | null
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

  const refresh = useCallback(async () => {
    const token = getToken()
    if (!token) {
      setMe(null)
      setLoading(false)
      return
    }
    try {
      const data = await api.get<Me>("/auth/me")
      setMe(data)
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setToken(null)
      setMe(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ token: string; user: Me }>("/auth/login", { email, password })
    setToken(res.token)
    setMe(res.user)
  }, [])

  const signup = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ token: string; user: Me }>("/auth/signup", { email, password })
    setToken(res.token)
    setMe(res.user)
  }, [])

  const loginWithGoogle = useCallback(async () => {
    // Simulated OAuth: in production this redirects to Google via Supabase Auth.
    const res = await api.post<{ token: string; user: Me }>("/auth/google-demo")
    setToken(res.token)
    setMe(res.user)
  }, [])

  const logout = useCallback(() => {
    setToken(null)
    setMe(null)
  }, [])

  return (
    <Ctx.Provider value={{ me, loading, login, signup, loginWithGoogle, logout, refresh }}>
      {children}
    </Ctx.Provider>
  )
}

export function useAuth() {
  return useContext(Ctx)
}
