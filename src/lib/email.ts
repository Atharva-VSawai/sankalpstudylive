// Weekly recap email — Resend-compatible architecture.
// In production this would call Resend's API to send a real email.
// In the sandbox it logs the email content + returns the payload for inspection.
// See docs/deployment.md §Email for the Resend wiring.

import { db } from "@/lib/db"
import { localDateForTimezone } from "@/lib/study"

// Inline minute formatter (server-side; can't import from a client component).
function formatMinutes(min: number): string {
  if (min < 60) return `${Math.round(min)}m`
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return m ? `${h}h ${m}m` : `${h}h`
}

export type RecapEmail = {
  to: string
  subject: string
  html: string
  text: string
  stats: {
    totalMinutes: number
    sessions: number
    bestDay: { day: string; minutes: number } | null
    streak: { current: number; longest: number }
    level: number
    goalHitDays: number
  }
}

// Build a weekly recap for a user. Returns the email payload (not sent in sandbox).
export async function buildWeeklyRecap(userId: string): Promise<RecapEmail | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    include: { profile: true, streak: true },
  })
  if (!user || !user.profile) return null

  const tz = user.timezone || "Asia/Kolkata"
  const today = localDateForTimezone(new Date(), tz)
  const dow = today.getUTCDay()
  const mondayOffset = dow === 0 ? 6 : dow - 1
  const thisMonday = new Date(today.getTime() - mondayOffset * 86400000)
  const lastMonday = new Date(thisMonday.getTime() - 7 * 86400000)

  const sessions = await db.studySession.findMany({
    where: { userId, endedAt: { not: null }, startedAt: { gte: lastMonday, lt: thisMonday } },
    select: { startedAt: true, durationMin: true, mode: true },
  })

  const totalMinutes = sessions.reduce((a, s) => a + s.durationMin, 0)
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
  const dayBuckets: Record<string, number> = {}
  for (let i = 0; i < 7; i++) dayBuckets[days[i]] = 0
  for (const s of sessions) {
    const d = localDateForTimezone(s.startedAt, tz)
    const dow2 = d.getUTCDay()
    const idx = dow2 === 0 ? 6 : dow2 - 1
    dayBuckets[days[idx]] += s.durationMin
  }
  const daysWithStudy = Object.entries(dayBuckets).filter(([, m]) => m > 0)
  const bestDay = daysWithStudy.length > 0
    ? daysWithStudy.reduce((a, b) => (b[1] > a[1] ? b : a))
    : null
  const goalHitDays = daysWithStudy.length

  const stats = {
    totalMinutes,
    sessions: sessions.length,
    bestDay: bestDay ? { day: bestDay[0], minutes: bestDay[1] } : null,
    streak: { current: user.streak?.current ?? 0, longest: user.streak?.longest ?? 0 },
    level: user.profile.level,
    goalHitDays,
  }

  const subject = `Your Sankalp week: ${formatMinutes(totalMinutes)} studied${stats.streak.current > 0 ? ` · 🔥 ${stats.streak.current}d streak` : ""}`
  const text = `Hi ${user.profile.displayName},\n\nHere's your Sankalp study recap for last week:\n\n- Total study time: ${formatMinutes(totalMinutes)}\n- Sessions completed: ${sessions.length}\n${bestDay ? `- Best day: ${bestDay[0]} (${formatMinutes(bestDay[1])})\n` : ""}- Days you hit your goal: ${goalHitDays}/7\n- Current streak: ${stats.streak.current} days (longest ${stats.streak.longest})\n- Level: ${stats.level}\n\nKeep showing up. Your resolve compounds.\n\n— The Sankalp team`

  const html = `
<div style="font-family: ui-sans-serif, system-ui, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
  <div style="background: linear-gradient(135deg, #10b981, #f59e0b); padding: 24px; border-radius: 16px; color: white; text-align: center; margin-bottom: 24px;">
    <h1 style="margin: 0; font-size: 22px;">Your Sankalp week</h1>
    <p style="margin: 8px 0 0; opacity: 0.9;">Hi ${user.profile.displayName}, here's how last week went 🔥</p>
  </div>
  <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px;">
    <div style="background: #f3f4f6; padding: 16px; border-radius: 12px; text-align: center;">
      <div style="font-size: 28px; font-weight: 700; color: #10b981;">${formatMinutes(totalMinutes)}</div>
      <div style="font-size: 12px; color: #6b7280;">Total studied</div>
    </div>
    <div style="background: #f3f4f6; padding: 16px; border-radius: 12px; text-align: center;">
      <div style="font-size: 28px; font-weight: 700; color: #f59e0b;">${sessions.length}</div>
      <div style="font-size: 12px; color: #6b7280;">Sessions</div>
    </div>
    <div style="background: #f3f4f6; padding: 16px; border-radius: 12px; text-align: center;">
      <div style="font-size: 28px; font-weight: 700; color: #ef4444;">${stats.streak.current}d</div>
      <div style="font-size: 12px; color: #6b7280;">Current streak</div>
    </div>
    <div style="background: #f3f4f6; padding: 16px; border-radius: 12px; text-align: center;">
      <div style="font-size: 28px; font-weight: 700; color: #8b5cf6;">Lvl ${stats.level}</div>
      <div style="font-size: 12px; color: #6b7280;">Your level</div>
    </div>
  </div>
  ${bestDay ? `<p style="text-align: center; color: #374151;">🏆 Best day: <strong>${bestDay[0]}</strong> with ${formatMinutes(bestDay[1])}</p>` : ""}
  <p style="text-align: center; color: #6b7280; font-size: 14px;">Days you hit your goal: ${goalHitDays}/7</p>
  <div style="text-align: center; margin-top: 32px;">
    <a href="https://sankalp.in/#/dashboard" style="background: #10b981; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; display: inline-block;">Keep studying</a>
  </div>
  <p style="text-align: center; color: #9ca3af; font-size: 11px; margin-top: 24px;">You're receiving this because you studied on Sankalp this week. Manage preferences in Settings.</p>
</div>
`

  return { to: user.email, subject, html, text, stats }
}

// "Send" the recap — in production this calls Resend's API.
// In the sandbox it logs the email + returns whether it would have sent.
export async function sendWeeklyRecap(userId: string): Promise<{ sent: boolean; email: RecapEmail | null }> {
  const email = await buildWeeklyRecap(userId)
  if (!email) return { sent: false, email: null }
  // PRODUCTION: call Resend here:
  //   await fetch("https://api.resend.com/emails", {
  //     method: "POST",
  //     headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
  //     body: JSON.stringify({ from: "Sankalp <recap@sankalp.in>", to: email.to, subject: email.subject, html: email.html }),
  //   })
  // SANDBOX: log + record an audit entry
  console.log(`[email] weekly recap to ${email.to}: ${email.subject}`)
  await db.auditLog.create({
    data: {
      actorId: userId,
      action: "weekly_recap_sent",
      targetType: "user",
      targetId: userId,
      metadata: JSON.stringify({ to: email.to, subject: email.subject, stats: email.stats }),
    },
  })
  return { sent: true, email }
}
