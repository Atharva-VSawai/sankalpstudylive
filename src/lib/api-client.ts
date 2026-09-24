"use client"

// Typed API client for the frontend. All calls go to Next.js API routes under /api.
// Token is stored in localStorage and attached as Bearer.

export class ApiError extends Error {
  code: string
  status: number
  constructor(code: string, message: string, status: number) {
    super(message)
    this.code = code
    this.status = status
  }
}

const TOKEN_KEY = "sankalp_token"

export function getToken(): string | null {
  if (typeof window === "undefined") return null
  return localStorage.getItem(TOKEN_KEY)
}
export function setToken(t: string | null) {
  if (typeof window === "undefined") return
  if (t) localStorage.setItem(TOKEN_KEY, t)
  else localStorage.removeItem(TOKEN_KEY)
}

async function request<T = any>(
  path: string,
  opts: { method?: string; body?: any; query?: Record<string, any> } = {}
): Promise<T> {
  const { method = "GET", body, query } = opts
  let url = `/api${path}`
  if (query) {
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") q.set(k, String(v))
    }
    const s = q.toString()
    if (s) url += `?${s}`
  }
  const token = getToken()
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (token) headers["Authorization"] = `Bearer ${token}`
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) {
    const code = data?.error?.code || "ERROR"
    const message = data?.error?.message || res.statusText
    throw new ApiError(code, message, res.status)
  }
  return data as T
}

export const api = {
  get: <T = any>(path: string, query?: Record<string, any>) => request<T>(path, { method: "GET", query }),
  post: <T = any>(path: string, body?: any) => request<T>(path, { method: "POST", body }),
  patch: <T = any>(path: string, body?: any) => request<T>(path, { method: "PATCH", body }),
  put: <T = any>(path: string, body?: any) => request<T>(path, { method: "PUT", body }),
  del: <T = any>(path: string, body?: any) => request<T>(path, { method: "DELETE", body }),
}
