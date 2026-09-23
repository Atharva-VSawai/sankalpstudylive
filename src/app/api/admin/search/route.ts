import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, forbidden, getAuth, isModerator } from "@/lib/api"

export async function GET(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  if (!isModerator(ctx)) return forbidden()
  const url = new URL(req.url)
  const q = url.searchParams.get("q")?.toLowerCase()
  if (!q || q.length < 1) return ok({ users: [], communities: [], rooms: [], reports: [], payments: [] })

  const [users, communities, rooms, reports, payments] = await Promise.all([
    db.user.findMany({ where: { OR: [{ email: { contains: q } }, { profile: { username: { contains: q } } }, { profile: { displayName: { contains: q } } }] }, take: 10,
      include: { profile: { select: { displayName: true, username: true, avatarUrl: true } } },
      select: { id: true, email: true, role: true, status: true, profile: { select: { displayName: true, username: true, avatarUrl: true } } } }),
    db.community.findMany({ where: { OR: [{ name: { contains: q } }, { slug: { contains: q } }] }, take: 10, select: { id: true, name: true, slug: true, memberCount: true, color: true } }),
    db.room.findMany({ where: { name: { contains: q } }, take: 10, select: { id: true, name: true, isLive: true, participantCount: true, isDefaultRoom: true, community: { select: { name: true } } } }),
    db.report.findMany({ take: 10, orderBy: { createdAt: "desc" }, include: { reporter: { include: { profile: { select: { displayName: true } } } }, reported: { include: { profile: { select: { displayName: true } } } } },
      where: { id: { contains: q } } }),
    db.payment.findMany({ where: { OR: [{ id: { contains: q } }, { providerRef: { contains: q } }] }, take: 10,
      include: { user: { include: { profile: { select: { displayName: true } } } } } }),
  ])

  return ok({
    users: users.map((u) => ({ id: u.id, email: u.email, name: u.profile?.displayName, username: u.profile?.username, role: u.role, status: u.status })),
    communities: communities.map((c) => ({ id: c.id, name: c.name, slug: c.slug, members: c.memberCount, color: c.color })),
    rooms: rooms.map((r) => ({ id: r.id, name: r.name, isLive: r.isLive, participants: r.participantCount, isDefault: r.isDefaultRoom, community: r.community?.name })),
    reports: reports.map((r) => ({ id: r.id, reason: r.reason, status: r.status, reporter: r.reporter?.profile?.displayName, reported: r.reported?.profile?.displayName, createdAt: r.createdAt })),
    payments: payments.map((p) => ({ id: p.id, user: p.user.profile?.displayName ?? p.user.email, plan: p.plan, amount: p.amount, status: p.status, providerRef: p.providerRef })),
  })
}
