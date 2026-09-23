import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, notFound, unauthorized, badRequest, getAuth } from "@/lib/api"
import { sendReaction, listReactions } from "@/lib/presence"

const ALLOWED = ["🔥", "👏", "💪", "🙏", "💡", "✨", "🚀", "❤️", "🧠", "🎯"]

// GET /api/rooms/[id]/reactions — recent reactions (for late joiners)
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return ok({ reactions: listReactions(id) })
}

// POST /api/rooms/[id]/reactions — send an emoji reaction
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
  const emoji = String(body?.emoji || "")
  if (!ALLOWED.includes(emoji)) return badRequest("Unsupported emoji")

  const profile = await db.profile.findUnique({ where: { userId: ctx.userId } })
  const reaction = sendReaction(id, ctx.userId, profile?.username ?? "anon", emoji)
  return ok({ reaction })
}
