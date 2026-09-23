"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api, ApiError } from "@/lib/api-client"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Avatar, formatMinutes, EXAM_META } from "@/components/app/brand"
import { useAuth } from "@/lib/auth-context"
import { UserPlus, Ban, Flag, Check, MessageSquare, AlertTriangle, Shield } from "lucide-react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"

export function PublicProfileView({ username }: { username: string }) {
  const { me } = useAuth()
  const qc = useQueryClient()
  const [reportOpen, setReportOpen] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ["profile", username],
    queryFn: () => api.get<any>(`/profile/${username}`),
  })

  const addFriend = useMutation({
    mutationFn: () => api.post("/friends", { username }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["friends"] }); toast.success("Friend request sent") },
    onError: (e: ApiError) => toast.error(e.message),
  })
  const block = useMutation({
    mutationFn: () => api.post("/blocks", { username }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["friends"] }); toast.success("User blocked") },
  })

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading…</div>
  if (!data) return <div className="p-8 text-center text-muted-foreground">User not found.</div>

  const p = data.profile
  const examMeta = p.examGoal ? EXAM_META[p.examGoal] : null
  const isMe = data.isMe
  const isFriend = data.isFriend

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 pb-24 md:pb-8 space-y-6">
      <Card className="overflow-hidden">
        {examMeta && <div className="h-20" style={{ background: `linear-gradient(135deg, ${examMeta.color}, ${examMeta.color}aa)` }} />}
        <CardContent className={`p-6 ${examMeta ? "-mt-10" : ""}`}>
          <div className="flex flex-col sm:flex-row gap-4 items-start">
            <Avatar name={p.displayName} src={p.avatarUrl} size={80} className="ring-4 ring-background" />
            <div className="flex-1">
              <h1 className="text-2xl font-bold">{p.displayName}</h1>
              <div className="text-sm text-muted-foreground">@{p.username}</div>
              {p.bio && <p className="mt-2 text-sm">{p.bio}</p>}
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                {p.examGoal && <span className="px-2 py-0.5 rounded-full" style={{ background: `${examMeta?.color}22`, color: examMeta?.color }}>{p.examGoal}</span>}
                {p.targetYear && <span className="px-2 py-0.5 rounded-full bg-muted">Target {p.targetYear}</span>}
                <span className="px-2 py-0.5 rounded-full bg-muted">Lvl {p.level}</span>
                <span className="px-2 py-0.5 rounded-full bg-muted inline-flex items-center gap-1"><Check className="size-3" /> {p.sessionCount} sessions</span>
              </div>
            </div>
            {!isMe && (
              <div className="flex flex-col gap-2 shrink-0">
                {isFriend ? (
                  <Button variant="secondary" disabled><Check className="size-4" /> Friends</Button>
                ) : data.friendStatus === "pending" ? (
                  <Button variant="outline" disabled>Request pending</Button>
                ) : (
                  <Button onClick={() => addFriend.mutate()} disabled={addFriend.isPending}><UserPlus className="size-4" /> Add buddy</Button>
                )}
                <Button variant="outline" size="sm" onClick={() => block.mutate()} disabled={data.isBlocked}><Ban className="size-4" /> {data.isBlocked ? "Blocked" : "Block"}</Button>
                <Button variant="outline" size="sm" onClick={() => setReportOpen(true)} className="text-destructive"><Flag className="size-4" /> Report</Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Streak" value={`${p.streak?.current ?? 0}d`} sub={`Longest ${p.streak?.longest ?? 0}d`} />
        <Stat label="Studied" value={formatMinutes(p.totalMinutes)} sub="All time" />
        <Stat label="XP" value={(p.totalXp ?? 0).toLocaleString()} sub={`Level ${p.level}`} />
        <Stat label="Sessions" value={`${p.sessionCount}`} sub="completed" />
      </div>

      {(p.badges ?? []).length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold mb-3">Badges</h3>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
              {(p.badges ?? []).map((b: any) => (
                <div key={b.slug} className="rounded-lg border p-2 text-center bg-accent/30" title={b.description}>
                  <div className="text-xl">{tierEmoji(b.tier)}</div>
                  <div className="text-[10px] font-medium mt-0.5 leading-tight">{b.name}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <ReportDialog open={reportOpen} onOpenChange={setReportOpen} reportedUserId={p.userId} username={username} />
    </div>
  )
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </CardContent></Card>
  )
}
function tierEmoji(t: string) { return { bronze: "🥉", silver: "🥈", gold: "🥇", platinum: "💎" }[t] || "🏅" }

function ReportDialog({ open, onOpenChange, reportedUserId, username }: { open: boolean; onOpenChange: (v: boolean) => void; reportedUserId: string; username: string }) {
  const qc = useQueryClient()
  const [reason, setReason] = useState("spam")
  const [detail, setDetail] = useState("")
  const submit = useMutation({
    mutationFn: () => api.post("/reports", { reportedUserId, reason, detail }),
    onSuccess: () => { onOpenChange(false); qc.invalidateQueries({ queryKey: ["reports"] }); toast.success("Report submitted. Our moderators will review it."); setDetail("") },
    onError: () => toast.error("Failed to submit report"),
  })
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><AlertTriangle className="size-5 text-destructive" /> Report @{username}</DialogTitle>
          <DialogDescription>Help us keep Sankalp safe. False reports may affect your account.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Reason</Label>
            <select value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 w-full h-9 rounded-md border bg-background px-3 text-sm">
              <option value="spam">Spam</option>
              <option value="harassment">Harassment / bullying</option>
              <option value="cheating">Cheating / fake study</option>
              <option value="nsfw">Inappropriate content</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <Label>Details (optional)</Label>
            <Textarea value={detail} onChange={(e) => setDetail(e.target.value)} placeholder="What happened?" maxLength={1000} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button variant="destructive" onClick={() => submit.mutate()} disabled={submit.isPending}>Submit report</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
