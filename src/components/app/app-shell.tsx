"use client"

import { useEffect, useMemo } from "react"
import { useRouter, Link } from "@/lib/router"
import { useAuth } from "@/lib/auth-context"
import { useIdleAutoLogout } from "@/lib/use-idle-auto-logout"
import { Logo } from "@/components/app/brand"
import { BrandLogo } from "@/components/branding/logo"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/app/theme-toggle"
import { AppHeader, AppSidebar, MobileNav } from "@/components/app/chrome"
import { Footer } from "@/components/app/footer"
import { Toaster } from "@/components/ui/toaster"
import { toast } from "sonner"

// Views
import { LandingView } from "@/components/app/views/landing"
import { AuthView } from "@/components/app/views/auth"
import { OnboardingView } from "@/components/app/views/onboarding"
import { CommunitiesView } from "@/components/app/views/communities"
import { CommunityDetailView } from "@/components/app/views/community-detail"
import { RoomsView } from "@/components/app/views/rooms"
import { RoomView } from "@/components/app/views/room"
import { DashboardView } from "@/components/app/views/dashboard"
import { StudyView } from "@/components/app/views/study"
import { JournalView } from "@/components/app/views/journal"
import { LeaderboardView } from "@/components/app/views/leaderboard"
import { FriendsView } from "@/components/app/views/friends"
import { ProfileView } from "@/components/app/views/profile"
import { PublicProfileView } from "@/components/app/views/public-profile"
import { NotificationsView } from "@/components/app/views/notifications"
import { SettingsView } from "@/components/app/views/settings"
import { PricingView } from "@/components/app/views/pricing"
import { PaywallView } from "@/components/app/views/paywall"
import { LegalView } from "@/components/app/views/legal"
import { AdminView } from "@/components/app/views/admin"

const AUTHED_PREFIXES = ["/dashboard", "/study", "/journal", "/communities", "/rooms", "/leaderboard", "/friends", "/profile", "/notifications", "/settings", "/paywall", "/onboarding", "/admin"]

export function AppShell() {
  const { route, navigate } = useRouter()
  const { me, loading } = useAuth()

  const path = route.path === "/" ? "/" : `/${route.segments.join("/")}`

  const requiresAuth = AUTHED_PREFIXES.some((p) => path === p || path.startsWith(p + "/") || path.startsWith(p))
  const isAdminArea = path === "/admin" || path.startsWith("/admin/")
  // Only individual room views (e.g. /rooms/abc123) are full-screen (no chrome).
  // The /rooms listing page uses the normal authenticated layout with sidebar.
  const isIndividualRoom = path.startsWith("/rooms/") && route.segments.length > 1
  // An active room is a study activity, even when the user is not touching
  // the mouse or keyboard. Never auto-logout during a live room/timelapse.
  useIdleAutoLogout(me?.profile?.sessionTimeoutMin ?? 0, isIndividualRoom)

  // Redirect rules
  useEffect(() => {
    if (loading) return
    if (requiresAuth && !me) {
      navigate(`/login?next=${encodeURIComponent(path)}`, { replace: true })
    }
    if (me && !me.profile.onboardingComplete && path !== "/onboarding" && requiresAuth && path !== "/rooms" && !isIndividualRoom) {
      navigate("/onboarding", { replace: true })
    }
    if (isAdminArea && me && me.role !== "admin" && me.role !== "moderator") {
      navigate("/dashboard", { replace: true })
    }
  }, [path, loading, me, navigate, requiresAuth, isAdminArea])

  // Marketing chrome for public pages, app chrome for authed pages
  const isMarketing =
    path === "/" ||
    path === "/login" ||
    path === "/signup" ||
    path === "/pricing" ||
    path === "/privacy" ||
    path === "/terms" ||
    path === "/community-guidelines"

  const view = useMemo(() => renderView(path, route.segments, me), [path, route.segments, me])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <BrandLogo variant="full" size={40} />
          <p className="text-sm text-muted-foreground">Preparing your study space…</p>
        </div>
      </div>
    )
  }

  // Individual room view is full-screen (no chrome) — only /rooms/[id], not /rooms listing
  if (isIndividualRoom && me) {
    return (
      <div className="min-h-screen flex flex-col bg-background">
        {view}
        <Toaster />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {isMarketing ? (
        <MarketingHeader />
      ) : me ? (
        <AppHeader />
      ) : (
        <MarketingHeader />
      )}
      <div className="flex flex-1 w-full">
        {me && !isMarketing && <AppSidebar />}
        <main className="flex-1 min-w-0 fade-in">
          {view}
        </main>
      </div>
      <Footer />
      {me && !isMarketing && <MobileNav />}
      <Toaster />
    </div>
  )
}

function MarketingHeader() {
  const { me } = useAuth()
  const { navigate } = useRouter()
  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
        <Link to="/" className="flex items-center"><BrandLogo variant="full" /></Link>
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
          <Link to="/communities" className="text-muted-foreground hover:text-foreground">Communities</Link>
          <Link to="/rooms" className="text-muted-foreground hover:text-foreground">Live Rooms</Link>
          <Link to="/leaderboard" className="text-muted-foreground hover:text-foreground">Leaderboard</Link>
          <Link to="/pricing" className="text-muted-foreground hover:text-foreground">Pricing</Link>
        </nav>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {me ? (
            <Button size="sm" onClick={() => navigate("/dashboard")}>Open app</Button>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => navigate("/login")}>Log in</Button>
              <Button size="sm" onClick={() => navigate("/signup")}>Sign up</Button>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

function renderView(path: string, segments: string[], me: any): React.ReactNode {
  // Public
  if (path === "/") return <LandingView />
  if (path === "/login") return <AuthView mode="login" />
  if (path === "/signup") return <AuthView mode="signup" />
  if (path === "/pricing") return <PricingView />
  if (path === "/privacy") return <LegalView doc="privacy" />
  if (path === "/terms") return <LegalView doc="terms" />
  if (path === "/community-guidelines") return <LegalView doc="guidelines" />

  if (!me) {
    // Not authed but on a gated page — the effect will redirect; show a placeholder meanwhile.
    return <div className="p-10 text-center text-muted-foreground">Redirecting…</div>
  }

  if (path === "/onboarding") return <OnboardingView />
  if (path === "/dashboard") return <DashboardView />
  if (path === "/study") return <StudyView />
  if (path === "/journal") return <JournalView />
  if (path === "/leaderboard") return <LeaderboardView />
  if (path === "/friends") return <FriendsView />
  if (path === "/notifications") return <NotificationsView />
  if (path === "/settings") return <SettingsView />
  if (path === "/paywall") return <PaywallView />
  if (path === "/profile") return <ProfileView />
  if (path === "/communities") return <CommunitiesView />
  if (segments[0] === "communities" && segments[1]) return <CommunityDetailView slug={segments[1]} />
  if (path === "/rooms") return <RoomsView />
  if (segments[0] === "rooms" && segments[1]) return <RoomView id={segments[1]} />
  if (segments[0] === "profile" && segments[1]) return <PublicProfileView username={decodeURIComponent(segments[1])} />

  // Admin
  if (path === "/admin") return <AdminView section="dashboard" />
  if (path === "/admin/users") return <AdminView section="users" />
  if (segments[0] === "admin" && segments[1] === "users" && segments[2]) return <AdminView section="user-detail" userId={segments[2]} />
  if (path === "/admin/communities") return <AdminView section="communities" />
  if (path === "/admin/rooms") return <AdminView section="rooms" />
  if (path === "/admin/reports") return <AdminView section="reports" />
  if (path === "/admin/analytics") return <AdminView section="analytics" />
  if (path === "/admin/subscriptions") return <AdminView section="subscriptions" />
  if (path === "/admin/payments") return <AdminView section="payments" />
  if (path === "/admin/referrals") return <AdminView section="referrals" />
  if (path === "/admin/audit-logs") return <AdminView section="audit-logs" />
  if (path === "/admin/system-health") return <AdminView section="system-health" />
  if (path === "/admin/badges") return <AdminView section="badges" />
  if (path === "/admin/notifications") return <AdminView section="notifications" />
  if (path === "/admin/settings") return <AdminView section="settings" />

  return <div className="p-10 text-center text-muted-foreground">Page not found: {path}</div>
}
