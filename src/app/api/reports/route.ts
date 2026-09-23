import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, badRequest, getAuth, isModerator } from "@/lib/api"

const REASONS = ["spam", "harassment", "cheating", "nsfw", "other"]

// POST /api/reports — file a report
export async function POST(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const body = await req.json().catch(() => ({}))
  const reason = String(body?.reason || "")
  if (!REASONS.includes(reason)) return badRequest("Invalid reason")
  const detail = body?.detail ? String(body.detail).slice(0, 1000) : null
  const reportedId = body?.reportedUserId ? String(body.reportedUserId) : null
  const reportedRoomId = body?.reportedRoomId ? String(body.reportedRoomId) : null
  const reportedMessageId = body?.reportedMessageId ? String(body.reportedMessageId) : null
  if (!reportedId && !reportedRoomId && !reportedMessageId) return badRequest("Nothing to report")

  const report = await db.report.create({
    data: { reporterId: ctx.userId, reportedId, reportedRoomId, reportedMessageId, reason, detail, status: "open" },
  })
  // Notify moderators/admins
  const mods = await db.user.findMany({ where: { role: { in: ["admin", "moderator"] } }, select: { id: true } })
  for (const m of mods) {
    await db.notification.create({
      data: {
        userId: m.id,
        type: "report_update",
        title: "New report filed",
        body: `A ${reason} report was filed`,
        link: "#/admin/reports",
      },
    })
  }
  return ok({ report })
}

// GET /api/reports — list reports (mod/admin only)
export async function GET(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  if (!isModerator(ctx)) return ok({ error: { code: "FORBIDDEN", message: "Moderator only" } }, 403) as any
  const url = new URL(req.url)
  const status = url.searchParams.get("status") || "open"
  const reports = await db.report.findMany({
    where: status === "all" ? {} : { status },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { reporter: { include: { profile: true } }, reported: { include: { profile: true } } },
  })
  return ok({ reports })
}
