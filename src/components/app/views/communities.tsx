"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Avatar, LiveDot } from "@/components/app/brand"
import { Link } from "@/lib/router"
import { Search, Users, Video, Check } from "lucide-react"

export function CommunitiesView() {
  const [q, setQ] = useState("")
  const qc = useQueryClient()
  const { data } = useQuery({
    queryKey: ["communities", q],
    queryFn: () => api.get<{ communities: any[] }>("/communities", { q: q || undefined }),
  })
  const communities = data?.communities ?? []

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 pb-24 md:pb-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">Communities</h1>
          <p className="text-muted-foreground">Join aspirants preparing for the same exam.</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search communities…" className="pl-9" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {communities.map((c) => (
          <CommunityCard key={c.id} community={c} />
        ))}
      </div>
      {communities.length === 0 && (
        <div className="text-center py-20 text-muted-foreground">No communities found for "{q}".</div>
      )}
    </div>
  )
}

function CommunityCard({ community }: { community: any }) {
  const qc = useQueryClient()
  const [joined, setJoined] = useState(false)
  const joinMut = useMutation({
    mutationFn: () => api.post(`/communities/${community.slug}/join`),
    onSuccess: () => {
      setJoined(true)
      qc.invalidateQueries({ queryKey: ["communities"] })
      qc.invalidateQueries({ queryKey: ["community", community.slug] })
    },
  })
  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      <div className="h-20" style={{ background: `linear-gradient(135deg, ${community.color}, ${community.color}cc)` }} />
      <CardContent className="p-4 -mt-8 relative">
        <div className="size-14 rounded-2xl bg-card border-4 border-card flex items-center justify-center text-white font-bold text-lg" style={{ background: community.color }}>
          {community.name.slice(0, 2).toUpperCase()}
        </div>
        <div className="mt-3 flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold">{community.name}</h3>
            <p className="text-xs text-muted-foreground">{community.examGoal}</p>
          </div>
          {community.isFeatured && <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent text-accent-foreground font-medium">Featured</span>}
        </div>
        <p className="mt-2 text-sm text-muted-foreground line-clamp-2">{community.description}</p>
        <div className="mt-3 flex flex-wrap gap-1">
          {community.tags?.slice(0, 3).map((t: string) => (
            <span key={t} className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">#{t}</span>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><Users className="size-3" /> {community.memberCount}</span>
          {community.liveRooms > 0 && <span className="inline-flex items-center gap-1"><LiveDot /> {community.liveRooms}</span>}
        </div>
        <div className="mt-4 flex gap-2">
          <Button asChild variant="outline" className="flex-1"><Link to={`/communities/${community.slug}`}><Video className="size-4" /> View</Link></Button>
          {joined ? (
            <Button variant="secondary" className="flex-1" disabled><Check className="size-4" /> Joined</Button>
          ) : (
            <Button className="flex-1" onClick={() => joinMut.mutate()} disabled={joinMut.isPending}>Join</Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
