import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, forbidden, badRequest, notFound, getAuth, isAdmin } from "@/lib/api"

// POST /api/admin/communities — create a community
// PATCH /api/admin/communities/[slug] — update a community
// (PATCH handler in [slug]/route.ts)
export async function POST(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  if (!isAdmin(ctx)) return forbidden("Admin only")
  const body = await req.json().catch(() => ({}))
  const slug = String(body?.slug || "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "")
  const name = String(body?.name || "").trim()
  const description = String(body?.description || "")
  const examGoal = String(body?.examGoal || name)
  const color = String(body?.color || "#10b981")
  const tags = Array.isArray(body?.tags) ? body.tags : []
  if (!slug || !name) return badRequest("slug and name are required")
  const existing = await db.community.findUnique({ where: { slug } })
  if (existing) return badRequest("Slug already exists", "SLUG_TAKEN")
  const community = await db.community.create({
    data: { slug, name, description, examGoal, color, tags: JSON.stringify(tags), isFeatured: Boolean(body?.isFeatured) },
  })
  return ok({ community })
}
