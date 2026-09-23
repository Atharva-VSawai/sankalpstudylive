import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, notFound, badRequest, forbidden, getAuth } from "@/lib/api"

// PATCH /api/study/sessions/[id]/note
// Add or update a reflection note + tags on a completed (or active) study session.
// Body: { note?: string, tags?: string[] }
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const { id } = await params
  const session = await db.studySession.findUnique({ where: { id } })
  if (!session) return notFound("Session not found")
  if (session.userId !== ctx.userId) return forbidden("Not your session")

  const body = await req.json().catch(() => ({}))
  const data: any = {}
  if (typeof body?.note === "string") {
    const note = body.note.trim().slice(0, 1000)
    data.note = note || null
  }
  if (Array.isArray(body?.tags)) {
    const tags = body.tags.map(String).map((t) => t.trim().slice(0, 24)).filter(Boolean).slice(0, 6)
    data.tags = JSON.stringify(tags)
  }
  if (Object.keys(data).length === 0) return badRequest("Nothing to update")

  const updated = await db.studySession.update({ where: { id }, data })
  return ok({
    session: {
      id: updated.id,
      note: updated.note,
      tags: safeParse(updated.tags),
    },
  })
}

function safeParse(s: string): string[] {
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : [] } catch { return [] }
}
