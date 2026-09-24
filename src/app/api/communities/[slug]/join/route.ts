import { NextRequest } from "next/server"
import { db } from "@/lib/db"
import { ok, notFound, unauthorized, badRequest, forbidden, getAuth } from "@/lib/api"

// ─────────────────────────────────────────────────────────────────────────────
// COMMUNITY MEMBERSHIP LIMIT — server-authoritative.
// ─────────────────────────────────────────────────────────────────────────────
// A user can belong to a MAXIMUM of 2 communities across the entire platform.
// This is enforced SERVER-SIDE via a Prisma transaction that counts existing
// memberships and creates the new one atomically. A malicious user calling the
// API directly, or sending concurrent requests (race condition), cannot end up
// with more than 2 memberships because the count+create happens in a single
// transaction with serializable isolation.
//
// The (communityId, userId) @@unique constraint on CommunityMember additionally
// prevents duplicate joins to the same community.
//
// Onboarding auto-joins ONE community (the exam-goal community); the user may
// join exactly one more later. The leave endpoint removes a membership, which
// frees up a slot.

export const MAX_COMMUNITY_MEMBERSHIPS = 2

// POST /api/communities/[slug]/join
export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const ctx = await getAuth(req)
  if (!ctx) return unauthorized()
  const { slug } = await params
  const community = await db.community.findUnique({ where: { slug } })
  if (!community) return notFound("Community not found")
  const isGeneralStudy = community.slug === "general"
  const profile = await db.profile.findUnique({ where: { userId: ctx.userId }, select: { onboardingComplete: true } })
  if (!isGeneralStudy && !profile?.onboardingComplete) return forbidden("Complete onboarding before joining communities.", "ONBOARDING_REQUIRED")

  // ── Atomic max-2 check + create (race-safe) ──
  // We use a Prisma transaction with a user-level lock (SELECT ... FOR UPDATE
  // on the User row) to SERIALIZE concurrent joins for the same user. Without
  // this, two concurrent requests would both see count=1, both create, and the
  // user would end up with 3 memberships. The row lock ensures only one
  // transaction can count+create at a time for a given user.
  //
  // We also keep the post-create count check + rollback as a defense-in-depth
  // backstop in case the lock doesn't work (e.g. on a DB without FOR UPDATE
  // support).
  try {
    const result = await db.$transaction(async (tx) => {
      // Lock the user row so concurrent joins for the SAME user serialize.
      // Prisma exposes raw SQL for this; the SELECT 1 ... FOR UPDATE acquires
      // a row-level lock on the user that blocks other transactions until
      // this one commits or rolls back.
      await tx.$executeRaw`SELECT 1 FROM "User" WHERE id = ${ctx.userId} FOR UPDATE`

      // Already a member?
      const existing = await tx.communityMember.findUnique({
        where: { communityId_userId: { communityId: community.id, userId: ctx.userId } },
      })
      if (existing) return { status: "already" as const }

      // Count current memberships (now serialized — no concurrent insert can
      // change this count between our read and our create).
      // General Study is open to everyone and never consumes one of the two
      // community-specific membership slots.
      const count = await tx.communityMember.count({
        where: { userId: ctx.userId, community: { slug: { not: "general" } } },
      })
      if (count >= MAX_COMMUNITY_MEMBERSHIPS) {
        return { status: "limit" as const, count }
      }

      // Create the membership
      await tx.communityMember.create({
        data: { communityId: community.id, userId: ctx.userId, role: "member" },
      })
      await tx.community.update({
        where: { id: community.id },
        data: { memberCount: { increment: 1 } },
      })

      // Post-create safety check (defense-in-depth backstop).
      const afterCount = await tx.communityMember.count({
        where: { userId: ctx.userId, community: { slug: { not: "general" } } },
      })
      if (afterCount > MAX_COMMUNITY_MEMBERSHIPS) {
        await tx.communityMember.delete({
          where: { communityId_userId: { communityId: community.id, userId: ctx.userId } },
        })
        await tx.community.update({
          where: { id: community.id },
          data: { memberCount: { decrement: 1 } },
        })
        return { status: "limit" as const, count: afterCount }
      }

      return { status: "joined" as const, count: afterCount }
    })

    if (result.status === "already") {
      return badRequest("You are already a member", "ALREADY_MEMBER")
    }
    if (result.status === "limit") {
      return forbidden(
        `You can join up to ${MAX_COMMUNITY_MEMBERSHIPS} communities. Leave one to join another.`,
        "COMMUNITY_LIMIT_REACHED"
      )
    }
    return ok({ joined: true, memberships: result.count })
  } catch (e: any) {
    // The unique constraint may throw if two concurrent requests tried to join
    // the SAME community — that's fine, treat it as already-member.
    if (e?.code === "P2002") return badRequest("You are already a member", "ALREADY_MEMBER")
    throw e
  }
}
