import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, notFound, badRequest, forbidden, getAuth } from "@/lib/api"

// POST /api/rooms/[id]/invite
// Invite a friend (by username) to a room. Creates a room_invite notification
// for the recipient with a deep link to the room.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const { id } = await params
  const room = await db.room.findUnique({ where: { id } })
  if (!room) return notFound("Room not found")

  // Inviter must be a member of the room
  const member = await db.roomMember.findUnique({
    where: { roomId_userId: { roomId: id, userId: ctx.userId } },
  })
  if (!member) return forbidden("Join the room before inviting others", "NOT_MEMBER")

  const body = await req.json().catch(() => ({}))
  const username = String(body?.username || "").trim().toLowerCase()
  if (!username) return badRequest("Username is required")

  const target = await db.profile.findUnique({ where: { username }, include: { user: true } })
  if (!target) return notFound("User not found")
  if (target.userId === ctx.userId) return badRequest("You can't invite yourself")

  // Block check (either direction)
  const blocked = await db.block.findFirst({
    where: {
      OR: [{ blockerId: ctx.userId, blockedId: target.userId }, { blockerId: target.userId, blockedId: ctx.userId }],
    },
  })
  if (blocked) return badRequest("Cannot invite this user", "BLOCKED")

  const inviter = await db.profile.findUnique({ where: { userId: ctx.userId } })

  await db.notification.create({
    data: {
      userId: target.userId,
      type: "room_invite",
      title: `${inviter?.displayName ?? "Someone"} invited you to a room`,
      body: room.name,
      link: `#/rooms/${id}`,
    },
  })

  return ok({ invited: true, to: { userId: target.userId, username: target.username } })
}
