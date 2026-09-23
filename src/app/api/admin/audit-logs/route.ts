import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, forbidden, getAuth, isModerator } from "@/lib/api"

export async function GET(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  if (!isModerator(ctx)) return forbidden()
  const url = new URL(req.url)
  const action = url.searchParams.get("action")
  const page = Math.max(1, Number(url.searchParams.get("page") || 1))
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit") || 50)))
  const where: any = {}
  if (action) where.action = { contains: action }
  const [logs, total] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit,
      include: { actor: { include: { profile: { select: { displayName: true, username: true } } } } } }),
    db.auditLog.count({ where }),
  ])
  return ok({
    logs: logs.map((l) => ({ id: l.id, action: l.action, actorId: l.actorId, actorName: l.actor?.profile?.displayName, targetType: l.targetType, targetId: l.targetId, metadata: l.metadata, createdAt: l.createdAt })),
    page, limit, total,
  })
}
