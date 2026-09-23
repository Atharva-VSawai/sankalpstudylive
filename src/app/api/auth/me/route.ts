import { NextRequest } from "next/server"
import { getAuth, ok, unauthorized } from "@/lib/api"
import { loadMe } from "@/lib/me"

// GET /api/auth/me — returns the authenticated user's full profile.
// Uses the Supabase JWT (Bearer token) to authenticate, then looks up
// the user in our database by email.
export async function GET(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  try {
    const me = await loadMe(ctx.userId)
    return ok(me)
  } catch {
    return unauthorized()
  }
}
