import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getAuth, unauthorized } from "@/lib/api"
import { localDateForTimezone } from "@/lib/study"

// GET /api/study/export
// Returns the user's full study-session history as a CSV download.
// Columns: date, startedAt, endedAt, durationMin, xpEarned, mode, roomName,
//          community, note, tags
export async function GET(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const user = await db.user.findUnique({ where: { id: ctx.userId } })
  const tz = user?.timezone ?? "Asia/Kolkata"

  const sessions = await db.studySession.findMany({
    where: { userId: ctx.userId, endedAt: { not: null } },
    orderBy: { startedAt: "desc" },
    take: 1000,
    include: { room: { select: { name: true } }, community: { select: { name: true } } },
  })

  const header = ["date", "startedAt", "endedAt", "durationMin", "xpEarned", "mode", "roomName", "community", "note", "tags"]
  const rows: string[] = [header.join(",")]
  for (const s of sessions) {
    const date = localDateForTimezone(s.startedAt, tz).toISOString().slice(0, 10)
    const startedAt = s.startedAt.toISOString()
    const endedAt = s.endedAt?.toISOString() ?? ""
    const tags = safeParse(s.tags).join(";")
    const row = [
      date,
      startedAt,
      endedAt,
      String(s.durationMin),
      String(s.xpEarned),
      csvEscape(s.mode),
      csvEscape(s.room?.name ?? ""),
      csvEscape(s.community?.name ?? ""),
      csvEscape(s.note ?? ""),
      csvEscape(tags),
    ]
    rows.push(row.join(","))
  }
  const csv = rows.join("\r\n")
  const filename = `sankalp-study-history-${new Date().toISOString().slice(0, 10)}.csv`

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}

function csvEscape(s: string): string {
  // RFC 4180: wrap in quotes if contains comma, quote, or newline; double internal quotes.
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function safeParse(s: string): string[] {
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : [] } catch { return [] }
}
