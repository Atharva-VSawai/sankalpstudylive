import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, forbidden, badRequest, getAuth, isModerator } from "@/lib/api"

// GET /api/admin/users?status=&role=&q=&page=&limit=
export async function GET(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  if (!isModerator(ctx)) return forbidden()
  const url = new URL(req.url)
  const status = url.searchParams.get("status")
  const role = url.searchParams.get("role")
  const q = url.searchParams.get("q")?.toLowerCase()
  const page = Math.max(1, Number(url.searchParams.get("page") || 1))
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 30)))

  const where: any = {}
  if (status) where.status = status
  if (role) where.role = role
  if (q) where.email = { contains: q }
  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      include: { profile: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.user.count({ where }),
  ])
  return ok({
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      role: u.role,
      status: u.status,
      createdAt: u.createdAt,
      lastLoginAt: u.lastLoginAt,
      username: u.profile?.username ?? null,
      displayName: u.profile?.displayName ?? null,
      examGoal: u.profile?.examGoal ?? null,
      totalMinutes: u.profile?.totalMinutes ?? 0,
      totalXp: u.profile?.totalXp ?? 0,
      level: u.profile?.level ?? 1,
    })),
    page, limit, total,
  })
}

// PATCH /api/admin/users/[id] — change role/status (handled in [id] route)
