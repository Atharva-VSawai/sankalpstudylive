import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, badRequest, notFound, getAuth } from "@/lib/api"
import { isNotifEnabled } from "@/app/api/notifications/preferences/route"

// GET /api/friends — list friends + pending requests
export async function GET(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const rels = await db.friendship.findMany({
    where: { OR: [{ fromUserId: ctx.userId }, { toUserId: ctx.userId }] },
    include: {
      fromUser: { include: { profile: true } },
      toUser: { include: { profile: true } },
    },
  })
  const friends: any[] = []
  const incoming: any[] = []
  const outgoing: any[] = []
  for (const r of rels) {
    const other = r.fromUserId === ctx.userId ? r.toUser : r.fromUser
    const entry = {
      userId: other.id,
      username: other.profile?.username,
      displayName: other.profile?.displayName,
      avatarUrl: other.profile?.avatarUrl ?? null,
      examGoal: other.profile?.examGoal ?? null,
      level: other.profile?.level ?? 1,
      status: r.status,
      since: r.updatedAt,
    }
    if (r.status === "accepted") friends.push(entry)
    else if (r.status === "pending") {
      if (r.fromUserId === ctx.userId) outgoing.push(entry)
      else incoming.push(entry)
    }
  }
  return ok({ friends, incoming, outgoing })
}

// POST /api/friends — send a friend request { username }
export async function POST(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const body = await req.json().catch(() => ({}))
  const username = String(body?.username || "").trim().toLowerCase()
  if (!username) return badRequest("Username is required")
  const target = await db.profile.findUnique({ where: { username }, include: { user: true } })
  if (!target) return notFound("User not found")
  if (target.userId === ctx.userId) return badRequest("You can't friend yourself")

  // Blocked check
  const blockedEither = await db.block.findFirst({
    where: {
      OR: [{ blockerId: ctx.userId, blockedId: target.userId }, { blockerId: target.userId, blockedId: ctx.userId }],
    },
  })
  if (blockedEither) return badRequest("Cannot interact with this user", "BLOCKED")

  const existing = await db.friendship.findFirst({
    where: { OR: [{ fromUserId: ctx.userId, toUserId: target.userId }, { toUserId: ctx.userId, fromUserId: target.userId }] },
  })
  if (existing) {
    if (existing.status === "accepted") return badRequest("Already friends", "ALREADY_FRIENDS")
    if (existing.status === "pending") return badRequest("A request is already pending", "PENDING")
    // declined -> reset to pending again
    await db.friendship.update({ where: { id: existing.id }, data: { status: "pending", fromUserId: ctx.userId, toUserId: target.userId } })
  } else {
    await db.friendship.create({ data: { fromUserId: ctx.userId, toUserId: target.userId, status: "pending" } })
  }
  if (await isNotifEnabled(target.userId, "friend_request")) {
    await db.notification.create({
      data: {
        userId: target.userId,
        type: "friend_request",
        title: "New friend request",
        body: `You have a new friend request`,
        link: "#/friends",
      },
    })
  }
  return ok({ requested: true })
}
