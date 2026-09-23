import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, notFound, unauthorized, badRequest, getAuth } from "@/lib/api"
import { addWhiteboardStroke, listWhiteboardStrokes, clearWhiteboard, undoWhiteboardStroke } from "@/lib/presence"

// GET /api/rooms/[id]/whiteboard — all strokes (for late joiners)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return ok({ strokes: listWhiteboardStrokes(id) })
}

// POST /api/rooms/[id]/whiteboard — add a stroke OR text OR clear OR undo
// Body: { color, points: [{x,y}] }  for pen stroke (points normalized 0..1)
//    OR { kind: "text", color, x, y, text }  for text label
//    OR { action: "clear" }  to clear the board
//    OR { action: "undo" }  to undo your last stroke
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const { id } = await params
  const room = await db.room.findUnique({ where: { id } })
  if (!room) return notFound("Room not found")
  const member = await db.roomMember.findUnique({
    where: { roomId_userId: { roomId: id, userId: ctx.userId } },
  })
  if (!member) return badRequest("Join the room first", "NOT_MEMBER")

  const body = await req.json().catch(() => ({}))

  if (body?.action === "clear") {
    clearWhiteboard(id, ctx.userId)
    return ok({ cleared: true })
  }
  if (body?.action === "undo") {
    const removed = undoWhiteboardStroke(id, ctx.userId)
    return ok({ undone: Boolean(removed), strokeId: removed?.id ?? null })
  }

  const profile = await db.profile.findUnique({ where: { userId: ctx.userId } })
  const color = String(body?.color || "#10b981").slice(0, 9)

  // Text stroke
  if (body?.kind === "text") {
    const x = Number(body?.x)
    const y = Number(body?.y)
    const text = String(body?.text || "").slice(0, 200)
    if (!Number.isFinite(x) || x < 0 || x > 1 || !Number.isFinite(y) || y < 0 || y > 1) {
      return badRequest("x,y must be in 0..1")
    }
    if (!text.trim()) return badRequest("text required")
    const stroke = addWhiteboardStroke(id, {
      userId: ctx.userId,
      username: profile?.username ?? "anon",
      color,
      points: [{ x, y }],
      kind: "text",
      text,
    } as any)
    return ok({ stroke })
  }

  // Pen stroke
  const points = Array.isArray(body?.points) ? body.points : null
  if (!points || points.length < 1) return badRequest("points required")
  if (points.length > 2000) return badRequest("Too many points in one stroke")
  for (const p of points) {
    if (typeof p.x !== "number" || typeof p.y !== "number" || p.x < 0 || p.x > 1 || p.y < 0 || p.y > 1) {
      return badRequest("points must be {x,y} in 0..1")
    }
  }

  const width = Number(body?.width)
  const strokeWidth = Number.isFinite(width) && width > 0 && width <= 20 ? width : 2.5

  const stroke = addWhiteboardStroke(id, {
    userId: ctx.userId,
    username: profile?.username ?? "anon",
    color,
    points,
    width: strokeWidth,
  } as any)
  return ok({ stroke })
}
