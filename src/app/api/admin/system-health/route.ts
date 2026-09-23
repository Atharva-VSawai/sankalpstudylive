import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, forbidden, getAuth, isModerator } from "@/lib/api"

export async function GET(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  if (!isModerator(ctx)) return forbidden()

  // Check DB connection
  let dbStatus = "connected"
  try { await db.user.count({ take: 1 }) } catch { dbStatus = "error" }

  const env = process.env.NODE_ENV || "development"

  return ok({
    environment: env === "production" ? "PRODUCTION" : "SANDBOX",
    database: { status: dbStatus, type: "SQLite (sandbox)" },
    redis: { status: "not configured", note: "Sandbox uses in-memory presence" },
    livekit: { status: "simulated", note: "Sandbox uses simulated LiveKit tokens" },
    payments: { status: "simulated", note: "Sandbox simulates payment confirmation" },
    analytics: { status: "not configured", note: "PostHog is a no-op stub" },
    email: { status: "not configured", note: "Resend API key not set" },
    sentry: { status: "not configured", note: "Sentry DSN not set" },
    envVars: {
      DATABASE_URL: Boolean(process.env.DATABASE_URL) ? "Configured" : "Not configured",
      SESSION_SECRET: Boolean(process.env.SESSION_SECRET) ? "Configured" : "Not configured (using default)",
      LIVEKIT_API_KEY: Boolean(process.env.LIVEKIT_API_KEY) ? "Configured" : "Not configured",
      LIVEKIT_API_SECRET: Boolean(process.env.LIVEKIT_API_SECRET) ? "Configured" : "Not configured",
      LIVEKIT_URL: Boolean(process.env.LIVEKIT_URL) ? "Configured" : "Not configured",
      RESEND_API_KEY: Boolean(process.env.RESEND_API_KEY) ? "Configured" : "Not configured",
      POSTHOG_KEY: Boolean(process.env.POSTHOG_KEY) ? "Configured" : "Not configured",
      SENTRY_DSN: Boolean(process.env.SENTRY_DSN) ? "Configured" : "Not configured",
    },
  })
}
