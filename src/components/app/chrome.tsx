"use client"

import { Logo, Avatar } from "@/components/app/brand"
import { BrandLogo } from "@/components/branding/logo"
import { ThemeToggle } from "@/components/app/theme-toggle"
import { useAuth } from "@/lib/auth-context"
import { useRouter, Link } from "@/lib/router"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Bell, Search, Settings, User, LogOut, Shield, Zap, Crown, Sparkles, LayoutDashboard, BookOpen, Users, Video, Trophy, UserPlus, NotebookPen } from "lucide-react"
import { useState } from "react"
import { CommandDialog } from "@/components/ui/command"

export function AppHeader() {
  const { me, logout } = useAuth()
  const { navigate } = useRouter()
  const qc = useQueryClient()
  const [cmdOpen, setCmdOpen] = useState(false)

  const { data } = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: () => api.get<{ unreadCount: number }>("/notifications", { unread: true }),
    refetchInterval: 30000,
  })
  const unread = data?.unreadCount ?? 0

  const logoutMut = useMutation({
    mutationFn: async () => logout(),
    onSuccess: () => { qc.clear(); navigate("/") },
  })

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-16 items-center gap-3 px-4">
        <Link to="/dashboard" className="hidden md:flex items-center shrink-0">
          {/* Desktop navbar: full logo + text */}
          <BrandLogo variant="full" />
        </Link>
        <Link to="/dashboard" className="md:hidden">
          {/* Mobile: icon-only (space is limited) */}
          <BrandLogo variant="icon" size={32} />
        </Link>

        <Button
          variant="outline"
          className="hidden sm:flex w-64 justify-start text-muted-foreground"
          onClick={() => setCmdOpen(true)}
        >
          <Search className="size-4 mr-2" />
          <span className="text-sm">Search…</span>
          <kbd className="ml-auto text-[10px] rounded bg-muted px-1.5 py-0.5">⌘K</kbd>
        </Button>
        <Button variant="ghost" size="icon" className="sm:hidden" onClick={() => setCmdOpen(true)}>
          <Search className="size-4" />
        </Button>

        <div className="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <Link to="/notifications" className="relative inline-flex items-center justify-center size-9 rounded-md hover:bg-accent">
            <Bell className="size-4" />
            {unread > 0 && (
              <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-accent text-accent-foreground text-[10px] font-bold flex items-center justify-center">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Link>
          <DropdownMenu>
            <DropdownMenuTrigger className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <Avatar name={me?.profile?.displayName} src={me?.profile?.avatarUrl} size={34} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel className="flex flex-col gap-1">
                <span>{me?.profile?.displayName}</span>
                <span className="text-xs font-normal text-muted-foreground">@{me?.profile?.username}</span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-emerald">
                    <Sparkles className="size-3" /> Lvl {me?.profile?.level}
                  </span>
                  {me?.streak?.current ? (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-accent-foreground">
                      <Zap className="size-3 fill-accent text-accent" /> {me.streak.current}d
                    </span>
                  ) : null}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => navigate("/profile")}><User className="size-4 mr-2" /> My profile</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/settings")}><Settings className="size-4 mr-2" /> Settings</DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate("/pricing")}><Crown className="size-4 mr-2" /> Plans</DropdownMenuItem>
              {(me?.role === "admin" || me?.role === "moderator") && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/admin")}><Shield className="size-4 mr-2" /> Admin</DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => logoutMut.mutate()} className="text-destructive focus:text-destructive">
                <LogOut className="size-4 mr-2" /> Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <CommandPalette open={cmdOpen} setOpen={setCmdOpen} />
    </header>
  )
}

function CommandPalette({ open, setOpen }: { open: boolean; setOpen: (v: boolean) => void }) {
  const { navigate } = useRouter()
  const go = (to: string) => { setOpen(false); navigate(to) }
  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <div className="p-2">
        <input
          autoFocus
          placeholder="Search pages…"
          className="w-full bg-transparent outline-none text-sm px-2 py-2"
          onKeyDown={(e) => { if (e.key === "Enter") go("/dashboard") }}
        />
      </div>
      <div className="border-t">
        {[
          ["Dashboard", "/dashboard"], ["Solo study", "/study"], ["Study journal", "/journal"], ["Communities", "/communities"], ["Live rooms", "/rooms"],
          ["Leaderboard", "/leaderboard"], ["Friends", "/friends"], ["Notifications", "/notifications"],
          ["My profile", "/profile"], ["Settings", "/settings"], ["Pricing", "/pricing"], ["Admin", "/admin"],
        ].map(([label, to]) => (
          <button
            key={to}
            onClick={() => go(to)}
            className="w-full text-left px-3 py-2 text-sm hover:bg-accent rounded-md"
          >
            {label}
          </button>
        ))}
      </div>
    </CommandDialog>
  )
}

export function AppSidebar() {
  const { me } = useAuth()
  const { route } = useRouter()
  const path = route.path === "/" ? "/" : `/${route.segments.join("/")}`
  const item = (to: string, label: string, icon: React.ReactNode) => {
    const active = path === to || path.startsWith(to + "/")
    return (
      <Link to={to} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"}`}>
        {icon}
        <span>{label}</span>
      </Link>
    )
  }
  return (
    <aside className="hidden md:flex w-60 shrink-0 flex-col gap-1 p-3 border-r sticky top-16 h-[calc(100vh-4rem)] overflow-y-auto scroll-thin">
      {item("/dashboard", "Dashboard", <LayoutDashboard className="size-4" />)}
      {item("/study", "Solo study", <BookOpen className="size-4" />)}
      {item("/journal", "Study journal", <NotebookPen className="size-4" />)}
      {item("/communities", "Communities", <Users className="size-4" />)}
      {item("/rooms", "Live rooms", <Video className="size-4" />)}
      {item("/leaderboard", "Leaderboard", <Trophy className="size-4" />)}
      {item("/friends", "Friends", <UserPlus className="size-4" />)}
      <div className="my-2 h-px bg-border" />
      {item("/profile", "Profile", <User className="size-4" />)}
      {item("/settings", "Settings", <Settings className="size-4" />)}
      {(me?.role === "admin" || me?.role === "moderator") && (
        <>
          <div className="my-2 h-px bg-border" />
          {item("/admin", "Admin", <Shield className="size-4" />)}
        </>
      )}
      <div className="mt-auto pt-4">
        <Link to="/pricing" className="block rounded-xl border bg-accent/40 p-3 hover:bg-accent transition-colors">
          <div className="flex items-center gap-2 text-sm font-semibold"><Crown className="size-4 text-accent-foreground" /> Go Sankalp Plus</div>
          <p className="text-xs text-muted-foreground mt-1">Unlimited rooms, deep analytics.</p>
        </Link>
      </div>
    </aside>
  )
}

export function MobileNav() {
  const { route, navigate } = useRouter()
  const path = route.path === "/" ? "/" : `/${route.segments.join("/")}`
  const items: { to: string; label: string; icon: React.ReactNode }[] = [
    { to: "/dashboard", label: "Home", icon: <LayoutDashboard className="size-5" /> },
    { to: "/rooms", label: "Rooms", icon: <Video className="size-5" /> },
    { to: "/communities", label: "Groups", icon: <Users className="size-5" /> },
    { to: "/leaderboard", label: "Ranks", icon: <Trophy className="size-5" /> },
    { to: "/profile", label: "Me", icon: <User className="size-5" /> },
  ]
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <div className="grid grid-cols-5 h-16">
        {items.map((it) => {
          const active = path === it.to || path.startsWith(it.to + "/")
          return (
            <button key={it.to} onClick={() => navigate(it.to)} className={`flex flex-col items-center justify-center gap-0.5 text-[11px] ${active ? "text-brand-emerald" : "text-muted-foreground"}`}>
              {it.icon}
              <span>{it.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
