import { db } from "@/lib/db"
import { hashPassword } from "@/lib/auth"

const ADMIN_EMAIL = "support@sankalpstudylive.in"
const LEGACY_ADMIN_EMAIL = "admin@sankalp.in"

const COMMUNITIES = [
  { slug: "general", name: "General Study", description: "For everyone — open study rooms for self-study, assignments and any exam.", examGoal: "General Study", color: "#64748b", tags: ["open", "self-study", "any"] },
  { slug: "gate", name: "GATE", description: "Graduate Aptitude Test in Engineering — for engineering graduates targeting PSUs and M.Tech admissions.", examGoal: "GATE", color: "#10b981", tags: ["engineering", "psu", "mtech"] },
  { slug: "jee", name: "JEE", description: "Joint Entrance Examination — for aspirants targeting IITs, NITs and top engineering colleges.", examGoal: "JEE", color: "#f59e0b", tags: ["engineering", "iit", "12th"] },
  { slug: "neet", name: "NEET", description: "National Eligibility cum Entrance Test — for future doctors targeting MBBS/BDS seats.", examGoal: "NEET", color: "#ef4444", tags: ["medical", "mbbs", "12th"] },
  { slug: "upsc", name: "UPSC", description: "Civil Services Examination — for future IAS, IPS, IFS officers and public servants.", examGoal: "UPSC", color: "#8b5cf6", tags: ["civil-services", "ias", "gs"] },
  { slug: "neet-pg", name: "NEET PG", description: "National Eligibility cum Entrance Test for postgraduate medical admissions.", examGoal: "NEET PG", color: "#dc2626", tags: ["medical", "pg", "residency"] },
  { slug: "cat", name: "CAT", description: "Common Admission Test — for MBA aspirants targeting IIMs and top B-schools.", examGoal: "CAT", color: "#0ea5e9", tags: ["mba", "iim", "aptitude"] },
  { slug: "ssc", name: "SSC", description: "Staff Selection Commission — for government job aspirants (CGL, CHSL, MTS).", examGoal: "SSC", color: "#14b8a6", tags: ["govt-jobs", "cgl", "reasoning"] },
  { slug: "banking", name: "Banking", description: "Bank PO, Clerk, RRB exams — IBPS, SBI and RBI preparations.", examGoal: "Banking", color: "#eab308", tags: ["bank-po", "ibps", "sbi"] },
  { slug: "mpsc", name: "MPSC", description: "Maharashtra Public Service Commission — state civil services preparation.", examGoal: "MPSC", color: "#a855f7", tags: ["maharashtra", "state-psc", "gs"] },
  { slug: "placements", name: "Placements", description: "Campus placements — coding rounds, aptitude, group discussions and interviews.", examGoal: "Placements", color: "#ec4899", tags: ["placements", "interview", "coding"] },
  { slug: "dsa", name: "DSA", description: "Data Structures & Algorithms — LeetCode, Codeforces, competitive programming and interview prep.", examGoal: "DSA", color: "#22c55e", tags: ["coding", "leetcode", "interview"] },
]

const BADGES = [
  { slug: "first_session", name: "First Focus", description: "Completed your first study session.", tier: "bronze", xpReward: 50 },
  { slug: "study_1h", name: "First Hour", description: "Studied for a total of 1 hour.", tier: "bronze", xpReward: 75 },
  { slug: "study_10h", name: "Building Momentum", description: "Studied for a total of 10 hours.", tier: "silver", xpReward: 200 },
  { slug: "study_50h", name: "Dedicated Learner", description: "Studied for a total of 50 hours.", tier: "gold", xpReward: 500 },
  { slug: "study_100h", name: "Century of Focus", description: "Studied for a total of 100 hours.", tier: "platinum", xpReward: 1000 },
  { slug: "streak_3", name: "Three-Day Start", description: "Studied on 3 consecutive days.", tier: "bronze", xpReward: 50 },
  { slug: "streak_7", name: "Week in Motion", description: "Studied on 7 consecutive days.", tier: "silver", xpReward: 125 },
  { slug: "streak_30", name: "Monthly Resolve", description: "Studied on 30 consecutive days.", tier: "gold", xpReward: 400 },
  { slug: "streak_100", name: "Unstoppable", description: "Studied on 100 consecutive days.", tier: "platinum", xpReward: 1200 },
  { slug: "goal_7", name: "Goal Setter", description: "Completed your daily goal on 7 days.", tier: "bronze", xpReward: 100 },
  { slug: "goal_30", name: "Goal Keeper", description: "Completed your daily goal on 30 days.", tier: "silver", xpReward: 350 },
  { slug: "early_bird", name: "Morning Momentum", description: "Completed a study session before 6 AM.", tier: "bronze", xpReward: 50 },
  { slug: "night_owl", name: "Late-Night Scholar", description: "Completed a study session between midnight and 4 AM.", tier: "bronze", xpReward: 50 },
  { slug: "deep_work", name: "Deep Work", description: "Completed a focused study session of at least 2 hours.", tier: "silver", xpReward: 200 },
  { slug: "marathon", name: "Study Marathon", description: "Completed a focused study session of at least 4 hours.", tier: "gold", xpReward: 500 },
  { slug: "room_first", name: "Room Regular", description: "Completed your first live-room study session.", tier: "bronze", xpReward: 75 },
  { slug: "room_10", name: "Shared Focus", description: "Completed 10 live-room study sessions.", tier: "silver", xpReward: 250 },
  { slug: "room_host", name: "Study Host", description: "Hosted your first live study room.", tier: "bronze", xpReward: 100 },
]

async function main() {
  // Backfill the one global allowance row for accounts created before free
  // live-room enforcement was added. createMany + skipDuplicates preserves
  // any existing consumed time, active session, and 24-hour window.
  const existingUsers = await db.user.findMany({ select: { id: true } })
  if (existingUsers.length) {
    await Promise.all(existingUsers.map(({ id }) => db.freeRoomAllowance.upsert({
      where: { userId: id },
      create: { userId: id },
      update: {},
    })))
    console.log(`Backfilled free-room allowances for ${existingUsers.length} accounts.`)
  }

  console.log("Seeding communities…")
  for (const c of COMMUNITIES) {
    await db.community.upsert({
      where: { slug: c.slug },
      create: { ...c, tags: JSON.stringify(c.tags), isFeatured: ["gate", "jee", "neet", "upsc", "dsa"].includes(c.slug) },
      update: { ...c, tags: JSON.stringify(c.tags) },
    })
  }

  console.log("Seeding badges…")
  const badgeSlugs = BADGES.map((b) => b.slug)
  const obsoleteBadges = await db.badge.findMany({ where: { slug: { notIn: badgeSlugs } }, select: { id: true } })
  if (obsoleteBadges.length) {
    await db.userBadge.deleteMany({ where: { badgeId: { in: obsoleteBadges.map((b) => b.id) } } })
    await db.badge.deleteMany({ where: { id: { in: obsoleteBadges.map((b) => b.id) } } })
  }
  for (const b of BADGES) {
    await db.badge.upsert({
      where: { slug: b.slug },
      create: b,
      update: b,
    })
  }

  // Demo admin + a few demo users with realistic Indian names for leaderboards
  // Migrate the original sandbox admin address without changing its password.
  const legacyAdmin = await db.user.findUnique({ where: { email: LEGACY_ADMIN_EMAIL } })
  const currentAdmin = await db.user.findUnique({ where: { email: ADMIN_EMAIL } })
  if (legacyAdmin && !currentAdmin) {
    await db.user.update({ where: { id: legacyAdmin.id }, data: { email: ADMIN_EMAIL } })
  }
  const demoUsers = [
    { email: ADMIN_EMAIL, username: "admin", displayName: "Sankalp Admin", role: "admin", examGoal: "General Study", password: "admin123" },
    { email: "aarav@sankalp.in", username: "aarav", displayName: "Aarav Sharma", role: "user", examGoal: "GATE", password: "demo1234" },
    { email: "diya@sankalp.in", username: "diya", displayName: "Diya Patel", role: "user", examGoal: "NEET", password: "demo1234" },
    { email: "vihaan@sankalp.in", username: "vihaan", displayName: "Vihaan Reddy", role: "user", examGoal: "UPSC", password: "demo1234" },
    { email: "ananya@sankalp.in", username: "ananya", displayName: "Ananya Iyer", role: "user", examGoal: "JEE", password: "demo1234" },
    { email: "kabir@sankalp.in", username: "kabir", displayName: "Kabir Singh", role: "user", examGoal: "CAT", password: "demo1234" },
    { email: "ishita@sankalp.in", username: "ishita", displayName: "Ishita Nair", role: "user", examGoal: "DSA", password: "demo1234" },
    { email: "arjun@sankalp.in", username: "arjun", displayName: "Arjun Verma", role: "user", examGoal: "SSC", password: "demo1234" },
  ]

  for (const u of demoUsers) {
    const existing = await db.user.findUnique({ where: { email: u.email } })
    if (existing) continue
    const user = await db.user.create({
      data: {
        email: u.email,
        passwordHash: hashPassword(u.password),
        role: u.role as string,
        emailVerifiedAt: new Date(),
      },
    })
    await db.profile.create({
      data: {
        userId: user.id,
        username: u.username,
        displayName: u.displayName,
        examGoal: u.examGoal,
        onboardingComplete: true,
      },
    })
    await db.streak.create({ data: { userId: user.id } })
    await db.subscription.create({ data: { userId: user.id, plan: "free" } })
  }

  // Give demo users some study history so leaderboards look alive (but truthful: these are demo accounts, clearly labeled)
  const allProfiles = await db.profile.findMany({ where: { username: { in: ["aarav", "diya", "vihaan", "ananya", "kabir", "ishita", "arjun"] } } })
  const now = new Date()
  for (const p of allProfiles) {
    const mins = Math.floor(Math.random() * 180) + 60
    const xp = mins * 10
    await db.studySession.create({
      data: {
        userId: p.userId,
        startedAt: new Date(now.getTime() - mins * 60000),
        endedAt: now,
        durationMin: mins,
        xpEarned: xp,
        mode: "focus",
      },
    })
    await db.profile.update({
      where: { id: p.id },
      data: {
        totalMinutes: { increment: mins },
        totalXp: { increment: xp },
        level: Math.floor(xp / 500) + 1,
      },
    })
    await db.streak.update({
      where: { userId: p.userId },
      data: { current: Math.floor(Math.random() * 12) + 1, longest: Math.floor(Math.random() * 20) + 5, lastStudyDate: now },
    })
  }

  // ── Seed permanent default Focus Rooms for each exam community ──
  console.log("Seeding default focus rooms…")
  // Find the admin user to be the owner of system rooms
  const adminUser = await db.user.findUnique({ where: { email: ADMIN_EMAIL } })
  const adminUserId = adminUser?.id ?? (await db.user.findFirst())?.id
  if (!adminUserId) {
    console.warn("No admin user found — skipping default room seed")
  } else {
    for (const c of COMMUNITIES) {
      const community = await db.community.findUnique({ where: { slug: c.slug } })
      if (!community) continue
      const roomName = `${c.name} Focus Room`
      // General Study is intentionally platform-wide, not community-gated.
      const roomCommunityId = c.slug === "general" ? null : community.id
      const existing = await db.room.findFirst({
        where: { name: roomName, isDefaultRoom: true },
      })
      if (existing) {
        if (c.slug === "general" && existing.communityId !== null) {
          await db.room.update({ where: { id: existing.id }, data: { communityId: null } })
        }
        continue // already seeded
      }
      await db.room.create({
        data: {
          name: roomName,
          description: `Study with other ${c.name} aspirants.`,
          ownerId: adminUserId,
          communityId: roomCommunityId,
          livekitRoom: `sankalp-default-${c.slug}`,
          isLive: true,
          isListed: true,
          isPrivate: false,
          isDefaultRoom: true,
          roomType: "DEFAULT",
          maxParticipants: 500,
          focusMode: true,
          pomodoroConfig: JSON.stringify({ focusMin: 25, breakMin: 5, longBreakMin: 15, rounds: 4 }),
          tags: JSON.stringify([c.slug, "focus", "default"]),
          startedAt: new Date(),
        },
      })
      console.log(`  ✓ ${roomName}`)
    }
  }

  console.log("Seed complete.")
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
