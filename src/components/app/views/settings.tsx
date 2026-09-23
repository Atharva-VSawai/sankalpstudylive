"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api, ApiError } from "@/lib/api-client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useAuth } from "@/lib/auth-context"
import { useRouter } from "@/lib/router"
import { EXAM_META } from "@/components/app/brand"
import { Save, LogOut, Palette, Globe, Target, Crown, Shield, Bell, AlertTriangle, Download, FileJson, Clock } from "lucide-react"
import { toast } from "sonner"
import { Switch } from "@/components/ui/switch"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { setToken } from "@/lib/api-client"

const TIMEZONES = [
  "Asia/Kolkata", "Asia/Calcutta", "Asia/Dubai", "Asia/Singapore", "Asia/Tokyo",
  "Europe/London", "Europe/Berlin", "America/New_York", "America/Los_Angeles", "UTC",
]

export function SettingsView() {
  const { me, refresh, logout } = useAuth()
  const { navigate } = useRouter()
  const qc = useQueryClient()

  const { data: profile } = useQuery({ queryKey: ["profile", "me"], queryFn: () => api.get<any>("/profile") })
  const { data: sub } = useQuery({ queryKey: ["subscription"], queryFn: () => api.get<{ subscription: any }>("/subscriptions") })

  const p = profile?.profile ?? me?.profile
  const [displayName, setDisplayName] = useState(p?.displayName ?? "")
  const [username, setUsername] = useState(p?.username ?? "")
  const [bio, setBio] = useState(p?.bio ?? "")
  const [avatarUrl, setAvatarUrl] = useState(p?.avatarUrl ?? "")
  const [examGoal, setExamGoal] = useState(p?.examGoal ?? "General Study")
  const [targetYear, setTargetYear] = useState<number | "">(p?.targetYear ?? "")
  const [studyHoursGoal, setStudyHoursGoal] = useState(Math.round((p?.studyHoursGoal ?? 360) / 60))
  const [timezone, setTimezone] = useState(me?.timezone ?? "Asia/Kolkata")
  const [sessionTimeout, setSessionTimeout] = useState<number>(p?.sessionTimeoutMin ?? 60)

  const save = useMutation({
    mutationFn: () => api.patch("/profile", {
      displayName, username, bio: bio || null, avatarUrl: avatarUrl || null,
      examGoal, targetYear: targetYear === "" ? null : Number(targetYear),
      studyHoursGoal: Math.round(studyHoursGoal * 60), timezone,
      sessionTimeoutMin: sessionTimeout,
    }),
    onSuccess: () => { refresh(); qc.invalidateQueries({ queryKey: ["profile"] }); toast.success("Settings saved") },
    onError: (e: ApiError) => toast.error(e.message),
  })

  if (!p) return <div className="p-8 text-center text-muted-foreground">Loading…</div>

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 pb-24 md:pb-8 space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>

      {/* Profile */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Palette className="size-4" /> Profile</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Display name</Label><Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Username</Label><div className="flex items-center relative"><span className="absolute left-3 text-muted-foreground">@</span><Input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))} className="pl-7" /></div></div>
          </div>
          <div className="space-y-1.5"><Label>Bio</Label><Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={2} maxLength={500} placeholder="A line about your prep" /></div>
          <div className="space-y-1.5"><Label>Avatar URL</Label><Input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="https://…" /></div>
        </CardContent>
      </Card>

      {/* Study goals */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Target className="size-4" /> Study goals</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Exam goal</Label>
              <select value={examGoal} onChange={(e) => setExamGoal(e.target.value)} className="w-full h-9 rounded-md border bg-background px-3 text-sm">
                {Object.keys(EXAM_META).map((e) => <option key={e} value={e}>{e} — {EXAM_META[e].tagline}</option>)}
              </select>
            </div>
            <div className="space-y-1.5"><Label>Target year</Label><Input type="number" value={targetYear} onChange={(e) => setTargetYear(e.target.value === "" ? "" : Number(e.target.value))} min={2024} max={2035} /></div>
          </div>
          <div className="space-y-1.5">
            <Label>Daily goal: {studyHoursGoal} hours</Label>
            <input type="range" min={0.25} max={12} step={0.25} value={studyHoursGoal} onChange={(e) => setStudyHoursGoal(Number(e.target.value))} className="w-full accent-[var(--brand-emerald)]" />
          </div>
        </CardContent>
      </Card>

      {/* Account */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Globe className="size-4" /> Account</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>Email</Label><Input value={me?.email ?? ""} disabled /></div>
            <div className="space-y-1.5">
              <Label>Timezone</Label>
              <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="w-full h-9 rounded-md border bg-background px-3 text-sm">
                {TIMEZONES.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
              </select>
            </div>
          </div>
          <div className="rounded-lg border p-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium flex items-center gap-1.5"><Crown className="size-4 text-accent-foreground" /> Plan</div>
              <div className="text-xs text-muted-foreground capitalize">{sub?.subscription?.plan ?? "free"}{sub?.subscription?.status === "active" && sub?.subscription?.plan !== "free" ? " · active" : ""}</div>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate("/pricing")}>Manage</Button>
          </div>
          <div className="rounded-lg border p-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-medium flex items-center gap-1.5"><Shield className="size-4" /> Role</div>
              <div className="text-xs text-muted-foreground capitalize">{me?.role}</div>
            </div>
          </div>
          <div className="rounded-lg border p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-medium flex items-center gap-1.5"><Clock className="size-4" /> Auto-logout</div>
                <div className="text-xs text-muted-foreground">Log out after inactivity</div>
              </div>
              <select
                value={sessionTimeout}
                onChange={(e) => setSessionTimeout(Number(e.target.value))}
                className="h-8 rounded-md border bg-background px-2 text-sm"
              >
                <option value={0}>Never</option>
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={60}>1 hour</option>
                <option value={120}>2 hours</option>
                <option value={240}>4 hours</option>
              </select>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {sessionTimeout === 0
                ? "You'll stay signed in until you log out manually."
                : `You'll be logged out after ${sessionTimeout} min of inactivity (with a 60s warning).`}
            </p>
          </div>
        </CardContent>
      </Card>

      <NotificationPrefsCard />

      <div className="flex justify-between items-center">
        <Button variant="destructive" onClick={() => { logout(); navigate("/") }}><LogOut className="size-4" /> Log out</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}><Save className="size-4" /> Save changes</Button>
      </div>

      <DataExportCard />

      <DangerZoneCard />
    </div>
  )
}

const NOTIF_TYPES: { id: string; label: string; desc: string }[] = [
  { id: "friend_request", label: "Friend requests", desc: "When someone sends you a friend request" },
  { id: "friend_accept", label: "Friend accepts", desc: "When your friend request is accepted" },
  { id: "room_invite", label: "Room invites", desc: "When a friend invites you to a study room" },
  { id: "badge_earned", label: "Badge earned", desc: "When you unlock a new badge" },
  { id: "goal_completed", label: "Daily goal", desc: "When you complete your daily study goal" },
  { id: "streak_milestone", label: "Streak milestones", desc: "Weekly streak progress updates" },
  { id: "report_update", label: "Report updates", desc: "When a report you filed is resolved (moderators only)" },
  { id: "system", label: "System", desc: "Important product announcements" },
]

function NotificationPrefsCard() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ["notif-prefs"],
    queryFn: () => api.get<{ preferences: Record<string, boolean> }>("/notifications/preferences"),
  })
  const prefs = data?.preferences ?? {}

  const toggle = useMutation({
    mutationFn: ({ type, enabled }: { type: string; enabled: boolean }) =>
      api.put("/notifications/preferences", { type, enabled }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notif-prefs"] })
      qc.invalidateQueries({ queryKey: ["notifications"] })
    },
  })

  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Bell className="size-4" /> Notification preferences</CardTitle></CardHeader>
      <CardContent className="space-y-1">
        {isLoading ? (
          <div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>
        ) : (
          NOTIF_TYPES.map((t) => (
            <div key={t.id} className="flex items-center justify-between py-2 border-b last:border-0">
              <div className="min-w-0 pr-3">
                <div className="text-sm font-medium">{t.label}</div>
                <div className="text-xs text-muted-foreground">{t.desc}</div>
              </div>
              <Switch
                checked={prefs[t.id] !== false}
                onCheckedChange={(v) => toggle.mutate({ type: t.id, enabled: v })}
                disabled={toggle.isPending}
              />
            </div>
          ))
        )}
        <p className="text-[11px] text-muted-foreground pt-2">Changes apply to future notifications. Existing ones are kept.</p>
      </CardContent>
    </Card>
  )
}

function DangerZoneCard() {
  const { me, logout } = useAuth()
  const { navigate } = useRouter()
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState("")
  const [confirmText, setConfirmText] = useState("")
  const [busy, setBusy] = useState(false)
  const hasPassword = Boolean(me?.email) // all sandbox accounts have passwords; OAuth-only users skip

  const del = useMutation({
    mutationFn: async () => {
      setBusy(true)
      try {
        await api.post("/auth/delete", {
          password: password || undefined,
          confirm: confirmText === "DELETE" ? "DELETE" : undefined,
        })
        setToken(null)
        logout()
        toast.success("Account deleted. Sorry to see you go.")
        navigate("/", { replace: true })
      } catch (e: any) {
        toast.error(e.message || "Failed to delete account")
      } finally {
        setBusy(false)
      }
    },
  })

  const canSubmit = confirmText === "DELETE" && (!hasPassword || password.length > 0)

  return (
    <>
      <Card className="border-destructive/30">
        <CardContent className="p-5">
          <div className="flex items-start gap-3">
            <span className="size-10 rounded-xl bg-destructive/10 flex items-center justify-center shrink-0">
              <AlertTriangle className="size-5 text-destructive" />
            </span>
            <div className="flex-1">
              <h3 className="font-semibold text-sm text-destructive">Danger zone</h3>
              <p className="text-xs text-muted-foreground mt-0.5 mb-3">
                Permanently delete your account and all study data. This cannot be undone. Your rooms will be closed; chat history visible to others is preserved.
              </p>
              <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
                Delete my account
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive"><AlertTriangle className="size-5" /> Delete account?</DialogTitle>
            <DialogDescription>
              This permanently removes your profile, study sessions, streaks, badges, friendships, notifications and subscription. <strong>This action cannot be undone.</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {hasPassword && (
              <div className="space-y-1.5">
                <Label>Password</Label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password to confirm"
                  autoFocus
                />
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Type <code className="bg-muted px-1 rounded">DELETE</code> to confirm</Label>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="DELETE"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button variant="destructive" onClick={() => del.mutate()} disabled={!canSubmit || busy}>
              {busy ? "Deleting…" : "Permanently delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function DataExportCard() {
  const downloadJson = async () => {
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("sankalp_token") : null
      const res = await fetch("/api/profile/export", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error("Export failed")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `sankalp-profile-${new Date().toISOString().slice(0, 10)}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success("Profile data downloaded")
    } catch (e: any) {
      toast.error(e.message || "Export failed")
    }
  }

  const downloadCsv = async () => {
    try {
      const token = typeof window !== "undefined" ? localStorage.getItem("sankalp_token") : null
      const res = await fetch("/api/study/export", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      if (!res.ok) throw new Error("Export failed")
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `sankalp-study-history-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success("Study history downloaded")
    } catch (e: any) {
      toast.error(e.message || "Export failed")
    }
  }

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <span className="size-10 rounded-xl bg-brand-emerald/10 flex items-center justify-center shrink-0">
            <Download className="size-5 text-brand-emerald" />
          </span>
          <div className="flex-1">
            <h3 className="font-semibold text-sm">Data export</h3>
            <p className="text-xs text-muted-foreground mt-0.5 mb-3">
              Download your data. Full profile (JSON) includes everything: sessions, goals, badges, friendships, payments. Study history (CSV) is a spreadsheet of your sessions.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={downloadJson}>
                <FileJson className="size-4" /> Full profile (JSON)
              </Button>
              <Button variant="outline" size="sm" onClick={downloadCsv}>
                <Download className="size-4" /> Study history (CSV)
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
