import { db } from "../src/lib/db"

// Seeds database-backed weekly leaderboard fixtures without creating study
// sessions or changing users' actual time, XP, goals, streaks, or badges.
// Re-running this script replaces only the demo leaderboard scope.
const DEMO_SCOPE = "global_demo"

async function main() {
  const users = await db.user.findMany({
    where: { profile: { isNot: null } },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  })

  await db.leaderboardSnapshot.deleteMany({ where: { scope: DEMO_SCOPE, period: "weekly" } })

  await db.leaderboardSnapshot.createMany({
    data: users.map((user, index) => {
      // Deterministic spread: every database user appears, with enough range
      // to make the weekly top ordering easy to verify locally.
      const minutes = Math.max(45, 360 - index * 11)
      return {
        scope: DEMO_SCOPE,
        period: "weekly",
        userId: user.id,
        rank: index + 1,
        minutes,
        xp: minutes * 10,
      }
    }),
  })

  console.log(`Seeded ${users.length} database users into the demo weekly leaderboard.`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
}).finally(async () => {
  await db.$disconnect()
})
