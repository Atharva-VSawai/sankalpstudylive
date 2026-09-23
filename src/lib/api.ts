import { NextRequest, NextResponse } from "next/server"
import { db } from "@/lib/db"
import { verifyToken } from "@/lib/auth"

export type AuthContext = {
  userId: string
  role: string
  user?: { id: string; email: string; role: string; status: string }
}

// Reads bearer token from the request and returns the authenticated user context.
// On failure returns null; the route handler decides how to respond.
export async function getAuth(req: NextRequest): Promise<AuthContext | null> {
  const auth = req.headers.get("authorization") || ""
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : null
  const cookieToken = req.cookies.get("sankalp_session")?.value
  const token = bearer || cookieToken
  if (!token) return null
  const payload = verifyToken<{ uid: string; exp: number }>(token)
  if (!payload || payload.exp < Math.floor(Date.now() / 1000)) return null
  const user = await db.user.findUnique({
    where: { id: payload.uid },
    select: { id: true, email: true, role: true, status: true },
  })
  if (!user || user.status !== "active") return null
  return { userId: user.id, role: user.role, user }
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
