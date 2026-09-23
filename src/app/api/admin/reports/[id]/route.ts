import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, forbidden, badRequest, notFound, getAuth, isAdmin } from "@/lib/api"

// GET /api/admin/reports — already in /api/reports GET (mod-visible)
// PATCH /api/admin/reports/[id] — resolve a report
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  if (!isAdmin(ctx)) return forbidden("Admin only")
  const { id } = await params
  const body = await req.json().catch(() => ({}))
  const status = ["open", "reviewing", "resolved", "dismissed"].includes(body?.status) ? body.status : null
  const resolution = ["warning", "mute", "kick", "ban", "no_action"].includes(body?.resolution) ? body.resolution : null
  if (!status && !resolution) return badRequest("Nothing to update")
  const report = await db.report.findUnique({ where: { id } })
  if (!report) return notFound("Report not found")
  const data: any = { resolvedById: ctx.userId, resolvedAt: new Date() }
  if (status) data.status = status
  if (resolution) data.resolution = resolution
  const updated = await db.report.update({ where: { id }, data })
  await db.auditLog.create({
    data: { actorId: ctx.userId, action: "report_resolve", targetType: "report", targetId: id, metadata: JSON.stringify(data) },
  })
  return ok({ report: updated })
}
