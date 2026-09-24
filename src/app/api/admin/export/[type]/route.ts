import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getAuth, unauthorized, forbidden, isModerator } from "@/lib/api"

// GET /api/admin/export/[type] — CSV export of operational data
export async function GET(req: NextRequest, { params }: { params: Promise<{ type: string }> }) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  if (!isModerator(ctx)) return forbidden()
  const { type } = await params

  let csv = ""
  let filename = ""

  if (type === "users") {
    const users = await db.user.findMany({ include: { profile: true, streak: true, subscription: true }, take: 1000 })
    csv = ["id,email,displayName,username,role,status,examGoal,totalMinutes,totalXp,level,streakCurrent,plan,createdAt"].join(",") + "\r\n"
    users.forEach((u) => {
      csv += [u.id, csvE(u.email), csvE(u.profile?.displayName ?? ""), csvE(u.profile?.username ?? ""), u.role, u.status, u.profile?.examGoal ?? "", u.profile?.totalMinutes ?? 0, u.profile?.totalXp ?? 0, u.profile?.level ?? 1, u.streak?.current ?? 0, u.subscription?.plan ?? "free", u.createdAt.toISOString()].join(",") + "\r\n"
    })
    filename = `sankalp-users-${new Date().toISOString().slice(0, 10)}.csv`
  } else if (type === "payments") {
    const payments = await db.payment.findMany({ include: { user: { include: { profile: { select: { displayName: true } } } } }, take: 1000 })
    csv = ["id,userId,userName,amount,currency,plan,status,provider,providerRef,createdAt"].join(",") + "\r\n"
    payments.forEach((p) => { csv += [p.id, p.userId, csvE(p.user.profile?.displayName ?? p.user.email), p.amount, p.currency, p.plan, p.status, p.provider, csvE(p.razorpayPaymentId ?? p.razorpayOrderId ?? p.razorpaySubscriptionId ?? ""), p.createdAt.toISOString()].join(",") + "\r\n" })
    filename = `sankalp-payments-${new Date().toISOString().slice(0, 10)}.csv`
  } else if (type === "subscriptions") {
    const subs = await db.subscription.findMany({ include: { user: { include: { profile: { select: { displayName: true } } } } }, take: 1000 })
    csv = ["id,userId,userName,plan,status,startedAt,expiresAt,renewsAt,createdAt"].join(",") + "\r\n"
    subs.forEach((s) => { csv += [s.id, s.userId, csvE(s.user.profile?.displayName ?? s.user.email), s.plan, s.status, s.startedAt.toISOString(), s.expiresAt?.toISOString() ?? "", s.renewsAt?.toISOString() ?? "", s.createdAt.toISOString()].join(",") + "\r\n" })
    filename = `sankalp-subscriptions-${new Date().toISOString().slice(0, 10)}.csv`
  } else if (type === "audit-logs") {
    const logs = await db.auditLog.findMany({ include: { actor: { include: { profile: { select: { displayName: true } } } } }, take: 1000, orderBy: { createdAt: "desc" } })
    csv = ["id,action,actorId,actorName,targetType,targetId,createdAt"].join(",") + "\r\n"
    logs.forEach((l) => { csv += [l.id, l.action, l.actorId ?? "", csvE(l.actor?.profile?.displayName ?? ""), l.targetType ?? "", l.targetId ?? "", l.createdAt.toISOString()].join(",") + "\r\n" })
    filename = `sankalp-audit-logs-${new Date().toISOString().slice(0, 10)}.csv`
  } else if (type === "reports") {
    const reports = await db.report.findMany({ include: { reporter: { include: { profile: { select: { displayName: true } } } }, reported: { include: { profile: { select: { displayName: true } } } } }, take: 1000 })
    csv = ["id,reporterId,reporterName,reportedId,reportedName,reason,status,resolution,createdAt,resolvedAt"].join(",") + "\r\n"
    reports.forEach((r) => { csv += [r.id, r.reporterId, csvE(r.reporter?.profile?.displayName ?? ""), r.reportedId ?? "", csvE(r.reported?.profile?.displayName ?? ""), r.reason, r.status, r.resolution ?? "", r.createdAt.toISOString(), r.resolvedAt?.toISOString() ?? ""].join(",") + "\r\n" })
    filename = `sankalp-reports-${new Date().toISOString().slice(0, 10)}.csv`
  } else if (type === "referrals") {
    const refs = await db.referral.findMany({ take: 1000 })
    csv = ["id,code,referrerId,referredUserId,status,createdAt,completedAt"].join(",") + "\r\n"
    refs.forEach((r) => { csv += [r.id, r.code, r.referrerId, r.referredUserId ?? "", r.status, r.createdAt.toISOString(), r.completedAt?.toISOString() ?? ""].join(",") + "\r\n" })
    filename = `sankalp-referrals-${new Date().toISOString().slice(0, 10)}.csv`
  } else {
    return forbidden("Unknown export type")
  }

  // Audit the export
  await db.auditLog.create({ data: { actorId: ctx.userId, action: "DATA_EXPORT", targetType: "export", targetId: type, metadata: JSON.stringify({ filename }) } })

  return new Response(csv, { status: 200, headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" } })
}

function csvE(s: string): string {
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"` 
  return s
}
