"use client"

import { Card, CardContent } from "@/components/ui/card"
import { useRouter } from "@/lib/router"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"

const CONTENT: Record<string, { title: string; body: { h: string; p: string }[] }> = {
  privacy: {
    title: "Privacy Policy",
    body: [
      { h: "What we collect", p: "Your email, display name, username, exam goal and study sessions. We store study durations computed server-side. We do not collect biometric data from your camera or microphone — video/audio stays on LiveKit and is not recorded by Sankalp." },
      { h: "How we use it", p: "To run your account, compute streaks/XP/leaderboards, match you with communities, and improve the product. We never sell your data. Aggregate (non-identifying) stats may be shown publicly." },
      { h: "Who sees what", p: "Your profile (display name, username, exam goal, streak, badges, total minutes) is public. Your email is never shown to other users. Your study session history is private to you. Moderators can see reports you file." },
      { h: "Live rooms", p: "Other participants in a room see your avatar, name, and (if you enable it) your camera/mic. Leaving a room stops your presence. We do not record room audio or video." },
      { h: "Your choices", p: "You can edit or delete your profile data anytime from Settings. You can block users. You can request full data export or account deletion by contacting support." },
      { h: "Children", p: "Sankalp is intended for learners 13+. Minors should use Sankalp with parental guidance." },
      { h: "Contact", p: "Email support@sankalpstudylive.in for any privacy questions, data requests, or account deletion requests." },
    ],
  },
  terms: {
    title: "Terms of Service",
    body: [
      { h: "Acceptance", p: "By using Sankalp, you agree to these terms. If you don't, please don't use the service." },
      { h: "Your account", p: "You must provide accurate information and keep your password secure. You're responsible for activity on your account. One person, one account." },
      { h: "Conduct", p: "No spam, harassment, hate speech, cheating (faking study time), NSFW content, or anything illegal. We may mute, kick, suspend or ban accounts that break these rules. See Community Guidelines for detail." },
      { h: "Study integrity", p: "Sankalp computes study time server-side. Attempting to inflate XP, streaks, or leaderboard rank via automation or manipulation may result in a permanent ban." },
      { h: "Rooms", p: "Room hosts are responsible for their room's environment. We may close rooms that violate policy. LiveKit media is governed by LiveKit's terms in addition to ours." },
      { h: "Subscriptions", p: "Plus and Pro are billed monthly in INR. You can cancel anytime; access continues until the period ends. No refunds for partial months except where required by law." },
      { h: "Liability", p: "Sankalp is provided 'as is'. We're not liable for lost study time, data, or exam outcomes. Our maximum liability is limited to what you paid us in the last 12 months." },
      { h: "Changes", p: "We may update these terms. Material changes will be announced in-app. Continued use after changes means acceptance." },
    ],
  },
  guidelines: {
    title: "Community Guidelines",
    body: [
      { h: "Be kind", p: "Treat fellow aspirants with respect. Everyone's preparing for something hard. Encourage, don't belittle." },
      { h: "Stay focused", p: "Rooms are for studying. Keep chat on-topic. No promotions, no off-topic debates, no spam." },
      { h: "Mic off by default", p: "Mute unless you're invited to speak. Background noise disrupts focus for everyone." },
      { h: "No cheating", p: "Don't fake study time, share ways to manipulate XP, or use bots. The leaderboard exists to motivate honest effort." },
      { h: "No harassment", p: "No hate speech, bullying, threats, or sexual content. Report anyone who crosses the line — moderators review every report." },
      { h: "Reporting", p: "Use the Report button on profiles, messages, or rooms. False reports may affect your own account." },
      { h: "Consequences", p: "First issues usually get a warning. Repeated or severe issues lead to mute, kick, suspension, or permanent ban." },
      { h: "Help us improve", p: "Email support@sankalpstudylive.in with feedback. This is a community — help us make it a place worth showing up to." },
    ],
  },
}

export function LegalView({ doc }: { doc: "privacy" | "terms" | "guidelines" }) {
  const { navigate } = useRouter()
  const content = CONTENT[doc]
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 pb-24 md:pb-10">
      <Button variant="ghost" size="sm" onClick={() => navigate("/")} className="mb-4"><ArrowLeft className="size-4" /> Home</Button>
      <h1 className="text-3xl font-bold mb-2">{content.title}</h1>
      <p className="text-sm text-muted-foreground mb-8">Last updated: {new Date().toLocaleDateString("en-IN", { year: "numeric", month: "long", day: "numeric" })}</p>
      <Card><CardContent className="p-6 space-y-6">
        {content.body.map((s, i) => (
          <section key={i}>
            <h2 className="font-semibold text-lg mb-1.5">{s.h}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{s.p}</p>
          </section>
        ))}
      </CardContent></Card>
    </div>
  )
}
