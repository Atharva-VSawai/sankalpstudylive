import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { getAuth, ok, badRequest, unauthorized } from "@/lib/api"
import { loadMe } from "@/lib/me"

const EXAMS = ["GATE", "JEE", "NEET", "UPSC", "CAT", "SSC", "Banking", "MPSC", "Placements", "DSA", "General Study"]

// PATCH /api/onboarding — completes study-goal onboarding
export async function PATCH(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const body = await req.json().catch(() => null)
  const displayName = String(body?.displayName || "").trim()
  const username = String(body?.username || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "")
  const examGoal = String(body?.examGoal || "").trim()
  const targetYear = body?.targetYear ? Number(body.targetYear) : null
  const studyHoursGoal = body?.studyHoursGoal ? Number(body.studyHoursGoal) : 360 // minutes/day

  if (!displayName || displayName.length < 2) return badRequest("Display name is required")
  if (!username || username.length < 3) return badRequest("Username must be at least 3 characters (a–z, 0–9, _)")
  if (!EXAMS.includes(examGoal)) return badRequest("Pick a valid exam goal")
  if (targetYear && (targetYear < 2024 || targetYear > 2035)) return badRequest("Invalid target year")
  if (studyHoursGoal < 15 || studyHoursGoal > 1440) return badRequest("Daily goal must be 15–1440 minutes")

  const taken = await db.profile.findFirst({ where: { username, userId: { not: ctx.userId } } })
  if (taken) return badRequest("That username is taken", "USERNAME_TAKEN")

  await db.profile.update({
    where: { userId: ctx.userId },
    data: { displayName, username, examGoal, targetYear, studyHoursGoal, onboardingComplete: true },
  })
  await db.user.update({ where: { id: ctx.userId }, data: { emailVerifiedAt: new Date() } })

  // Auto-join the community matching the exam goal (the user's FIRST community).
  // A new user has 0 memberships, so this is always within the max-2 limit.
  // We use upsert so re-running onboarding (e.g. user edits exam goal) doesn't
  // create a duplicate membership; only increment memberCount on first join.
  const community = await db.community.findUnique({ where: { slug: slugify(examGoal) } })
  if (community) {
    const existing = await db.communityMember.findUnique({
      where: { communityId_userId: { communityId: community.id, userId: ctx.userId } },
    })
    if (!existing) {
      // Count current memberships; only join if under the max-2 limit.
      const count = await db.communityMember.count({ where: { userId: ctx.userId } })
      if (count < 2) {
        await db.communityMember.create({
          data: { communityId: community.id, userId: ctx.userId, role: "member" },
        })
        await db.community.update({
          where: { id: community.id },
          data: { memberCount: { increment: 1 } },
        })
      }
    }
  }
  const me = await loadMe(ctx.userId)
  return ok(me)
}

function slugify(s: string) {
  return s.toLowerCase().replace(/\s+/g, "-")
}
