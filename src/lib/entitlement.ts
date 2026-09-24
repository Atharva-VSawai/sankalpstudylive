import { db } from "@/lib/db"
import { isPaidPlanActive } from "@/lib/pricing"
import { FREE_ROOM_ALLOWANCE_SECONDS, FREE_ROOM_WINDOW_MS } from "@/lib/pricing"
import { resolveVideoQualityPolicy, videoQualityPolicyToResponse, VideoQualityPolicyResponse } from "@/lib/video-quality"

// ─────────────────────────────────────────────────────────────────────────────
// FREE LIVE-ROOM ALLOWANCE — server-authoritative entitlement engine.
// ─────────────────────────────────────────────────────────────────────────────
// ONE global allowance per user: 30 minutes per rolling 34 hours, shared across
// ALL live study rooms on the platform. The server is the source of truth; the
// frontend countdown is purely visual and may be freely manipulated by the user
// without affecting their real entitlement.
//
// Key invariants:
//   - Only ONE active live-room session per user at a time. A new join
//     auto-closes the previous one first (server-side, idempotent).
//   - Consumed time is computed from server clocks (StudySession.startedAt vs
//     server now), never from client-submitted durations.
//   - The 34-hour window resets server-side when now - windowStartedAt >= 34h.
//   - Paid users (isPaidPlanActive) bypass the allowance entirely.
//
// All public functions here are safe to call from API routes. They never trust
// client-supplied time/duration values.

export type Entitlement = {
  isPaid: boolean
  canJoinLiveRoom: boolean
  remainingFreeSeconds: number // 0 if paid (unlimited) — client shows no countdown
  consumedFreeSeconds: number
  windowStartedAt: Date
  windowResetsAt: Date // windowStartedAt + 34h
  allowanceSeconds: number
  hasActiveSession: boolean
  activeSessionId: string | null
  activeRoomId: string | null
  activeSessionStartedAt: Date | null
  warningShown: boolean
  // Server-authoritative video-quality policy for the room (subscriber-side caps).
  // The client applies these via LiveKit RemoteTrackPublication.setVideoQuality.
  // The server NEVER accepts these values back as authoritative input.
  videoQuality: VideoQualityPolicyResponse
}

// ── Get-or-create the allowance row for a user, applying a 34h reset if due. ──
// This is the ONLY function that mutates the window reset. It must be called
// before any read of consumedSeconds so the window is current.
async function getAllowanceRow(userId: string) {
  const now = new Date()
  let row = await db.freeRoomAllowance.findUnique({ where: { userId } })
  if (!row) {
    row = await db.freeRoomAllowance.create({ data: { userId } })
    return row
  }
  // Reset the rolling 34h window if it has expired.
  if (now.getTime() - row.windowStartedAt.getTime() >= FREE_ROOM_WINDOW_MS) {
    row = await db.freeRoomAllowance.update({
      where: { userId },
      data: {
        windowStartedAt: now,
        consumedSeconds: 0,
        warningShownAt: null,
        // Also clear any stale active session — a window reset implies the
        // previous session can no longer accrue. If the client is still in a
        // room, it will re-establish a session on the next token/heartbeat.
        activeSessionStartedAt: null,
        activeSessionId: null,
        activeRoomId: null,
        lastHeartbeatAt: null,
      },
    })
  }
  return row
}

// ── Compute live elapsed seconds for the current active session. ──
// Server-clock based. Capped at the allowance so a runaway session can't
// produce a negative remaining.
function liveElapsedSeconds(row: { activeSessionStartedAt: Date | null; lastHeartbeatAt: Date | null }): number {
  if (!row.activeSessionStartedAt) return 0
  const now = new Date()
  // Cap the elapsed at the last heartbeat + a small grace (10s) so a
  // disconnected client doesn't keep accruing time after they drop. The clean
  // leave path will close the session with the real endedAt. This cap only
  // matters if the client never sent a leave (crash, network loss).
  const cap = row.lastHeartbeatAt ? new Date(row.lastHeartbeatAt.getTime() + 10_000) : now
  const end = cap.getTime() < now.getTime() ? cap : now
  return Math.max(0, Math.floor((end.getTime() - row.activeSessionStartedAt.getTime()) / 1000))
}

// ── Public: read the user's full entitlement. Never throws. ──
export async function getEntitlement(userId: string): Promise<Entitlement> {
  const [sub, row] = await Promise.all([
    db.subscription.findUnique({ where: { userId } }),
    getAllowanceRow(userId),
  ])
  const isPaid = isPaidPlanActive(sub)
  const live = liveElapsedSeconds(row)
  const consumed = row.consumedSeconds + live
  const remaining = isPaid ? 0 : Math.max(0, FREE_ROOM_ALLOWANCE_SECONDS - consumed)
  const windowResetsAt = new Date(row.windowStartedAt.getTime() + FREE_ROOM_WINDOW_MS)
  const videoQuality = videoQualityPolicyToResponse(resolveVideoQualityPolicy(sub))
  return {
    isPaid,
    canJoinLiveRoom: isPaid || remaining > 0,
    remainingFreeSeconds: isPaid ? 0 : remaining,
    consumedFreeSeconds: isPaid ? 0 : consumed,
    windowStartedAt: row.windowStartedAt,
    windowResetsAt,
    allowanceSeconds: FREE_ROOM_ALLOWANCE_SECONDS,
    hasActiveSession: !!row.activeSessionStartedAt,
    activeSessionId: row.activeSessionId,
    activeRoomId: row.activeRoomId,
    activeSessionStartedAt: row.activeSessionStartedAt,
    warningShown: !!row.warningShownAt,
    videoQuality,
  }
}

// ── Public: can the user join a live room right now? (server-authoritative) ──
// Returns the entitlement so the caller can also return it to the client.
export async function canJoinLiveRoom(userId: string): Promise<{ allowed: boolean; entitlement: Entitlement }> {
  const ent = await getEntitlement(userId)
  return { allowed: ent.canJoinLiveRoom, entitlement: ent }
}

// ── Public: begin a live-room session for the user. ──
// Idempotent: if the user already has an active session, it is closed first
// (server-side) and its consumed time is persisted. This is the single point
// that accrues time for the previous session when starting a new one, and it
// prevents multi-tab/multi-room double-counting because only one active
// session row exists per user.
//
// `studySessionId` is the StudySession.id created by /api/study/sessions.
// `roomId` is the room being joined.
//
// Returns the updated entitlement (with the NEW session active).
export async function beginLiveRoomSession(
  userId: string,
  studySessionId: string,
  roomId: string
): Promise<Entitlement> {
  // 1. Close any prior active session (accrue its time into consumedSeconds).
  await closeActiveLiveRoomSession(userId)

  // Re-check AFTER closing the previous session. Closing it may consume the
  // final seconds, so a check performed only before the close is bypassable.
  const { allowed } = await canJoinLiveRoom(userId)
  if (!allowed) {
    throw new FreeAllowanceExhaustedError()
  }

  // 2. Mark the new active session.
  const now = new Date()
  await db.freeRoomAllowance.update({
    where: { userId },
    data: {
      activeSessionStartedAt: now,
      activeSessionId: studySessionId,
      activeRoomId: roomId,
      lastHeartbeatAt: now,
    },
  })
  return getEntitlement(userId)
}

export class FreeAllowanceExhaustedError extends Error {
  code = "FREE_ALLOWANCE_EXHAUSTED"
  constructor() {
    super("Free live-room allowance exhausted")
    this.name = "FreeAllowanceExhaustedError"
  }
}

// ── Public: close the user's current live-room session (if any). ──
// Accrues the elapsed time into consumedSeconds. Idempotent: safe to call when
// there is no active session. Returns the accrued seconds (0 if no session).
//
// This is the single source of truth for "the user stopped being in a live
// room." Called by: token endpoint (when starting a new session), leave-room
// flow, heartbeat (when it detects exhaustion), presence-leave, and the
// study-session stop route.
export async function closeActiveLiveRoomSession(userId: string, endedAt?: Date): Promise<number> {
  const row = await getAllowanceRow(userId)
  if (!row.activeSessionStartedAt) return 0
  const end = endedAt ?? new Date()
  const cappedEnd = row.lastHeartbeatAt
    ? new Date(Math.min(end.getTime(), row.lastHeartbeatAt.getTime() + 10_000))
    : end
  const elapsed = Math.max(0, Math.floor((cappedEnd.getTime() - row.activeSessionStartedAt!.getTime()) / 1000))
  // Cap the accrued time so a session that ran past 0 still only counts up to
  // the allowance (prevents negative remaining if the client was slow to leave).
  const remainingBefore = Math.max(0, FREE_ROOM_ALLOWANCE_SECONDS - row.consumedSeconds)
  const accrual = Math.min(elapsed, remainingBefore)
  const closed = await db.freeRoomAllowance.updateMany({
    where: { userId, activeSessionId: row.activeSessionId, activeSessionStartedAt: { not: null } },
    data: {
      consumedSeconds: { increment: accrual },
      activeSessionStartedAt: null,
      activeSessionId: null,
      activeRoomId: null,
      lastHeartbeatAt: null,
    },
  })
  return closed.count ? accrual : 0
}

// ── Public: record a heartbeat from the client while in a room. ──
// This does NOT accrue time (time accrues on close). It only updates
// lastHeartbeatAt so the live-elapsed cap stays accurate. The heartbeat also
// returns the current entitlement so the client can detect exhaustion and
// disconnect itself.
export async function heartbeatLiveRoomSession(userId: string, roomId: string): Promise<Entitlement> {
  await db.freeRoomAllowance.update({
    where: { userId },
    data: { lastHeartbeatAt: new Date(), activeRoomId: roomId },
  })
  return getEntitlement(userId)
}

// ── Public: mark the 5-minute warning as shown for this window. ──
// Idempotent: setting it again is a no-op. The warning is shown ONCE per
// window; the flag clears on the 34h reset.
export async function markWarningShown(userId: string): Promise<void> {
  await db.freeRoomAllowance.update({
    where: { userId },
    data: { warningShownAt: new Date() },
  })
}

// ── Public: helper to format an entitlement for API responses. ──
// This is the shape the Android app and the web client both consume. The
// server NEVER accepts these values back as authoritative input.
export function entitlementToResponse(ent: Entitlement) {
  return {
    canJoinLiveRoom: ent.canJoinLiveRoom,
    isPaid: ent.isPaid,
    remainingFreeSeconds: ent.remainingFreeSeconds,
    consumedFreeSeconds: ent.consumedFreeSeconds,
    allowanceSeconds: ent.allowanceSeconds,
    windowStartedAt: ent.windowStartedAt.toISOString(),
    windowResetsAt: ent.windowResetsAt.toISOString(),
    hasActiveSession: ent.hasActiveSession,
    activeSessionId: ent.activeSessionId,
    activeRoomId: ent.activeRoomId,
    warningShown: ent.warningShown,
    videoQuality: ent.videoQuality,
  }
}
