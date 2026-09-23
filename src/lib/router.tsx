"use client"

import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from "react"

// Hash-based client router. The whole app is one route ("/").
// Routes look like: #/login, #/communities, #/rooms/abc123, #/admin/reports
// IMPORTANT: route state is shared via a single Context so every component
// sees the same route and navigate() updates all of them.

export type Route = { path: string; segments: string[]; query: URLSearchParams }

function parseHash(): Route {
  const raw = (typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : "") || "/"
  const [pathPart, queryPart] = raw.split("?")
  const path = pathPart || "/"
  const segments = path.split("/").filter(Boolean)
  return { path, segments, query: new URLSearchParams(queryPart || "") }
}

type RouterCtx = {
  route: Route
  navigate: (to: string, opts?: { replace?: boolean }) => void
}

const Ctx = createContext<RouterCtx>(null as any)

export function RouterProvider({ children }: { children: ReactNode }) {
  const [route, setRoute] = useState<Route>(() =>
    typeof window === "undefined"
      ? { path: "/", segments: [], query: new URLSearchParams() }
      : parseHash()
  )

  useEffect(() => {
    const update = () => setRoute(parseHash())
    update()
    window.addEventListener("hashchange", update)
    return () => window.removeEventListener("hashchange", update)
  }, [])

  const navigate = useCallback((to: string, opts?: { replace?: boolean }) => {
    const target = to.startsWith("#") ? to : `#${to.startsWith("/") ? "" : "/"}${to}`
    if (opts?.replace) {
      window.history.replaceState(null, "", target)
      setRoute(parseHash())
      // ensure any other listeners (e.g. scroll) react
      window.dispatchEvent(new Event("hashchange"))
    } else {
      if (window.location.hash === target) {
        // same hash won't fire hashchange; force update
        setRoute(parseHash())
      } else {
        window.location.hash = target
      }
    }
    if (typeof window !== "undefined") window.scrollTo({ top: 0 })
  }, [])

  return <Ctx.Provider value={{ route, navigate }}>{children}</Ctx.Provider>
}

export function useRouter() {
  return useContext(Ctx)
}

export function Link({
  to,
  className,
  children,
  onClick,
  ...rest
}: {
  to: string
  className?: string
  children: ReactNode
  onClick?: () => void
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onClick">) {
  const href = `#${to.startsWith("/") ? "" : "/"}${to}`
  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) return
        onClick?.()
      }}
      {...rest}
    >
      {children}
    </a>
  )
}
