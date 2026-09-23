"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar } from "@/components/app/brand"
import { Link } from "@/lib/router"
import { Users, Radio } from "lucide-react"

// Shows friends who are currently in a live room, with a "Join room" button.
export function BuddiesOnlineWidget() {
  const { data, isLoading } = useQuery({
    queryKey: ["friends", "online"],
    queryFn: () => api.get<{ online: any[] }>("/friends/online"),
    refetchInterval: 30000,
  })

  const online = data?.online ?? []

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center justify-between">
          <span className="flex items-center gap-2"><Users className="size-4 text-brand-emerald" /> Buddies online</span>
          {online.length > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-normal text-brand-emerald">
              <Radio className="size-3 animate-pulse" /> {online.length} studying
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-16 rounded-lg bg-muted/40 animate-pulse" />
        ) : online.length === 0 ? (
          <div className="text-center py-4">
            <Users className="size-6 mx-auto mb-1.5 opacity-20" />
            <p className="text-xs text-muted-foreground">No buddies studying right now.</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">When friends join a room, they'll appear here.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {online.slice(0, 5).map((o: any) => (
              <div key={o.userId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent">
                <div className="relative">
                  <Avatar name={o.displayName} src={o.avatarUrl} size={32} />
                  <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-brand-emerald border-2 border-background" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{o.displayName}</div>
                  <div className="text-[10px] text-muted-foreground truncate">in {o.roomName ?? "a room"}</div>
                </div>
                <Link to={`/rooms/${o.roomId}`}>
                  <span className="text-[10px] px-2 py-1 rounded-md bg-brand-emerald/10 text-brand-emerald hover:bg-brand-emerald/20 font-medium">
                    Join
                  </span>
                </Link>
              </div>
            ))}
            {online.length > 5 && (
              <p className="text-[10px] text-muted-foreground text-center pt-1">+ {online.length - 5} more</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
