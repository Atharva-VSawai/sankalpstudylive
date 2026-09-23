import { db } from "@/lib/db"
import { hashPassword } from "@/lib/auth"

const COMMUNITIES = [
  { slug: "gate", name: "GATE", description: "Graduate Aptitude Test in Engineering — for engineering graduates targeting PSUs and M.Tech admissions.", examGoal: "GATE", color: "#10b981", tags: ["engineering", "psu", "mtech"] },
  { slug: "jee", name: "JEE", description: "Joint Entrance Examination — for aspirants targeting IITs, NITs and top engineering colleges.", examGoal: "JEE", color: "#f59e0b", tags: ["engineering", "iit", "12th"] },
  { slug: "neet", name: "NEET", description: "National Eligibility cum Entrance Test — for future doctors targeting MBBS/BDS seats.", examGoal: "NEET", color: "#ef4444", tags: ["medical", "mbbs", "12th"] },
  { slug: "upsc", name: "UPSC", description: "Civil Services Examination — for future IAS, IPS, IFS officers and public servants.", examGoal: "UPSC", color: "#8b5cf6", tags: ["civil-services", "ias", "gs"] },
  { slug: "cat", name: "CAT", description: "Common Admission Test — for MBA aspirants targeting IIMs and top B-schools.", examGoal: "CAT", color: "#0ea5e9", tags: ["mba", "iim", "aptitude"] },
  { slug: "ssc", name: "SSC", description: "Staff Selection Commission — for government job aspirants (CGL, CHSL, MTS).", examGoal: "SSC", color: "#14b8a6", tags: ["govt-jobs", "cgl", "reasoning"] },
  { slug: "banking", name: "Banking", description: "Bank PO, Clerk, RRB exams — IBPS, SBI and RBI preparations.", examGoal: "Banking", color: "#eab308", tags: ["bank-po", "ibps", "sbi"] },
  { slug: "mpsc", name: "MPSC", description: "Maharashtra Public Service Commission — state civil services preparation.", examGoal: "MPSC", color: "#a855f7", tags: ["maharashtra", "state-psc", "gs"] },
  { slug: "placements", name: "Placements", description: "Campus placements — coding rounds, aptitude, group discussions and interviews.", examGoal: "Placements", color: "#ec4899", tags: ["placements", "interview", "coding"] },
  { slug: "dsa", name: "DSA", description: "Data Structures & Algorithms — LeetCode, Codeforces, competitive programming and interview prep.", examGoal: "DSA", color: "#22c55e", tags: ["coding", "leetcode", "interview"] },
  { slug: "general", name: "General Study", description: "For everyone — open study rooms for self-study, assignments and any exam.", examGoal: "General Study", color: "#64748b", tags: ["open", "self-study", "any"] },
]

const BADGES = [
  { slug: "first_session", name: "First Steps", description: "Completed your first study session.", tier: "bronze", xpReward: 50 },
  { slug: "streak_7", name: "Week Warrior", description: "Studied 7 days in a row.", tier: "bronze", xpReward: 100 },
  { slug: "streak_30", name: "Monthly Resolve", description: "Studied 30 days in a row.", tier: "silver", xpReward: 300 },
  { slug: "streak_100", name: "Century of Focus", description: "Studied 100 days in a row.", tier: "gold", xpReward: 1000 },
  { slug: "night_owl", name: "Night Owl", description: "Studied after midnight.", tier: "bronze", xpReward: 50 },
  { slug: "early_bird", name: "Early Bird", description: "Studied before 6 AM.", tier: "bronze", xpReward: 50 },
  { slug: "goal_master", name: "Goal Master", description: "Hit your daily goal 10 times.", tier: "silver", xpReward: 250 },
  { slug: "social_learner", name: "Social Learner", description: "Studied with 5 friends.", tier: "bronze", xpReward: 100 },
  { slug: "room_host", name: "Room Host", description: "Hosted your first live room.", tier: "bronze", xpReward: 100 },
  { slug: "marathon", name: "Marathon", description: "Studied 4+ hours in a single session.", tier: "gold", xpReward: 500 },
  { slug: "level_10", name: "Level 10", description: "Reached level 10.", tier: "gold", xpReward: 500 },
  { slug: "level_25", name: "Level 25", description: "Reached level 25.", tier: "platinum", xpReward: 2000 },
]

async function main() {
  console.log("Seeding communities…")
  for (const c of COMMUNITIES) {
    await db.community.upsert({
      where: { slug: c.slug },
      create: { ...c, tags: JSON.stringify(c.tags), isFeatured: ["gate", "jee", "neet", "upsc", "dsa"].includes(c.slug) },
      update: { ...c, tags: JSON.stringify(c.tags) },
    })
  }

  console.log("Seeding badges…")
  for (const b of BADGES) {
    await db.badge.upsert({
      where: { slug: b.slug },
      create: b,
      update: b,
    })
  }

  // Demo admin + a few demo users with realistic Indian names for leaderboards
  const demoUsers = [
    { email: "admin@sankalp.in", username: "admin", displayName: "Sankalp Admin", role: "admin", examGoal: "General Study", password: "admin123" },
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
    await db.subscription.create({ data: { userId: user.id, plan: u.role === "admin" ? "pro" : "free" } })
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
