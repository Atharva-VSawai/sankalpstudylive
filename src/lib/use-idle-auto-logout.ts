"use client"

import { useEffect, useRef } from "react"
import { useAuth } from "@/lib/auth-context"
import { useRouter } from "@/lib/router"

// Auto-logout hook: watches for user activity (mouse/keyboard/scroll/touch)
// and logs out after `timeoutMin` minutes of inactivity. Disabled when 0.
// Also shows a warning toast before the timeout (60s before).
export function useIdleAutoLogout(timeoutMin: number, disabled = false) {
  const { me, logout } = useAuth()
  const { navigate } = useRouter()
  const lastActivity = useRef<number>(Date.now())
  const warned = useRef(false)

  useEffect(() => {
    if (disabled || !me || !timeoutMin || timeoutMin <= 0) return
    const timeoutMs = timeoutMin * 60 * 1000
    const warningMs = timeoutMs - 60 * 1000

    const onActivity = () => {
      lastActivity.current = Date.now()
      warned.current = false
    }

    const events = ["mousedown", "mousemove", "keydown", "scroll", "touchstart"]
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }))

    const interval = setInterval(() => {
      const idle = Date.now() - lastActivity.current
      if (idle >= timeoutMs) {
        // timeout reached — log out
        logout()
        navigate("/login?reason=timeout", { replace: true })
      } else if (idle >= warningMs && !warned.current) {
        warned.current = true
        // soft warning (imported lazily to avoid circular deps)
        import("sonner").then(({ toast }) => {
          toast.warning("You'll be logged out soon due to inactivity", {
            description: "Click anywhere to stay signed in.",
            duration: 10000,
          })
        })
      }
    }, 5000)

    return () => {
      events.forEach((e) => window.removeEventListener(e, onActivity))
      clearInterval(interval)
    }
  }, [disabled, me, timeoutMin, logout, navigate])
}
