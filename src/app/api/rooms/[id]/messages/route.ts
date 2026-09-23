import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, notFound, unauthorized, badRequest, forbidden, getAuth } from "@/lib/api"
import { postMessage, listMessages } from "@/lib/presence"

// GET /api/rooms/[id]/messages
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const limit = Math.min(200, Number(new URL(req.url).searchParams.get("limit") || 50))
  return ok({ messages: listMessages(id, limit) })
}

// POST /api/rooms/[id]/messages
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const { id } = await params
  const room = await db.room.findUnique({ where: { id } })
  if (!room) return notFound("Room not found")
  const member = await db.roomMember.findUnique({
    where: { roomId_userId: { roomId: id, userId: ctx.userId } },
  })
  if (!member) return forbidden("Join the room first", "NOT_MEMBER")

  const body = await req.json().catch(() => null)
  const text = String(body?.text || "").trim().slice(0, 500)
  if (!text) return badRequest("Message text is required")

  const profile = await db.profile.findUnique({ where: { userId: ctx.userId } })
  const msg = postMessage(id, ctx.userId, profile?.username ?? "anon", text, false)

  // Persist for history (capped; production trims via background job)
  await db.roomMessage.create({ data: { roomId: id, userId: ctx.userId, text } })

  return ok({ message: msg })
}
