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
    environment: env === "production" ? "Production" : "Development",
    database: { status: dbStatus, type: "PostgreSQL (Supabase)" },
    redis: { status: process.env.REDIS_URL ? "Configured" : "Not configured", note: process.env.REDIS_URL ? "" : "Using in-memory presence (configure Redis for production)" },
    livekit: { status: process.env.LIVEKIT_API_KEY ? "Configured" : "Not configured", note: process.env.LIVEKIT_API_KEY ? "" : "Configure LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET" },
    payments: { status: process.env.RAZORPAY_KEY_ID ? "Configured" : "Not configured", note: process.env.RAZORPAY_KEY_ID ? "" : "Configure Razorpay credentials" },
    analytics: { status: process.env.POSTHOG_KEY ? "Configured" : "Not configured", note: process.env.POSTHOG_KEY ? "" : "PostHog key not set" },
    email: { status: process.env.RESEND_API_KEY ? "Configured" : "Not configured", note: process.env.RESEND_API_KEY ? "" : "Resend API key not set" },
    sentry: { status: process.env.SENTRY_DSN ? "Configured" : "Not configured", note: process.env.SENTRY_DSN ? "" : "Sentry DSN not set" },
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
