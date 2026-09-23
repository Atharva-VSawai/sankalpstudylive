"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api, ApiError } from "@/lib/api-client"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, formatMinutes } from "@/components/app/brand"
import { Link, useRouter } from "@/lib/router"
import { useAuth } from "@/lib/auth-context"
import { Search, UserPlus, Check, X, Ban, UserCheck, MessageSquare, Users, Bell } from "lucide-react"
import { toast } from "sonner"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"

export function FriendsView() {
  const [q, setQ] = useState("")
  const qc = useQueryClient()
  const { me } = useAuth()

  const { data } = useQuery({ queryKey: ["friends"], queryFn: () => api.get<{ friends: any[]; incoming: any[]; outgoing: any[] }>("/friends") })
  const { data: search } = useQuery({
    queryKey: ["search", q],
    queryFn: () => api.get<{ users: any[] }>("/search/users", { q, limit: 10 }),
    enabled: q.length >= 1,
  })

  const sendMut = useMutation({
    mutationFn: (username: string) => api.post("/friends", { username }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["friends"] }); toast.success("Friend request sent") },
    onError: (e: ApiError) => toast.error(e.message),
  })
  const acceptMut = useMutation({
    mutationFn: (fromUserId: string) => api.patch(`/friends/${fromUserId}`, { action: "accept" }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["friends"] }); toast.success("You're now study buddies") },
  })
  const declineMut = useMutation({
    mutationFn: (fromUserId: string) => api.patch(`/friends/${fromUserId}`, { action: "decline" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["friends"] }),
  })
  const unfriendMut = useMutation({
    mutationFn: (userId: string) => api.del(`/friends/${userId}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["friends"] }); toast.success("Removed") },
  })
  const blockMut = useMutation({
    mutationFn: (username: string) => api.post("/blocks", { username }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["friends"] }); toast.success("User blocked") },
  })

  const { data: onlineData } = useQuery({
    queryKey: ["friends", "online"],
    queryFn: () => api.get<{ online: any[] }>("/friends/online"),
    refetchInterval: 30000,
  })
  const onlineMap = new Map((onlineData?.online ?? []).map((o: any) => [o.userId, o]))

  const friends = data?.friends ?? []
  const incoming = data?.incoming ?? []
  const outgoing = data?.outgoing ?? []
  const results = (search?.users ?? []).filter((u: any) => u.userId !== me?.id)

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 pb-24 md:pb-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold flex items-center gap-2"><Users className="size-6 text-brand-emerald" /> Study buddies</h1>
        <p className="text-muted-foreground">Find people on the same journey and stay accountable together.</p>
      </div>

      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="relative">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by username or name…" className="pl-9" autoFocus />
          </div>
          {q && (
            <div className="mt-3 space-y-1">
              {results.length === 0 ? <p className="text-sm text-muted-foreground text-center py-3">No users found.</p> : results.map((u: any) => {
                const alreadyFriend = friends.some((f: any) => f.userId === u.userId)
                const pending = outgoing.some((f: any) => f.userId === u.userId) || incoming.some((f: any) => f.userId === u.userId)
                return (
                  <div key={u.userId} className="flex items-center gap-3 p-2 rounded-lg hover:bg-accent">
                    <Link to={`/profile/${u.username}`}><Avatar name={u.displayName} src={u.avatarUrl} size={36} /></Link>
                    <div className="flex-1 min-w-0">
                      <Link to={`/profile/${u.username}`} className="text-sm font-medium hover:underline truncate block">{u.displayName}</Link>
                      <div className="text-xs text-muted-foreground">@{u.username} · {u.examGoal ?? "—"} · Lvl {u.level}</div>
                    </div>
                    {alreadyFriend ? (
                      <span className="text-xs text-brand-emerald inline-flex items-center gap-1"><Check className="size-3.5" /> Friends</span>
                    ) : pending ? (
                      <span className="text-xs text-muted-foreground">Pending</span>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => sendMut.mutate(u.username)}><UserPlus className="size-3.5" /> Add</Button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="friends">
        <TabsList className="grid grid-cols-3 w-full mb-4">
          <TabsTrigger value="friends">Friends ({friends.length})</TabsTrigger>
          <TabsTrigger value="incoming">Requests ({incoming.length})</TabsTrigger>
          <TabsTrigger value="outgoing">Sent ({outgoing.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="friends" className="space-y-2">
          {friends.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground">
              <UserPlus className="size-8 mx-auto mb-2 opacity-30" />
              No friends yet. Search above to add study buddies.
            </CardContent></Card>
          ) : friends.map((f: any) => {
            const online = onlineMap.get(f.userId)
            return (
            <Card key={f.userId}><CardContent className="p-3 flex items-center gap-3">
              <div className="relative">
                <Link to={`/profile/${f.username}`}><Avatar name={f.displayName} src={f.avatarUrl} size={40} /></Link>
                {online && (
                  <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full bg-brand-emerald border-2 border-background" title="Online — studying now" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <Link to={`/profile/${f.username}`} className="font-medium hover:underline truncate block">{f.displayName}</Link>
                <div className="text-xs text-muted-foreground">
                  {online ? (
                    <span className="text-brand-emerald inline-flex items-center gap-1">
                      <span className="size-1.5 rounded-full bg-brand-emerald animate-pulse" /> in {online.roomName ?? "a room"}
                    </span>
                  ) : (
                    <>@{f.username} · {f.examGoal ?? "—"} · Lvl {f.level}</>
                  )}
                </div>
              </div>
              {online && (
                <Link to={`/rooms/${online.roomId}`}><Button size="sm" variant="outline" className="text-brand-emerald border-brand-emerald/40 hover:bg-brand-emerald/10">Join room</Button></Link>
              )}
              <Button size="sm" variant="ghost" onClick={() => blockMut.mutate(f.username)}><Ban className="size-4 text-destructive" /></Button>
              <Button size="sm" variant="outline" onClick={() => unfriendMut.mutate(f.userId)}>Unfriend</Button>
            </CardContent></Card>
            )
          })}
        </TabsContent>

        <TabsContent value="incoming" className="space-y-2">
          {incoming.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground">
              <Bell className="size-8 mx-auto mb-2 opacity-30" /> No pending requests.
            </CardContent></Card>
          ) : incoming.map((r: any) => (
            <Card key={r.userId}><CardContent className="p-3 flex items-center gap-3">
              <Link to={`/profile/${r.username}`}><Avatar name={r.displayName} src={r.avatarUrl} size={40} /></Link>
              <div className="flex-1 min-w-0">
                <Link to={`/profile/${r.username}`} className="font-medium hover:underline truncate block">{r.displayName}</Link>
                <div className="text-xs text-muted-foreground">@{r.username} · {r.examGoal ?? "—"}</div>
              </div>
              <Button size="sm" onClick={() => acceptMut.mutate(r.userId)}><UserCheck className="size-4" /> Accept</Button>
              <Button size="sm" variant="outline" onClick={() => declineMut.mutate(r.userId)}><X className="size-4" /> Decline</Button>
            </CardContent></Card>
          ))}
        </TabsContent>

        <TabsContent value="outgoing" className="space-y-2">
          {outgoing.length === 0 ? (
            <Card><CardContent className="py-10 text-center text-muted-foreground">No outgoing requests.</CardContent></Card>
          ) : outgoing.map((r: any) => (
            <Card key={r.userId}><CardContent className="p-3 flex items-center gap-3">
              <Link to={`/profile/${r.username}`}><Avatar name={r.displayName} src={r.avatarUrl} size={40} /></Link>
              <div className="flex-1 min-w-0">
                <Link to={`/profile/${r.username}`} className="font-medium hover:underline truncate block">{r.displayName}</Link>
                <div className="text-xs text-muted-foreground">@{r.username} · waiting…</div>
              </div>
              <Button size="sm" variant="outline" onClick={() => unfriendMut.mutate(r.userId)}>Cancel</Button>
            </CardContent></Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  )
}
