"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, LiveDot, formatMinutes, timeAgo } from "@/components/app/brand"
import { Link, useRouter } from "@/lib/router"
import { useAuth } from "@/lib/auth-context"
import {
  Shield, Users, Video, Flag, BarChart3, LayoutDashboard, Home, Plus, Check, X, Ban,
  Crown, Activity, TrendingUp, Mail, Search, Download, Bell, Award, Cpu, ScrollText,
  Settings, CreditCard, Gift, Zap, FileDown, ChevronLeft, AlertTriangle, CircleDot, Clock,
} from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export function AdminView({ section, userId }: { section: string; userId?: string }) {
  const { me } = useAuth()
  const { navigate } = useRouter()
  if (me?.role !== "admin" && me?.role !== "moderator") {
    return <div className="p-10 text-center text-muted-foreground">Admin access required.</div>
  }

  // Grouped navigation
  const navGroups: { label?: string; items: { id: string; label: string; icon: React.ReactNode; adminOnly?: boolean }[] }[] = [
    { items: [{ id: "dashboard", label: "Overview", icon: <LayoutDashboard className="size-4" /> }] },
    { label: "Management", items: [
      { id: "users", label: "Users", icon: <Users className="size-4" /> },
      { id: "communities", label: "Communities", icon: <Home className="size-4" /> },
      { id: "rooms", label: "Rooms", icon: <Video className="size-4" /> },
    ]},
    { label: "Moderation", items: [
      { id: "reports", label: "Reports", icon: <Flag className="size-4" /> },
    ]},
    { label: "Business", items: [
      { id: "subscriptions", label: "Subscriptions", icon: <CreditCard className="size-4" />, adminOnly: true },
      { id: "payments", label: "Payments", icon: <CreditCard className="size-4" />, adminOnly: true },
      { id: "referrals", label: "Referrals", icon: <Gift className="size-4" />, adminOnly: true },
    ]},
    { label: "Analytics", items: [
      { id: "analytics", label: "Study Analytics", icon: <BarChart3 className="size-4" /> },
    ]},
    { label: "Communication", items: [
      { id: "notifications", label: "Notifications", icon: <Bell className="size-4" />, adminOnly: true },
    ]},
    { label: "Gamification", items: [
      { id: "badges", label: "Badges & XP", icon: <Award className="size-4" /> },
    ]},
    { label: "System", items: [
      { id: "system-health", label: "System Health", icon: <Cpu className="size-4" /> },
      { id: "audit-logs", label: "Audit Logs", icon: <ScrollText className="size-4" /> },
      { id: "settings", label: "Settings", icon: <Settings className="size-4" />, adminOnly: true },
    ]},
  ]

  const item = (to: string, label: string, icon: React.ReactNode, adminOnly?: boolean) => {
    if (adminOnly && me?.role !== "admin") return null
    const active = section === to || (to === "dashboard" && section === "dashboard")
    return (
      <button key={to} onClick={() => navigate(to === "dashboard" ? "/admin" : `/admin/${to}`)}
        className={cn("flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors w-full text-left",
          active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground")}>
        {icon}<span>{label}</span>
      </button>
    )
  }

  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      {/* Sidebar */}
      <aside className="hidden md:flex w-56 shrink-0 flex-col gap-3 p-3 border-r overflow-y-auto scroll-thin">
        <div className="flex items-center gap-2 px-3 py-2">
          <Shield className="size-5 text-brand-emerald" />
          <span className="font-bold text-sm">Sankalp Admin</span>
        </div>
        {navGroups.map((group, gi) => (
          <div key={gi}>
            {group.label && <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60 px-3 mb-1 mt-2">{group.label}</div>}
            <div className="space-y-0.5">
              {group.items.map((it) => item(it.id, it.label, it.icon, it.adminOnly))}
            </div>
          </div>
        ))}
      </aside>

      {/* Mobile nav */}
      <div className="md:hidden flex gap-1 overflow-x-auto p-2 border-b scroll-thin">
        {navGroups.flatMap(g => g.items).map((it) => {
          if (it.adminOnly && me?.role !== "admin") return null
          return (
            <button key={it.id} onClick={() => navigate(it.id === "dashboard" ? "/admin" : `/admin/${it.id}`)}
              className={cn("px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap",
                section === it.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
              {it.label}
            </button>
          )
        })}
      </div>

      {/* Main content */}
      <main className="flex-1 min-w-0 p-4 md:p-6 overflow-y-auto">
        {section === "dashboard" && <OverviewSection />}
        {section === "users" && <UsersSection />}
        {section === "user-detail" && userId && <UserDetailSection userId={userId} />}
        {section === "communities" && <CommunitiesSection />}
        {section === "rooms" && <RoomsSection />}
        {section === "reports" && <ReportsSection />}
        {section === "subscriptions" && <SubscriptionsSection />}
        {section === "payments" && <PaymentsSection />}
        {section === "referrals" && <ReferralsSection />}
        {section === "analytics" && <AnalyticsSection />}
        {section === "notifications" && <NotificationsSection />}
        {section === "badges" && <BadgesSection />}
        {section === "system-health" && <SystemHealthSection />}
        {section === "audit-logs" && <AuditLogsSection />}
        {section === "settings" && <SettingsSection />}
      </main>
    </div>
  )
}

// ── Overview Section ──
function OverviewSection() {
  const { data, isLoading } = useQuery({ queryKey: ["admin", "stats"], queryFn: () => api.get<any>("/admin/stats") })
  if (isLoading) return <div className="text-center text-muted-foreground py-10">Loading…</div>
  const s = data ?? {}
  return (
    <div className="space-y-6">
      <div><h1 className="text-2xl font-bold flex items-center gap-2"><Shield className="size-6 text-brand-emerald" /> Overview</h1>
        <p className="text-muted-foreground text-sm">Real-time operational metrics. No fabricated data.</p></div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Total Users" value={s.users?.total ?? "—"} sub={`${s.users?.today ?? 0} today`} icon={<Users className="size-4" />} />
        <MetricCard label="Active Today" value={s.users?.activeToday ?? "—"} sub={`${s.users?.activeThisWeek ?? 0} this week`} icon={<Activity className="size-4" />} />
        <MetricCard label="Total Study" value={formatMinutes(s.study?.totalMinutes ?? 0)} sub={`${formatMinutes(s.study?.minutesToday ?? 0)} today`} icon={<TrendingUp className="size-4" />} />
        <MetricCard label="Active Rooms" value={s.study?.activeRooms ?? "—"} sub={`${s.rooms?.total ?? 0} total`} icon={<Video className="size-4" />} />
        <MetricCard label="Active Subs" value={s.business?.activeSubscriptions ?? "—"} sub={`${s.business?.planBreakdown?.focus_pass ?? 0} passes`} icon={<CreditCard className="size-4" />} />
        <MetricCard label="Revenue" value={`₹${((s.business?.revenuePaise ?? 0) / 100).toFixed(0)}`} sub={`${s.business?.paidPayments ?? 0} payments`} icon={<CreditCard className="size-4" />} />
        <MetricCard label="Open Reports" value={s.moderation?.openReports ?? "—"} sub={`${s.moderation?.reportsResolvedToday ?? 0} resolved today`} icon={<Flag className="size-4" />} />
        <MetricCard label="Referrals" value={s.referrals?.total ?? "—"} sub={`${s.referrals?.successful ?? 0} successful`} icon={<Gift className="size-4" />} />
      </div>
      {s.rooms?.mostActive?.length > 0 && (
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Most Active Rooms</CardTitle></CardHeader>
          <CardContent className="space-y-1">
            {s.rooms.mostActive.map((r: any) => (
              <div key={r.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-accent">
                <span className="text-sm font-medium">{r.name}{r.isDefaultRoom && <span className="ml-2 text-[10px] text-brand-emerald">DEFAULT</span>}</span>
                <span className="text-xs text-muted-foreground">{r.participantCount} studying {r.isLive && <LiveDot />}</span>
              </div>
            ))}
          </CardContent></Card>)}
    </div>
  )
}
function MetricCard({ label, value, sub, icon }: { label: string; value: any; sub: string; icon: React.ReactNode }) {
  return <Card><CardContent className="p-4">
    <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
    <div className="text-2xl font-bold mt-1">{value}</div>
    <div className="text-xs text-muted-foreground mt-0.5">{sub}</div>
  </CardContent></Card>
}

// ── Users Section ──
function UsersSection() {
  const qc = useQueryClient()
  const [q, setQ] = useState("")
  const [status, setStatus] = useState("active")
  const [banTarget, setBanTarget] = useState<{ id: string; name: string; action: "ban" | "suspend" | "delete" } | null>(null)
  const [banReason, setBanReason] = useState("")
  const [deleteConfirm, setDeleteConfirm] = useState("")
  const { data } = useQuery({ queryKey: ["admin", "users", q, status], queryFn: () => api.get<any>("/admin/users", { q: q || undefined, status, limit: 50 }) })
  const update = useMutation({
    mutationFn: ({ id, ...patch }: any) => api.patch(`/admin/users/${id}`, patch),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "users"] }); toast.success("User updated") },
  })
  const delUser = useMutation({
    mutationFn: (id: string) => api.del(`/admin/users/${id}/delete`, { confirm: "DELETE", reason: banReason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "users"] }); toast.success("User deleted"); setBanTarget(null); setBanReason(""); setDeleteConfirm("") },
    onError: (e: any) => toast.error(e.message || "Failed to delete"),
  })
  const doAction = () => {
    if (!banTarget) return
    if (banTarget.action === "delete") { if (deleteConfirm !== "DELETE") { toast.error("Type CONFIRM to delete"); return }; delUser.mutate(banTarget.id); return }
    const newStatus = banTarget.action === "ban" ? "banned" : "suspended"
    update.mutate({ id: banTarget.id, status: newStatus })
    setBanTarget(null); setBanReason("")
  }
  const users = data?.users ?? []
  return (
    <div className="space-y-4">
      <div><h1 className="text-2xl font-bold flex items-center gap-2"><Users className="size-6" /> Users</h1></div>
      <div className="flex gap-2 flex-wrap">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name/email…" className="w-56" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm">
          <option value="active">Active</option><option value="suspended">Suspended</option><option value="banned">Banned</option>
        </select>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left"><tr>
            {["User", "Role", "Status", "Study", "Streak", "Plan", "Joined", "Actions"].map(h => <th key={h} className="p-2 font-medium">{h}</th>)}
          </tr></thead>
          <tbody className="divide-y">
            {users.map((u: any) => (
              <tr key={u.id} className="hover:bg-accent/40">
                <td className="p-2">
                  <button onClick={() => navigate(`/admin/users/${u.id}`)} className="flex items-center gap-2 hover:underline">
                    <Avatar name={u.displayName ?? u.email} size={24} />
                    <div className="min-w-0"><div className="font-medium truncate">{u.displayName ?? u.email}</div><div className="text-xs text-muted-foreground truncate">@{u.username ?? "—"}</div></div>
                  </button>
                </td>
                <td className="p-2"><select value={u.role} onChange={(e) => update.mutate({ id: u.id, role: e.target.value })} className="h-7 rounded border bg-background px-1 text-xs"><option value="user">user</option><option value="moderator">mod</option><option value="admin">admin</option></select></td>
                <td className="p-2"><span className={cn("text-xs px-2 py-0.5 rounded-full", u.status === "active" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400")}>{u.status}</span></td>
                <td className="p-2 text-xs">{formatMinutes(u.totalMinutes)}</td>
                <td className="p-2 text-xs">—</td>
                <td className="p-2 text-xs">—</td>
                <td className="p-2 text-xs">{timeAgo(u.createdAt)}</td>
                <td className="p-2"><div className="flex gap-1">
                  {u.status === "active" ? <Button size="sm" variant="ghost" onClick={() => setBanTarget({ id: u.id, name: u.displayName ?? u.email, action: "suspend" })}><Ban className="size-3.5" /></Button>
                  : <Button size="sm" variant="ghost" onClick={() => update.mutate({ id: u.id, status: "active" })}><Check className="size-3.5" /></Button>}
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setBanTarget({ id: u.id, name: u.displayName ?? u.email, action: "ban" })}><Ban className="size-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setBanTarget({ id: u.id, name: u.displayName ?? u.email, action: "delete" })}><X className="size-3.5" /></Button>
                </div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog open={!!banTarget} onOpenChange={() => setBanTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="size-5" /> {banTarget?.action === "delete" ? "Delete" : banTarget?.action === "ban" ? "Ban" : "Suspend"} {banTarget?.name}?</DialogTitle>
            <DialogDescription>{banTarget?.action === "delete" ? "This permanently deletes the account and all associated data." : banTarget?.action === "ban" ? "This prevents the user from accessing Sankalp." : "This temporarily restricts the user."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Reason (audited)</Label><Textarea value={banReason} onChange={(e) => setBanReason(e.target.value)} placeholder="Reason for this action…" rows={2} /></div>
            {banTarget?.action === "delete" && <div><Label>Type <code className="bg-muted px-1 rounded">CONFIRM</code> to delete</Label><Input value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder="CONFIRM" /></div>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setBanTarget(null)}>Cancel</Button>
            <Button variant="destructive" onClick={doAction} disabled={banTarget?.action === "delete" && deleteConfirm !== "CONFIRM"}>{banTarget?.action === "delete" ? "Permanently Delete" : "Confirm"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── User Detail Section ──
function UserDetailSection({ userId }: { userId: string }) {
  const { navigate } = useRouter()
  const { data, isLoading } = useQuery({ queryKey: ["admin", "user", userId], queryFn: () => api.get<any>(`/admin/users/${userId}`) })
  if (isLoading) return <div className="text-center py-10">Loading…</div>
  if (!data?.user) return <div className="text-center py-10">User not found. <Link to="/admin/users" className="text-brand-emerald">Back to users</Link></div>
  const u = data.user; const p = data.profile
  return (
    <div className="space-y-4">
      <button onClick={() => navigate("/admin/users")} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ChevronLeft className="size-4" /> Back to Users</button>
      <div className="flex items-start gap-4">
        <Avatar name={p?.displayName ?? u.email} src={p?.avatarUrl} size={64} />
        <div className="flex-1"><h1 className="text-2xl font-bold">{p?.displayName ?? u.email}</h1>
          <p className="text-sm text-muted-foreground">@{p?.username ?? "—"} · {u.email}</p>
          <div className="flex gap-2 mt-2">
            <span className={cn("text-xs px-2 py-0.5 rounded-full", u.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700")}>{u.status}</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-muted">{u.role}</span>
          </div></div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Profile</CardTitle></CardHeader><CardContent className="space-y-1 text-sm">
          <Row label="Username" value={p?.username ?? "—"} /><Row label="Bio" value={p?.bio ?? "—"} /><Row label="Exam Goal" value={p?.examGoal ?? "—"} /><Row label="Level" value={p?.level ?? 1} /><Row label="Total XP" value={p?.totalXp ?? 0} /><Row label="Study Time" value={formatMinutes(p?.totalMinutes ?? 0)} /><Row label="Room Minutes Used" value={p?.roomMinutesUsed ?? 0} /><Row label="Joined" value={timeAgo(u.createdAt)} /><Row label="Last Login" value={u.lastLoginAt ? timeAgo(u.lastLoginAt) : "—"} /></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Study</CardTitle></CardHeader><CardContent className="space-y-1 text-sm">
          <Row label="Sessions" value={data.study?.sessionsCount ?? 0} /><Row label="Total Minutes" value={formatMinutes(data.study?.totalMinutes ?? 0)} /><Row label="Streak" value={`${data.streak?.current ?? 0}d (longest ${data.streak?.longest ?? 0}d)`} /><Row label="Communities" value={data.communities?.length ?? 0} /><Row label="Friends" value={data.social?.friendsCount ?? 0} /><Row label="Reports Made" value={data.social?.reportsMade ?? 0} /><Row label="Reports Against" value={data.social?.reportsAgainst ?? 0} /><Row label="Badges" value={data.badges?.length ?? 0} /></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Subscription</CardTitle></CardHeader><CardContent className="space-y-1 text-sm">
          {data.subscription ? <><Row label="Plan" value={data.subscription.plan} /><Row label="Status" value={data.subscription.status} /><Row label="Started" value={timeAgo(data.subscription.startedAt)} /><Row label="Expires" value={data.subscription.expiresAt ? new Date(data.subscription.expiresAt).toLocaleDateString("en-IN") : "—"} /></> : <p className="text-muted-foreground">No subscription (free)</p>}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Recent Sessions</CardTitle></CardHeader><CardContent className="space-y-1 text-sm">
          {(data.study?.recentSessions ?? []).slice(0, 5).map((s: any) => <div key={s.id} className="flex justify-between"><span className="truncate">{s.roomName ?? "Solo"}</span><span className="text-muted-foreground">{formatMinutes(s.durationMin)}</span></div>)}
          {(!data.study?.recentSessions || data.study.recentSessions.length === 0) && <p className="text-muted-foreground">No sessions</p>}</CardContent></Card>
      </div>
    </div>
  )
}
function Row({ label, value }: { label: string; value: any }) { return <div className="flex justify-between"><span className="text-muted-foreground">{label}</span><span className="font-medium text-right">{value}</span></div> }

// ── Subscriptions Section ──
function SubscriptionsSection() {
  const { data } = useQuery({ queryKey: ["admin", "subscriptions"], queryFn: () => api.get<any>("/admin/subscriptions", { limit: 50 }) })
  const subs = data?.subscriptions ?? []
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold flex items-center gap-2"><CreditCard className="size-6" /> Subscriptions</h1>
        <Button variant="outline" size="sm" onClick={() => downloadExport("subscriptions")}><Download className="size-4" /> Export CSV</Button></div>
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-left"><tr>{["User", "Plan", "Status", "Started", "Expires", "Renews"].map(h => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead>
        <tbody className="divide-y">{subs.map((s: any) => <tr key={s.id} className="hover:bg-accent/40"><td className="p-2"><button onClick={() => navigate(`/admin/users/${s.userId}`)} className="hover:underline">{s.userName}</button></td><td className="p-2">{s.plan}</td><td className="p-2"><span className={cn("text-xs px-2 py-0.5 rounded-full", s.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-muted")}>{s.status}</span></td><td className="p-2 text-xs">{timeAgo(s.startedAt)}</td><td className="p-2 text-xs">{s.expiresAt ? new Date(s.expiresAt).toLocaleDateString("en-IN") : "—"}</td><td className="p-2 text-xs">{s.renewsAt ? new Date(s.renewsAt).toLocaleDateString("en-IN") : "—"}</td></tr>)}</tbody>
      </table>{subs.length === 0 && <p className="text-center text-muted-foreground py-8">No subscriptions found.</p>}</div>
    </div>
  )
}

// ── Payments Section ──
function PaymentsSection() {
  const { data } = useQuery({ queryKey: ["admin", "payments"], queryFn: () => api.get<any>("/admin/payments", { limit: 50 }) })
  const payments = data?.payments ?? []
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold flex items-center gap-2"><CreditCard className="size-6" /> Payments</h1>
        <Button variant="outline" size="sm" onClick={() => downloadExport("payments")}><Download className="size-4" /> Export CSV</Button></div>
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-left"><tr>{["User", "Amount", "Plan", "Status", "Provider", "Date"].map(h => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead>
        <tbody className="divide-y">{payments.map((p: any) => <tr key={p.id} className="hover:bg-accent/40"><td className="p-2">{p.userName}</td><td className="p-2">₹{(p.amount / 100).toFixed(0)}</td><td className="p-2">{p.plan}</td><td className="p-2"><span className={cn("text-xs px-2 py-0.5 rounded-full", p.status === "paid" ? "bg-emerald-100 text-emerald-700" : p.status === "failed" ? "bg-red-100 text-red-700" : "bg-muted")}>{p.status}</span></td><td className="p-2 text-xs">{p.provider}</td><td className="p-2 text-xs">{timeAgo(p.createdAt)}</td></tr>)}</tbody>
      </table>{payments.length === 0 && <p className="text-center text-muted-foreground py-8">No payments found.</p>}</div>
    </div>
  )
}

// ── Referrals Section ──
function ReferralsSection() {
  const { data } = useQuery({ queryKey: ["admin", "referrals"], queryFn: () => api.get<any>("/admin/referrals", { limit: 50 }) })
  const refs = data?.referrals ?? []
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold flex items-center gap-2"><Gift className="size-6" /> Referrals</h1>
        <Button variant="outline" size="sm" onClick={() => downloadExport("referrals")}><Download className="size-4" /> Export CSV</Button></div>
      <div className="grid grid-cols-3 gap-3"><MetricCard label="Total" value={data?.total ?? 0} sub="" icon={<Gift className="size-4" />} /><MetricCard label="Successful" value={data?.successfulCount ?? 0} sub="" icon={<Check className="size-4" />} /><MetricCard label="Conversion" value={data?.total ? `${Math.round((data.successfulCount / data.total) * 100)}%` : "—"} sub="" icon={<TrendingUp className="size-4" />} /></div>
      <div className="overflow-x-auto"><table className="w-full text-sm">
        <thead className="border-b bg-muted/40 text-left"><tr>{["Code", "Referred", "Status", "Created"].map(h => <th key={h} className="p-2 font-medium">{h}</th>)}</tr></thead>
        <tbody className="divide-y">{refs.map((r: any) => <tr key={r.id} className="hover:bg-accent/40"><td className="p-2 font-mono text-xs">{r.code}</td><td className="p-2">{r.referredName ?? "—"}</td><td className="p-2">{r.status}</td><td className="p-2 text-xs">{timeAgo(r.createdAt)}</td></tr>)}</tbody>
      </table>{refs.length === 0 && <p className="text-center text-muted-foreground py-8">No referrals found.</p>}</div>
    </div>
  )
}

// ── Audit Logs Section ──
function AuditLogsSection() {
  const { data } = useQuery({ queryKey: ["admin", "audit-logs"], queryFn: () => api.get<any>("/admin/audit-logs", { limit: 50 }) })
  const logs = data?.logs ?? []
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold flex items-center gap-2"><ScrollText className="size-6" /> Audit Logs</h1>
        <Button variant="outline" size="sm" onClick={() => downloadExport("audit-logs")}><Download className="size-4" /> Export CSV</Button></div>
      <div className="space-y-1">{logs.map((l: any) => (
        <div key={l.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent">
          <span className="text-xs font-mono px-2 py-0.5 rounded bg-muted">{l.action}</span>
          <span className="text-sm">{l.actorName ?? "system"}</span>
          {l.targetType && <span className="text-xs text-muted-foreground">→ {l.targetType}:{l.targetId?.slice(0, 8)}</span>}
          <span className="text-xs text-muted-foreground ml-auto">{timeAgo(l.createdAt)}</span>
        </div>
      ))}{logs.length === 0 && <p className="text-center text-muted-foreground py-8">No audit logs found.</p>}</div>
    </div>
  )
}

// ── System Health Section ──
function SystemHealthSection() {
  const { data, isLoading } = useQuery({ queryKey: ["admin", "system-health"], queryFn: () => api.get<any>("/admin/system-health") })
  if (isLoading) return <div className="text-center py-10">Loading…</div>
  const h = data ?? {}
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold flex items-center gap-2"><Cpu className="size-6" /> System Health</h1>
      <div className="grid md:grid-cols-2 gap-3">
        {Object.entries({ "Environment": h.environment, "Database": h.database?.status, "Redis": h.redis?.status, "LiveKit": h.livekit?.status, "Payments": h.payments?.status, "Analytics": h.analytics?.status, "Email": h.email?.status, "Sentry": h.sentry?.status }).map(([k, v]) => (
          <Card key={k}><CardContent className="p-3 flex items-center justify-between">
            <span className="text-sm font-medium">{k}</span>
            <span className={cn("text-xs px-2 py-0.5 rounded-full", v === "connected" || v === "PRODUCTION" ? "bg-emerald-100 text-emerald-700" : v === "error" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700")}>{v ?? "—"}</span>
          </CardContent></Card>
        ))}
      </div>
      {h.envVars && (
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Environment Variables</CardTitle></CardHeader>
          <CardContent className="space-y-1">{Object.entries(h.envVars).map(([k, v]) => <div key={k} className="flex justify-between text-sm"><span className="font-mono text-xs">{k}</span><span className={cn("text-xs", v === "Configured" ? "text-emerald-600" : "text-muted-foreground")}>{v as string}</span></div>)}</CardContent></Card>
      )}
      {(h.database?.note || h.redis?.note || h.livekit?.note || h.payments?.note) && (
        <Card><CardContent className="p-3 text-xs text-muted-foreground space-y-1">
          {h.database?.note && <div>Database: {h.database.note}</div>}
          {h.redis?.note && <div>Redis: {h.redis.note}</div>}
          {h.livekit?.note && <div>LiveKit: {h.livekit.note}</div>}
          {h.payments?.note && <div>Payments: {h.payments.note}</div>}
        </CardContent></Card>
      )}
    </div>
  )
}

// ── Badges & XP Section ──
function BadgesSection() {
  const { data } = useQuery({ queryKey: ["admin", "badges"], queryFn: () => api.get<any>("/admin/badges") })
  const badges = data?.badges ?? []
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold flex items-center gap-2"><Award className="size-6" /> Badges & XP</h1>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {badges.map((b: any) => (
          <Card key={b.id}><CardContent className="p-3 text-center">
            <div className="text-2xl">{{ bronze: "🥉", silver: "🥈", gold: "🥇", platinum: "💎" }[b.tier] || "🏅"}</div>
            <div className="text-sm font-semibold mt-1">{b.name}</div>
            <div className="text-xs text-muted-foreground mt-0.5">{b.description}</div>
            <div className="text-xs mt-2"><span className="px-2 py-0.5 rounded-full bg-muted">{b.earnedCount} earned</span></div>
          </CardContent></Card>
        ))}
      </div>
    </div>
  )
}

// ── Notifications Section ──
function NotificationsSection() {
  const [title, setTitle] = useState("")
  const [message, setMessage] = useState("")
  const [audience, setAudience] = useState("all")
  const [confirmOpen, setConfirmOpen] = useState(false)
  const send = useMutation({
    mutationFn: () => api.post("/admin/notifications/broadcast", { title, message, audience }),
    onSuccess: (res: any) => { toast.success(`Sent to ${res.sent} users`); setTitle(""); setMessage(""); setConfirmOpen(false) },
    onError: (e: any) => toast.error(e.message),
  })
  return (
    <div className="space-y-4 max-w-lg">
      <h1 className="text-2xl font-bold flex items-center gap-2"><Bell className="size-6" /> Notifications</h1>
      <Card><CardContent className="p-4 space-y-3">
        <div><Label>Title</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Announcement title" /></div>
        <div><Label>Message</Label><Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Message body…" rows={3} /></div>
        <div><Label>Audience</Label>
          <select value={audience} onChange={(e) => setAudience(e.target.value)} className="w-full h-9 rounded-md border bg-background px-3 text-sm">
            <option value="all">All users</option><option value="paid">Paid subscribers</option><option value="free">Free users</option>
          </select></div>
        <Button onClick={() => setConfirmOpen(true)} disabled={!title.trim() || !message.trim()} className="w-full"><Bell className="size-4" /> Send Broadcast</Button>
      </CardContent></Card>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm"><DialogHeader><DialogTitle>Confirm broadcast?</DialogTitle><DialogDescription>This will send a notification to {audience === "all" ? "all users" : audience === "paid" ? "paid subscribers" : "free users"}. This action is audited.</DialogDescription></DialogHeader>
          <DialogFooter><Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button><Button onClick={() => send.mutate()} disabled={send.isPending}>Confirm Send</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Settings Section ──
function SettingsSection() {
  return (
    <div className="space-y-4 max-w-lg">
      <h1 className="text-2xl font-bold flex items-center gap-2"><Settings className="size-6" /> Settings</h1>
      <Card><CardContent className="p-4 space-y-3">
        <div className="text-sm font-medium">Platform Configuration</div>
        <Row label="Environment" value={process.env.NODE_ENV === "production" ? "PRODUCTION" : "SANDBOX"} />
        <Row label="Version" value="1.0.0" />
      </CardContent></Card>
      <Card><CardContent className="p-4 space-y-3">
        <div className="text-sm font-medium">Operational Settings</div>
        <p className="text-xs text-muted-foreground">Registration, room creation, and community creation policies are managed via environment variables in production. No secrets are exposed in this UI.</p>
      </CardContent></Card>
    </div>
  )
}

// ── Communities Section (reused) ──
function CommunitiesSection() {
  const qc = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ slug: "", name: "", description: "", examGoal: "", color: "#10b981" })
  const { data } = useQuery({ queryKey: ["communities"], queryFn: () => api.get<{ communities: any[] }>("/communities") })
  const create = useMutation({ mutationFn: () => api.post("/admin/communities", form), onSuccess: () => { qc.invalidateQueries({ queryKey: ["communities"] }); setShowCreate(false); toast.success("Community created"); setForm({ slug: "", name: "", description: "", examGoal: "", color: "#10b981" }) }, onError: (e: any) => toast.error(e.message) })
  const toggleFeatured = useMutation({ mutationFn: ({ slug, featured }: any) => api.patch(`/admin/communities/${slug}`, { isFeatured: featured }), onSuccess: () => qc.invalidateQueries({ queryKey: ["communities"] }) })
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center"><h1 className="text-2xl font-bold flex items-center gap-2"><Home className="size-6" /> Communities</h1><Button size="sm" onClick={() => setShowCreate(!showCreate)}><Plus className="size-4" /> New</Button></div>
      {showCreate && <Card><CardContent className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3"><Input placeholder="slug (e.g. rrb)" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} /><Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <Input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <div className="grid grid-cols-2 gap-3"><Input placeholder="Exam goal" value={form.examGoal} onChange={(e) => setForm({ ...form, examGoal: e.target.value })} /><div className="flex items-center gap-2"><Label>Color</Label><input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-9 w-12 rounded border" /></div></div>
        <Button onClick={() => create.mutate()} disabled={!form.slug || !form.name}>Create community</Button>
      </CardContent></Card>}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {data?.communities.map((c: any) => <Card key={c.id}><CardContent className="p-3 flex items-center gap-3">
          <span className="size-9 rounded-lg flex items-center justify-center text-white font-bold text-xs" style={{ background: c.color }}>{c.name.slice(0, 2).toUpperCase()}</span>
          <div className="flex-1 min-w-0"><div className="font-medium truncate">{c.name}</div><div className="text-xs text-muted-foreground">{c.memberCount} members</div></div>
          <Button size="sm" variant="outline" onClick={() => toggleFeatured.mutate({ slug: c.slug, featured: !c.isFeatured })}>{c.isFeatured ? "★" : "☆"}</Button>
        </CardContent></Card>)}
      </div>
    </div>
  )
}

// ── Rooms Section (reused) ──
function RoomsSection() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ["admin", "rooms"], queryFn: () => api.get<{ rooms: any[] }>("/rooms", { limit: 50 }) })
  const close = useMutation({ mutationFn: (id: string) => api.patch(`/admin/rooms/${id}`, { action: "close" }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "rooms"] }); toast.success("Room closed") } })
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold flex items-center gap-2"><Video className="size-6" /> Rooms</h1>
      <div className="grid sm:grid-cols-2 gap-3">
        {data?.rooms.map((r: any) => <Card key={r.id}><CardContent className="p-3">
          <div className="flex items-center justify-between mb-1">{r.isLive ? <LiveDot /> : <span className="text-xs text-muted-foreground">Idle</span>}<span className="text-xs text-muted-foreground">{r.participantCount} studying</span></div>
          <div className="font-medium truncate">{r.name}</div>
          <div className="text-xs text-muted-foreground truncate">Host: {r.owner?.displayName ?? "—"}{r.isDefaultRoom && <span className="ml-1 text-brand-emerald font-medium"> · DEFAULT</span>}</div>
          <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => close.mutate(r.id)} disabled={!r.isLive}>Close room</Button>
        </CardContent></Card>)}
      </div>
    </div>
  )
}

// ── Reports Section (reused) ──
function ReportsSection() {
  const qc = useQueryClient()
  const [status, setStatus] = useState("open")
  const { data } = useQuery({ queryKey: ["reports", status], queryFn: () => api.get<{ reports: any[] }>("/reports", { status }) })
  const resolve = useMutation({ mutationFn: ({ id, s, res }: any) => api.patch(`/admin/reports/${id}`, { status: s, resolution: res }), onSuccess: () => { qc.invalidateQueries({ queryKey: ["reports"] }); toast.success("Report resolved") } })
  const reports = data?.reports ?? []
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold flex items-center gap-2"><Flag className="size-6" /> Reports</h1>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm"><option value="open">Open</option><option value="reviewing">Reviewing</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option><option value="all">All</option></select></div>
      {reports.length === 0 ? <Card><CardContent className="py-10 text-center text-muted-foreground"><Flag className="size-8 mx-auto mb-2 opacity-30" />No reports in this view. 🎉</CardContent></Card> :
        <div className="space-y-2">{reports.map((r: any) => <Card key={r.id}><CardContent className="p-3">
          <div className="flex items-start gap-3"><span className="size-9 rounded-lg bg-red-50 dark:bg-red-950/40 flex items-center justify-center shrink-0"><AlertTriangle className="size-4 text-red-600" /></span>
          <div className="flex-1 min-w-0"><div className="flex items-center gap-2 flex-wrap"><span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-muted">{r.reason}</span><span className="text-xs text-muted-foreground">{timeAgo(r.createdAt)}</span></div>
            {r.detail && <p className="text-sm mt-1">{r.detail}</p>}
            {r.reported && <div className="text-xs text-muted-foreground mt-1">Reported: {r.reported.profile?.displayName ?? r.reported.email}</div>}</div>
          <div className="flex flex-col gap-1 shrink-0"><Button size="sm" variant="outline" onClick={() => resolve.mutate({ id: r.id, s: "resolved", res: "warning" })}>Warn</Button><Button size="sm" variant="outline" className="text-destructive" onClick={() => resolve.mutate({ id: r.id, s: "resolved", res: "ban" })}>Ban</Button><Button size="sm" variant="ghost" onClick={() => resolve.mutate({ id: r.id, s: "dismissed", res: "no_action" })}>Dismiss</Button></div>
        </div></CardContent></Card>)}</div>}
    </div>
  )
}

// ── Analytics Section ──
function AnalyticsSection() {
  const { data, isLoading } = useQuery({ queryKey: ["admin", "stats"], queryFn: () => api.get<any>("/admin/stats") })
  if (isLoading) return <div className="text-center py-10">Loading…</div>
  const s = data ?? {}
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold flex items-center gap-2"><BarChart3 className="size-6" /> Study Analytics</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Total Minutes" value={formatMinutes(s.study?.totalMinutes ?? 0)} sub="" icon={<TrendingUp className="size-4" />} />
        <MetricCard label="Sessions" value={s.study?.totalSessions ?? 0} sub="" icon={<Activity className="size-4" />} />
        <MetricCard label="Avg Session" value={`${s.study?.avgSessionMin ?? 0}m`} sub="" icon={<Clock className="size-4" />} />
        <MetricCard label="Active Rooms" value={s.study?.activeRooms ?? 0} sub="" icon={<Video className="size-4" />} />
      </div>
      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Community Activity</CardTitle></CardHeader>
        <CardContent><div className="space-y-1">
          {(s.communities?.mostActive ?? []).map((c: any) => <div key={c.id} className="flex items-center justify-between p-2 rounded-lg hover:bg-accent"><span className="flex items-center gap-2"><span className="size-4 rounded" style={{ background: c.color }} /><span className="text-sm">{c.name}</span></span><span className="text-xs text-muted-foreground">{c.memberCount} members</span></div>)}
          {(!s.communities?.mostActive || s.communities.mostActive.length === 0) && <p className="text-muted-foreground text-sm text-center py-4">No data available.</p>}
        </div></CardContent></Card>
      <p className="text-xs text-muted-foreground">Sandbox: analytics data comes from the local SQLite database. Production uses PostgreSQL with PostHog for funnel analytics.</p>
    </div>
  )
}

// ── Helper: CSV export download ──
async function downloadExport(type: string) {
  try {
    const token = typeof window !== "undefined" ? localStorage.getItem("sankalp_token") : null
    const res = await fetch(`/api/admin/export/${type}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
    if (!res.ok) throw new Error("Export failed")
    const blob = await res.blob(); const url = URL.createObjectURL(blob)
    const a = document.createElement("a"); a.href = url; a.download = `sankalp-${type}-${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url)
    toast.success("CSV downloaded")
  } catch (e: any) { toast.error(e.message || "Export failed") }
}

