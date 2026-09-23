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
import { Save, LogOut, Palette, Globe, Target, Crown, Shield, Bell } from "lucide-react"
import { toast } from "sonner"
import { Switch } from "@/components/ui/switch"

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

  const save = useMutation({
    mutationFn: () => api.patch("/profile", {
      displayName, username, bio: bio || null, avatarUrl: avatarUrl || null,
      examGoal, targetYear: targetYear === "" ? null : Number(targetYear),
      studyHoursGoal: Math.round(studyHoursGoal * 60), timezone,
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
        </CardContent>
      </Card>

      <NotificationPrefsCard />

      <div className="flex justify-between items-center">
        <Button variant="destructive" onClick={() => { logout(); navigate("/") }}><LogOut className="size-4" /> Log out</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}><Save className="size-4" /> Save changes</Button>
      </div>
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
