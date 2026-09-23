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
  UserCog, RefreshCw, AlertTriangle, Crown, Activity, TrendingUp,
} from "lucide-react"
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell, LineChart, Line } from "recharts"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Label } from "@/components/ui/label"

export function AdminView({ section }: { section: "dashboard" | "users" | "communities" | "rooms" | "reports" | "analytics" }) {
  const { me } = useAuth()
  const { navigate } = useRouter()
  if (me?.role !== "admin" && me?.role !== "moderator") {
    return <div className="p-10 text-center text-muted-foreground">Admin access required.</div>
  }

  const nav: { id: typeof section; label: string; icon: React.ReactNode }[] = [
    { id: "dashboard", label: "Dashboard", icon: <LayoutDashboard className="size-4" /> },
    { id: "users", label: "Users", icon: <Users className="size-4" /> },
    { id: "communities", label: "Communities", icon: <Home className="size-4" /> },
    { id: "rooms", label: "Rooms", icon: <Video className="size-4" /> },
    { id: "reports", label: "Reports", icon: <Flag className="size-4" /> },
    { id: "analytics", label: "Analytics", icon: <BarChart3 className="size-4" /> },
  ]

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 pb-24 md:pb-8">
      <div className="flex items-center gap-2 mb-1">
        <Shield className="size-6 text-brand-emerald" />
        <h1 className="text-2xl font-bold">Admin</h1>
      </div>
      <p className="text-muted-foreground text-sm mb-4">Moderation & operations. Your actions are audit-logged.</p>

      <div className="flex gap-1 overflow-x-auto pb-2 mb-6 scroll-thin">
        {nav.map((n) => (
          <button key={n.id} onClick={() => navigate(`/admin/${n.id === "dashboard" ? "" : n.id}`)} className={cn("inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap", section === n.id ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-accent")}>
            {n.icon} {n.label}
          </button>
        ))}
      </div>

      {section === "dashboard" && <DashboardSection />}
      {section === "users" && <UsersSection />}
      {section === "communities" && <CommunitiesSection />}
      {section === "rooms" && <RoomsSection />}
      {section === "reports" && <ReportsSection />}
      {section === "analytics" && <AnalyticsSection />}
    </div>
  )
}

function DashboardSection() {
  const { data } = useQuery({ queryKey: ["admin", "stats"], queryFn: () => api.get<any>("/admin/stats") })
  const s = data ?? {}
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Users" value={s.users} icon={<Users className="size-4" />} />
        <Stat label="Active (7d)" value={s.activeUsers} icon={<Activity className="size-4" />} />
        <Stat label="Communities" value={s.communities} icon={<Home className="size-4" />} />
        <Stat label="Live rooms" value={s.liveRooms} icon={<Video className="size-4" />} />
        <Stat label="Study sessions" value={s.sessions} icon={<TrendingUp className="size-4" />} />
        <Stat label="Total minutes" value={formatMinutes(s.totalMinutes ?? 0)} icon={<TrendingUp className="size-4" />} />
        <Stat label="Open reports" value={s.openReports} icon={<Flag className="size-4 text-amber-500" />} />
        <Stat label="Paid payments" value={s.payments} icon={<Crown className="size-4 text-amber-500" />} />
      </div>
      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">
            Tip: use the Users tab to change roles or suspend accounts, the Rooms tab to force-close problematic rooms, and Reports to resolve flags. All actions are recorded in the audit log.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function UsersSection() {
  const qc = useQueryClient()
  const [q, setQ] = useState("")
  const [status, setStatus] = useState("active")
  const { data } = useQuery({
    queryKey: ["admin", "users", q, status],
    queryFn: () => api.get<any>("/admin/users", { q: q || undefined, status, limit: 50 }),
  })
  const update = useMutation({
    mutationFn: ({ id, ...patch }: { id: string; role?: string; status?: string }) => api.patch(`/admin/users/${id}`, patch),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "users"] }); toast.success("User updated") },
  })
  const users = data?.users ?? []
  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search email…" className="w-56" />
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm">
          <option value="active">Active</option><option value="suspended">Suspended</option><option value="banned">Banned</option>
        </select>
      </div>
      <Card><CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left">
              <tr>{["User", "Goal", "Stats", "Role", "Status", "Actions"].map((h) => <th key={h} className="p-3 font-medium">{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y">
              {users.map((u: any) => (
                <tr key={u.id} className="hover:bg-accent/40">
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <Avatar name={u.displayName ?? u.email} size={28} />
                      <div className="min-w-0"><div className="font-medium truncate">{u.displayName ?? "—"}</div><div className="text-xs text-muted-foreground truncate">{u.email}</div></div>
                    </div>
                  </td>
                  <td className="p-3 text-xs">{u.examGoal ?? "—"}</td>
                  <td className="p-3 text-xs text-muted-foreground">{formatMinutes(u.totalMinutes)} · Lvl {u.level}</td>
                  <td className="p-3">
                    <select value={u.role} onChange={(e) => update.mutate({ id: u.id, role: e.target.value })} className="h-8 rounded border bg-background px-2 text-xs">
                      <option value="user">user</option><option value="moderator">moderator</option><option value="admin">admin</option>
                    </select>
                  </td>
                  <td className="p-3">
                    <span className={cn("text-xs px-2 py-0.5 rounded-full", u.status === "active" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400" : "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400")}>{u.status}</span>
                  </td>
                  <td className="p-3">
                    {u.status === "active" ? (
                      <Button size="sm" variant="outline" onClick={() => update.mutate({ id: u.id, status: "suspended" })}><Ban className="size-3.5" /> Suspend</Button>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => update.mutate({ id: u.id, status: "active" })}><Check className="size-3.5" /> Reactivate</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent></Card>
    </div>
  )
}

function CommunitiesSection() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ["communities"], queryFn: () => api.get<{ communities: any[] }>("/communities") })
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState({ slug: "", name: "", description: "", examGoal: "", color: "#10b981" })
  const create = useMutation({
    mutationFn: () => api.post("/admin/communities", form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["communities"] }); setShowCreate(false); toast.success("Community created"); setForm({ slug: "", name: "", description: "", examGoal: "", color: "#10b981" }) },
    onError: (e: any) => toast.error(e.message),
  })
  const toggleFeatured = useMutation({
    mutationFn: ({ slug, featured }: { slug: string; featured: boolean }) => api.patch(`/admin/communities/${slug}`, { isFeatured: featured }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["communities"] }),
  })
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="font-semibold">Communities ({data?.communities.length ?? 0})</h2>
        <Button size="sm" onClick={() => setShowCreate(!showCreate)}><Plus className="size-4" /> New</Button>
      </div>
      {showCreate && (
        <Card><CardContent className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="slug (e.g. rrb)" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} />
            <Input placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <Input placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input placeholder="Exam goal" value={form.examGoal} onChange={(e) => setForm({ ...form, examGoal: e.target.value })} />
            <div className="flex items-center gap-2"><Label>Color</Label><input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className="h-9 w-12 rounded border" /></div>
          </div>
          <Button onClick={() => create.mutate()} disabled={!form.slug || !form.name}>Create community</Button>
        </CardContent></Card>
      )}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {data?.communities.map((c: any) => (
          <Card key={c.id}><CardContent className="p-3 flex items-center gap-3">
            <span className="size-9 rounded-lg flex items-center justify-center text-white font-bold text-xs" style={{ background: c.color }}>{c.name.slice(0, 2).toUpperCase()}</span>
            <div className="flex-1 min-w-0"><div className="font-medium truncate">{c.name}</div><div className="text-xs text-muted-foreground">{c.memberCount} members</div></div>
            <Button size="sm" variant="outline" onClick={() => toggleFeatured.mutate({ slug: c.slug, featured: !c.isFeatured })}>{c.isFeatured ? "★" : "☆"}</Button>
          </CardContent></Card>
        ))}
      </div>
    </div>
  )
}

function RoomsSection() {
  const qc = useQueryClient()
  const { data } = useQuery({ queryKey: ["admin", "rooms"], queryFn: () => api.get<{ rooms: any[] }>("/rooms", { limit: 50 }) })
  const close = useMutation({
    mutationFn: (id: string) => api.patch(`/admin/rooms/${id}`, { action: "close" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin", "rooms"] }); toast.success("Room closed") },
  })
  return (
    <div className="space-y-4">
      <h2 className="font-semibold">All rooms ({data?.rooms.length ?? 0})</h2>
      <div className="grid sm:grid-cols-2 gap-3">
        {data?.rooms.map((r: any) => (
          <Card key={r.id}><CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              {r.isLive ? <LiveDot /> : <span className="text-xs text-muted-foreground">Idle</span>}
              <span className="text-xs text-muted-foreground">{r.participantCount}/{r.maxParticipants}</span>
            </div>
            <div className="font-medium truncate">{r.name}</div>
            <div className="text-xs text-muted-foreground truncate">Host: {r.owner?.displayName ?? "—"}</div>
            <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => close.mutate(r.id)} disabled={!r.isLive && !r.isListed}>Close room</Button>
          </CardContent></Card>
        ))}
        {(data?.rooms ?? []).length === 0 && <p className="text-sm text-muted-foreground col-span-full py-8 text-center">No rooms.</p>}
      </div>
    </div>
  )
}

function ReportsSection() {
  const qc = useQueryClient()
  const [status, setStatus] = useState("open")
  const { data } = useQuery({ queryKey: ["reports", status], queryFn: () => api.get<{ reports: any[] }>("/reports", { status }) })
  const resolve = useMutation({
    mutationFn: ({ id, status, resolution }: { id: string; status: string; resolution: string }) => api.patch(`/admin/reports/${id}`, { status, resolution }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["reports"] }); toast.success("Report resolved") },
  })
  const reports = data?.reports ?? []
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold flex items-center gap-2"><Flag className="size-4" /> Reports</h2>
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="h-9 rounded-md border bg-background px-3 text-sm">
          <option value="open">Open</option><option value="reviewing">Reviewing</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option><option value="all">All</option>
        </select>
      </div>
      {reports.length === 0 ? <Card><CardContent className="py-10 text-center text-muted-foreground">No reports in this view. 🎉</CardContent></Card> : (
        <div className="space-y-2">
          {reports.map((r: any) => (
            <Card key={r.id}><CardContent className="p-3">
              <div className="flex items-start gap-3">
                <span className="size-9 rounded-lg bg-red-50 text-red-600 dark:bg-red-950/40 flex items-center justify-center shrink-0"><AlertTriangle className="size-4" /></span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-muted">{r.reason}</span>
                    <span className="text-xs text-muted-foreground">{timeAgo(r.createdAt)}</span>
                    <span className="text-xs text-muted-foreground">by @{r.reporter?.profile?.username ?? "—"}</span>
                  </div>
                  {r.detail && <p className="text-sm mt-1">{r.detail}</p>}
                  {r.reported && <div className="text-xs text-muted-foreground mt-1">Reported: {r.reported.profile?.displayName ?? r.reported.email}</div>}
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => resolve.mutate({ id: r.id, status: "resolved", resolution: "warning" })}>Warn</Button>
                  <Button size="sm" variant="outline" className="text-destructive" onClick={() => resolve.mutate({ id: r.id, status: "resolved", resolution: "ban" })}>Ban</Button>
                  <Button size="sm" variant="ghost" onClick={() => resolve.mutate({ id: r.id, status: "dismissed", resolution: "no_action" })}>Dismiss</Button>
                </div>
              </div>
            </CardContent></Card>
          ))}
        </div>
      )}
    </div>
  )
}

function AnalyticsSection() {
  const { data: stats } = useQuery({ queryKey: ["admin", "stats"], queryFn: () => api.get<any>("/admin/stats") })
  // Demo: sessions over time (we only have a handful; show as the seed)
  const chart = [
    { label: "Users", value: stats?.users ?? 0 },
    { label: "Active 7d", value: stats?.activeUsers ?? 0 },
    { label: "Communities", value: stats?.communities ?? 0 },
    { label: "Live rooms", value: stats?.liveRooms ?? 0 },
    { label: "Open reports", value: stats?.openReports ?? 0 },
  ]
  return (
    <div className="space-y-4">
      <h2 className="font-semibold">Platform analytics</h2>
      <Card><CardContent className="p-4">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart}>
              <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} />
              <YAxis hide />
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid hsl(var(--border))", fontSize: 12 }} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} maxBarSize={48}>
                {chart.map((_, i) => <Cell key={i} fill="var(--brand-emerald)" />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent></Card>
      <p className="text-xs text-muted-foreground">Sandbox analytics surface database counts. In production this is backed by PostHog for funnels, retention and activation.</p>
    </div>
  )
}

function Stat({ label, value, icon }: { label: string; value: any; icon: React.ReactNode }) {
  return (
    <Card><CardContent className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
      <div className="text-2xl font-bold mt-1">{value ?? "—"}</div>
    </CardContent></Card>
  )
}
