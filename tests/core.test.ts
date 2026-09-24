import { describe, expect, test } from "bun:test"
import {
  FREE_ROOM_ALLOWANCE_SECONDS,
  FREE_ROOM_WINDOW_MS,
  PLANS,
  computeExpiry,
  isPaidPlanActive,
} from "../src/lib/pricing"
import { isGeneralStudyRoom, isUnassignedNonGeneralRoom } from "../src/lib/room-access"
import { joinRoom, leaveRoom, listParticipants, reapStale } from "../src/lib/presence"

describe("pricing and entitlement invariants", () => {
  test("free allowance is exactly 30 minutes and resets after 24 hours", () => {
    expect(FREE_ROOM_ALLOWANCE_SECONDS).toBe(30 * 60)
    expect(FREE_ROOM_WINDOW_MS).toBe(24 * 60 * 60 * 1000)
  })

  test("paid entitlements bypass the free allowance", () => {
    expect(isPaidPlanActive({ plan: "yearly", status: "active", expiresAt: new Date(Date.now() + 60_000) })).toBe(true)
    expect(isPaidPlanActive({ plan: "yearly", status: "expired", expiresAt: new Date(Date.now() + 60_000) })).toBe(false)
    expect(isPaidPlanActive({ plan: "free", status: "active", expiresAt: null })).toBe(false)
  })

  test("paid plan expiry is computed from the configured plan duration", () => {
    const before = Date.now()
    const expiry = computeExpiry("focus_pass")!.getTime()
    expect(expiry).toBeGreaterThanOrEqual(before + PLANS.focus_pass.durationMs)
  })
})

describe("room classification invariants", () => {
  test("only General Study is platform-wide", () => {
    expect(isGeneralStudyRoom({ name: "Anything", communityId: "x", isDefaultRoom: false, community: { slug: "general" } })).toBe(true)
    expect(isGeneralStudyRoom({ name: "General Study Focus Room", communityId: null, isDefaultRoom: true, community: null })).toBe(true)
    expect(isUnassignedNonGeneralRoom({ name: "Anything", communityId: null, isDefaultRoom: false, community: null })).toBe(true)
  })
})

describe("ephemeral presence invariants", () => {
  test("joining twice keeps one participant and leaving removes it", () => {
    const roomId = "test-presence-" + crypto.randomUUID()
    const userId = crypto.randomUUID()
    joinRoom(roomId, {
      userId,
      username: "tester",
      displayName: "Tester",
      micOn: false,
      camOn: false,
      isSpeaking: false,
      role: "participant",
      joinedAt: Date.now(),
    })
    joinRoom(roomId, {
      userId,
      username: "tester",
      displayName: "Tester",
      micOn: false,
      camOn: false,
      isSpeaking: false,
      role: "participant",
      joinedAt: Date.now(),
    })
    expect(listParticipants(roomId)).toHaveLength(1)
    leaveRoom(roomId, userId)
    expect(listParticipants(roomId)).toHaveLength(0)
  })

  test("stale participants are removed before counts are published", () => {
    const roomId = "test-stale-" + crypto.randomUUID()
    joinRoom(roomId, {
      userId: crypto.randomUUID(),
      username: "stale",
      displayName: "Stale",
      micOn: false,
      camOn: false,
      isSpeaking: false,
      role: "participant",
      joinedAt: Date.now(),
    })
    reapStale(roomId, -1)
    expect(listParticipants(roomId)).toHaveLength(0)
  })
})
