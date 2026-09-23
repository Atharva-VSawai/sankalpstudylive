"use client"

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Avatar, timeAgo } from "@/components/app/brand"
import { Link } from "@/lib/router"
import { Bell, Check, UserPlus, Award, Target, Flame, MessageSquare, AlertTriangle, Info } from "lucide-react"
import { cn } from "@/lib/utils"

export function NotificationsView() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ["notifications", "all"],
    queryFn: () => api.get<{ notifications: any[]; unreadCount: number }>("/notifications", { limit: 50 }),
  })

  const markAll = useMutation({
    mutationFn: () => api.patch("/notifications"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  })
  const markOne = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  })

  const items = data?.notifications ?? []
  const unread = data?.unreadCount ?? 0

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 pb-24 md:pb-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Bell className="size-6" /> Notifications</h1>
          <p className="text-muted-foreground">{unread > 0 ? `${unread} unread` : "You're all caught up"}</p>
        </div>
        {unread > 0 && <Button variant="outline" size="sm" onClick={() => markAll.mutate()}><Check className="size-4" /> Mark all read</Button>}
      </div>

      {isLoading ? <div className="text-center text-muted-foreground py-10">Loading…</div> : items.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">
          <Bell className="size-10 mx-auto mb-2 opacity-30" /> No notifications yet.
        </CardContent></Card>
      ) : (
        <div className="space-y-2">
          {items.map((n: any) => (
            <Card key={n.id} className={cn(!n.read && "border-primary/40 bg-primary/5")}>
              <CardContent className="p-3 flex items-start gap-3">
                <span className={cn("size-9 rounded-lg flex items-center justify-center shrink-0", iconBg(n.type))}>
                  {iconFor(n.type)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-medium">{n.title}</div>
                      {n.body && <div className="text-xs text-muted-foreground mt-0.5">{n.body}</div>}
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo(n.createdAt)}</span>
                  </div>
                  {n.link && (
                    <div className="mt-1.5 flex items-center gap-3">
                      <Link to={n.link.replace(/^#/, "")} className="text-xs text-brand-emerald hover:underline" onClick={() => markOne.mutate(n.id)}>View</Link>
                      {!n.read && <button onClick={() => markOne.mutate(n.id)} className="text-xs text-muted-foreground hover:text-foreground">Mark read</button>}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function iconFor(type: string) {
  switch (type) {
    case "friend_request": return <UserPlus className="size-4" />
    case "friend_accept": return <UserPlus className="size-4" />
    case "badge_earned": return <Award className="size-4" />
    case "goal_completed": return <Target className="size-4" />
    case "streak_milestone": return <Flame className="size-4" />
    case "room_invite": return <MessageSquare className="size-4" />
    case "report_update": return <AlertTriangle className="size-4" />
    default: return <Info className="size-4" />
  }
}
function iconBg(type: string) {
  switch (type) {
    case "friend_request": case "friend_accept": return "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40"
    case "badge_earned": return "bg-amber-50 text-amber-600 dark:bg-amber-950/40"
    case "goal_completed": return "bg-sky-50 text-sky-600 dark:bg-sky-950/40"
    case "streak_milestone": return "bg-orange-50 text-orange-600 dark:bg-orange-950/40"
    case "report_update": return "bg-red-50 text-red-600 dark:bg-red-950/40"
    default: return "bg-muted text-muted-foreground"
  }
}
