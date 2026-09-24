import { NextRequest } from "next/server"
import { ok, unauthorized, getAuth } from "@/lib/api"
import { markWarningShown } from "@/lib/entitlement"

// POST /api/entitlement/warning-shown
// Marks the 5-minute free-allowance warning as shown for the current 34h
// window. Idempotent: setting it again is a no-op. The warning is shown ONCE
// per window; the flag clears on the 34h server-side reset.
//
// This endpoint takes no body and ignores any client-supplied time values —
// the server is the source of truth.
export async function POST(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  await markWarningShown(ctx.userId)
  return ok({ ok: true })
}
