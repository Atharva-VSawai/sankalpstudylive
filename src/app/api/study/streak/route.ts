import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, unauthorized, getAuth } from "@/lib/api"

// GET /api/study/streak
export async function GET(req: NextRequest) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const streak = await db.streak.findUnique({ where: { userId: ctx.userId } })
  return ok(streak ?? { current: 0, longest: 0, lastStudyDate: null })
}
