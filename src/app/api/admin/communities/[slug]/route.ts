import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, forbidden, badRequest, notFound, getAuth, isAdmin } from "@/lib/api"

// PATCH /api/admin/communities/[slug]
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  if (!isAdmin(ctx)) return forbidden("Admin only")
  const { slug } = await params
  const community = await db.community.findUnique({ where: { slug } })
  if (!community) return notFound("Community not found")
  const body = await req.json().catch(() => ({}))
  const data: any = {}
  if (typeof body?.name === "string") data.name = body.name
  if (typeof body?.description === "string") data.description = body.description
  if (typeof body?.color === "string") data.color = body.color
  if (Array.isArray(body?.tags)) data.tags = JSON.stringify(body.tags)
  if (typeof body?.isFeatured === "boolean") data.isFeatured = body.isFeatured
  const updated = await db.community.update({ where: { id: community.id }, data })
  return ok({ community: updated })
}
