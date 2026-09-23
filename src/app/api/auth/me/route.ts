import { NextRequest } from "next/server"
import { getAuth, ok, unauthorized } from "@/lib/api"
import { loadMe } from "@/lib/me"

// GET /api/auth/me
export async function GET(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const me = await loadMe(ctx.userId)
  return ok(me)
}
