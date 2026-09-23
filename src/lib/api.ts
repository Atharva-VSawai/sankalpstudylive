import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { createServerClient } from "@/lib/supabase"
import { verifyToken } from "@/lib/auth"

export type AuthContext = {
  userId: string
  role: string
  user?: { id: string; email: string; role: string; status: string }
}

// Reads the Supabase JWT OR the Sankalp signed session token from the
// Authorization header (or `sankalp_session` cookie) and verifies it.
// Returns the authenticated user context, or null if unauthenticated.
//
// Two token formats are accepted (Supabase JWT wins if it verifies):
//   1. Supabase Auth JWT — verified via supabase.auth.getUser(token).
//   2. Sankalp signed session token — issued by /api/auth/login for
//      email/password users (sandbox stand-in for Supabase Auth).
//      Format: base64url({uid,exp,jti}).signature (HMAC-SHA256).
export async function getAuth(req: NextRequest): Promise<AuthContext | null> {
  const auth = req.headers.get("authorization") || ""
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : null
  const cookieToken = req.cookies.get("sankalp_session")?.value
  const token = bearer || cookieToken
  if (!token) return null

  // ── 1. Try Sankalp signed session token first (cheap, local) ──
  // These tokens are two parts separated by "." (base64url.sig).
  // Supabase JWTs are three parts (header.payload.sig), so they
  // won't match the two-part shape and we fall through cleanly.
  if (token.split(".").length === 2) {
    try {
      const payload = verifyToken<{ uid: string; exp: number }>(token)
      if (payload && payload.uid && (!payload.exp || payload.exp > Math.floor(Date.now() / 1000))) {
        const user = await db.user.findUnique({
          where: { id: payload.uid },
          select: { id: true, email: true, role: true, status: true },
        })
        if (user && user.status === "active") {
          return { userId: user.id, role: user.role, user }
        }
      }
    } catch {
      // fall through to Supabase verification
    }
  }

  // ── 2. Fall back to Supabase JWT verification ──
  try {
    // Verify the JWT with Supabase
    const supabase = createServerClient()
    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data?.user) return null

    // Look up the user in our database by email (Supabase auth user ID maps to our User)
    // We match by email since Supabase Auth manages the identity
    const user = await db.user.findFirst({
      where: {
        OR: [
          { email: data.user.email! },
          { googleSub: data.user.id }
        ]
      },
      select: { id: true, email: true, role: true, status: true }
    })

    if (!user || user.status !== "active") return null
    return { userId: user.id, role: user.role, user }
  } catch {
    return null
  }
}

export function unauthorized() {
  return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 })
}

export function forbidden(message = "You don't have permission to do that") {
  return NextResponse.json({ error: { code: "FORBIDDEN", message } }, { status: 403 })
}

export function notFound(message = "Resource not found") {
  return NextResponse.json({ error: { code: "NOT_FOUND", message } }, { status: 404 })
}

export function badRequest(message: string, code = "BAD_REQUEST") {
  return NextResponse.json({ error: { code, message } }, { status: 400 })
}

export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status })
}

// Role check helpers
export function isAdmin(ctx: AuthContext) {
  return ctx.role === "admin"
}
export function isModerator(ctx: AuthContext) {
  return ctx.role === "moderator" || ctx.role === "admin"
}
