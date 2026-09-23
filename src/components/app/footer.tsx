"use client"

import { Logo } from "@/components/app/brand"
import { Link } from "@/lib/router"

export function Footer() {
  return (
    <footer className="mt-auto border-t bg-card/50">
      <div className="mx-auto max-w-7xl px-4 py-10">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div className="col-span-2 md:col-span-1">
            <Logo />
            <p className="mt-3 text-sm text-muted-foreground max-w-xs">
              Study with people preparing for the same goal. Live rooms, accountability and communities for India's exams.
            </p>
          </div>
          <FooterCol title="Product" links={[
            ["/communities", "Communities"],
            ["/rooms", "Live rooms"],
            ["/leaderboard", "Leaderboard"],
            ["/pricing", "Pricing"],
          ]} />
          <FooterCol title="Company" links={[
            ["/community-guidelines", "Community guidelines"],
            ["/privacy", "Privacy"],
            ["/terms", "Terms"],
          ]} />
          <FooterCol title="Get started" links={[
            ["/signup", "Create account"],
            ["/login", "Log in"],
            ["/study", "Solo study"],
            ["/dashboard", "Dashboard"],
          ]} />
        </div>
        <div className="mt-8 pt-6 border-t flex flex-col sm:flex-row gap-3 items-center justify-between">
          <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Sankalp. Made for India's learners.</p>
          <p className="text-xs text-muted-foreground">
            Demo data only. Not real user statistics.
          </p>
        </div>
      </div>
    </footer>
  )
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <h4 className="text-sm font-semibold mb-3">{title}</h4>
      <ul className="space-y-2">
        {links.map(([to, label]) => (
          <li key={to}>
            <Link to={to} className="text-sm text-muted-foreground hover:text-foreground">{label}</Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
