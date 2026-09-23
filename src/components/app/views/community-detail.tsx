"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Avatar, LiveDot, formatMinutes } from "@/components/app/brand"
import { Link, useRouter } from "@/lib/router"
import { ArrowLeft, Users, Video, Check, LogOut, Plus, Home } from "lucide-react"
import { toast } from "sonner"
import { useAuth } from "@/lib/auth-context"

export function CommunityDetailView({ slug }: { slug: string }) {
  const qc = useQueryClient()
  const { navigate } = useRouter()
  const { me } = useAuth()
  const { data, isLoading } = useQuery({
    queryKey: ["community", slug],
    queryFn: () => api.get<{ community: any; rooms: any[]; membership: any }>(`/communities/${slug}`),
  })

  const joinMut = useMutation({
    mutationFn: () => api.post(`/communities/${slug}/join`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["community", slug] }); toast.success("Joined!") },
  })
  const leaveMut = useMutation({
    mutationFn: () => api.post(`/communities/${slug}/leave`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["community", slug] }); toast.success("Left community") },
  })

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">Loading…</div>
  if (!data) return <div className="p-8 text-center text-muted-foreground">Community not found.</div>

  const { community, rooms, membership } = data
  const isMember = Boolean(membership)
  const liveRooms = rooms.filter((r: any) => r.isLive)
  const upcoming = rooms.filter((r: any) => !r.isLive)

  return (
    <div className="pb-24 md:pb-8">
      <div className="h-32" style={{ background: `linear-gradient(135deg, ${community.color}, ${community.color}aa)` }} />
      <div className="mx-auto max-w-5xl px-4 -mt-12">
        <Button variant="ghost" size="sm" onClick={() => navigate("/communities")} className="mb-3 text-white hover:bg-white/10">
          <ArrowLeft className="size-4" /> Communities
        </Button>
        <Card className="overflow-hidden">
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row gap-4 items-start">
              <div className="size-20 rounded-2xl flex items-center justify-center text-white font-bold text-2xl shrink-0" style={{ background: community.color }}>
                {community.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-2xl font-bold">{community.name}</h1>
                  {community.isFeatured && <span className="text-xs px-2 py-0.5 rounded bg-accent text-accent-foreground font-medium">Featured</span>}
                </div>
                <p className="text-muted-foreground mt-1">{community.description}</p>
                <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-1"><Users className="size-4" /> {community.memberCount} members</span>
                  {liveRooms.length > 0 && <span className="inline-flex items-center gap-1"><LiveDot /> {liveRooms.length} live</span>}
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {safeTags(community.tags).map((t: string) => (
                    <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">#{t}</span>
                  ))}
                </div>
              </div>
              <div className="shrink-0">
                {isMember ? (
                  <Button variant="outline" onClick={() => leaveMut.mutate()} disabled={leaveMut.isPending}>
                    <LogOut className="size-4" /> Leave
                  </Button>
                ) : (
                  <Button onClick={() => joinMut.mutate()} disabled={joinMut.isPending}>
                    <Plus className="size-4" /> Join community
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-6 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Live study rooms</h2>
          {isMember && (
            <Button size="sm" onClick={() => navigate(`/rooms?new=1&community=${slug}`)}><Plus className="size-4" /> Host a room</Button>
          )}
        </div>

        {liveRooms.length === 0 ? (
          <Card className="mt-3"><CardContent className="py-8 text-center text-sm text-muted-foreground">
            No live rooms right now. {isMember ? "Host one to get the room going." : "Join the community to host rooms."}
          </CardContent></Card>
        ) : (
          <div className="mt-3 grid sm:grid-cols-2 gap-4">
            {liveRooms.map((r: any) => <RoomCard key={r.id} room={r} />)}
          </div>
        )}

        {upcoming.length > 0 && (
          <>
            <h2 className="mt-8 text-lg font-semibold">All rooms in {community.name}</h2>
            <div className="mt-3 grid sm:grid-cols-2 gap-4">
              {upcoming.map((r: any) => <RoomCard key={r.id} room={r} />)}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function RoomCard({ room }: { room: any }) {
  return (
    <Link to={`/rooms/${room.id}`}>
      <Card className="hover:shadow-md transition-shadow h-full">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            {room.isLive ? <LiveDot /> : <span className="text-xs text-muted-foreground">Idle</span>}
            <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><Users className="size-3" /> {room.participantCount}/{room.maxParticipants}</span>
          </div>
          <h3 className="font-semibold truncate">{room.name}</h3>
          <p className="text-xs text-muted-foreground truncate">{room.description || "Focus room"}</p>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs inline-flex items-center gap-1.5">
              <Avatar name={room.owner?.displayName} size={18} /> {room.owner?.displayName}
            </span>
            {room.focusMode && <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted">Focus mode</span>}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

function safeTags(s: any): string[] {
  try { return Array.isArray(s) ? s : JSON.parse(s) } catch { return [] }
}
