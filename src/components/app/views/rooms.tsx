"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, LiveDot, EXAM_META } from "@/components/app/brand"
import { Link, useRouter } from "@/lib/router"
import { Search, Users, Plus, X, Lock, MicOff, CameraOff, Focus } from "lucide-react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import { useAuth } from "@/lib/auth-context"

export function RoomsView() {
  const { route, navigate } = useRouter()
  const { me } = useAuth()
  const qc = useQueryClient()
  const [q, setQ] = useState("")
  const [liveOnly, setLiveOnly] = useState(false)
  const [showCreate, setShowCreate] = useState(route.query.get("new") === "1")

  const { data } = useQuery({
    queryKey: ["rooms", q, liveOnly],
    queryFn: () => api.get<{ rooms: any[] }>("/rooms", { q: q || undefined, live: liveOnly ? "true" : undefined, limit: 40 }),
  })
  const rooms = data?.rooms ?? []

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 pb-24 md:pb-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Live study rooms</h1>
          <p className="text-muted-foreground">Drop into a focus room. Mic is off by default.</p>
        </div>
        <Button onClick={() => setShowCreate(true)}><Plus className="size-4" /> Host a room</Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search rooms…" className="pl-9" />
        </div>
        <Button variant={liveOnly ? "default" : "outline"} onClick={() => setLiveOnly(!liveOnly)}>
          <LiveDot label={liveOnly ? "LIVE ONLY" : ""} /> {liveOnly ? "Live only" : "All rooms"}
        </Button>
      </div>

      {rooms.length === 0 ? (
        <Card><CardContent className="py-16 text-center">
          <p className="text-muted-foreground">No rooms match. Host one and lead the room.</p>
          <Button className="mt-4" onClick={() => setShowCreate(true)}><Plus className="size-4" /> Host a room</Button>
        </CardContent></Card>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rooms.map((r: any) => (
            <Link key={r.id} to={`/rooms/${r.id}`}>
              <Card className="hover:shadow-md transition-all hover:-translate-y-0.5 h-full">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    {r.isLive ? <LiveDot /> : <span className="text-xs text-muted-foreground">Available</span>}
                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                      <Users className="size-3" /> {r.participantCount} {r.participantCount === 1 ? "student" : "students"} studying
                      {r.isPrivate && <Lock className="size-3 ml-1" />}
                    </span>
                  </div>
                  <h3 className="font-semibold truncate">{r.name}</h3>
                  <p className="text-xs text-muted-foreground truncate">{r.description || "Focus room"}</p>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {r.tags?.slice(0, 3).map((t: string) => (
                      <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">#{t}</span>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs inline-flex items-center gap-1.5">
                      <Avatar name={r.owner?.displayName} size={18} /> {r.owner?.displayName}
                    </span>
                    {r.community && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: `${r.community.color}22`, color: r.community.color }}>
                        {r.community.name}
                      </span>
                    )}
                  </div>
                  {r.focusMode && (
                    <div className="mt-2 text-[10px] text-muted-foreground inline-flex items-center gap-1"><Focus className="size-3" /> Focus mode · Pomodoro ready</div>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}

      <CreateRoomDialog open={showCreate} onOpenChange={setShowCreate} defaultCommunity={route.query.get("community") || ""} />
    </div>
  )
}

function CreateRoomDialog({ open, onOpenChange, defaultCommunity }: { open: boolean; onOpenChange: (v: boolean) => void; defaultCommunity?: string }) {
  const qc = useQueryClient()
  const { navigate } = useRouter()
  const { data: commData } = useQuery({ queryKey: ["communities"], queryFn: () => api.get<{ communities: any[] }>("/communities") })
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [communitySlug, setCommunitySlug] = useState(defaultCommunity || "")
  const [isPrivate, setIsPrivate] = useState(false)
  const [maxParticipants, setMaxParticipants] = useState(20)
  const [focusMode, setFocusMode] = useState(true)

  const create = useMutation({
    mutationFn: () => api.post<{ room: any }>("/rooms", { name, description, communitySlug: communitySlug || undefined, isPrivate, maxParticipants, focusMode }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["rooms"] })
      onOpenChange(false)
      toast.success("Room created!")
      navigate(`/rooms/${res.room.id}`)
    },
    onError: (e: any) => toast.error(e.message || "Failed to create room"),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Host a study room</DialogTitle>
          <DialogDescription>Open a live room. Mic defaults off for everyone.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Room name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. GATE Morning Focus" autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Description (optional)</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What are you studying?" />
          </div>
          <div className="space-y-1.5">
            <Label>Community (optional)</Label>
            <select value={communitySlug} onChange={(e) => setCommunitySlug(e.target.value)} className="w-full h-9 rounded-md border bg-background px-3 text-sm">
              <option value="">No community (open room)</option>
              {commData?.communities.map((c: any) => (
                <option key={c.id} value={c.slug}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Max participants</Label>
              <Input type="number" value={maxParticipants} min={2} max={50} onChange={(e) => setMaxParticipants(Number(e.target.value))} />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
            <div>
              <div className="text-sm font-medium flex items-center gap-1.5"><Focus className="size-4" /> Focus mode</div>
              <div className="text-xs text-muted-foreground">Shared Pomodoro timer for everyone</div>
            </div>
            <Switch checked={focusMode} onCheckedChange={setFocusMode} />
          </div>
          <div className="flex items-center justify-between rounded-lg border px-3 py-2.5">
            <div>
              <div className="text-sm font-medium flex items-center gap-1.5"><Lock className="size-4" /> Private</div>
              <div className="text-xs text-muted-foreground">Hidden from discovery; share the link</div>
            </div>
            <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>Create & enter</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
