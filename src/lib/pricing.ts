// Shared pricing/subscription logic — server-authoritative.
// Used by the subscriptions API, room token API, and room-usage API.

// ── FREE LIVE-ROOM ALLOWANCE ──
// Free users get FREE_ROOM_ALLOWANCE_SECONDS (1800 = 30 min) of live study-room
// access per rolling FREE_ROOM_WINDOW_MS (34h) period. The allowance is GLOBAL
// across the entire platform (not per-room, not per-session, not per-device).
// The server is the source of truth; the frontend countdown is purely visual.
// See src/lib/entitlement.ts for the authoritative logic.
export const FREE_ROOM_ALLOWANCE_SECONDS = 30 * 60 // 30 minutes
export const FREE_ROOM_WINDOW_MS = 34 * 60 * 60 * 1000 // 34 hours
// Legacy alias kept for any code still importing the old name. The new logic
// does NOT use this — it uses FREE_ROOM_ALLOWANCE_SECONDS + FREE_ROOM_WINDOW_MS.
export const FREE_ALLOWANCE_MIN = 30

// Plan definitions. Amounts in paise (INR).
export const PLANS = {
  free:       { name: "Free",        price: 0,    durationMs: 0,                   recurring: false },
  focus_pass: { name: "Focus Pass",  price: 1400, durationMs: 24 * 3600_000,        recurring: false }, // ₹14, 24h
  monthly:    { name: "Monthly",    price: 17900, durationMs: 30 * 86400_000,       recurring: true },  // ₹179/mo
  halfyear:   { name: "6 Months",   price: 69900, durationMs: 182 * 86400_000,      recurring: false }, // ₹699, 6mo
  yearly:     { name: "Yearly",     price: 99900, durationMs: 365 * 86400_000,      recurring: false }, // ₹999, 12mo
} as const

export type PlanId = keyof typeof PLANS

export const PAID_PLANS: PlanId[] = ["focus_pass", "monthly", "halfyear", "yearly"]

export function isValidPlan(plan: string): plan is PlanId {
  return plan in PLANS
}

export function isPaidPlan(plan: string): boolean {
  return PAID_PLANS.includes(plan as PlanId)
}

// Check if a subscription record represents an active paid plan right now.
// A paid plan is active if:
//   - status === "active"
//   - plan is a paid plan
//   - expiresAt is null or in the future
export function isPaidPlanActive(sub: { plan: string; status: string; expiresAt: Date | string | null } | null): boolean {
  if (!sub) return false
  if (sub.status !== "active") return false
  if (!isPaidPlan(sub.plan)) return false
  if (sub.expiresAt) {
    const exp = new Date(sub.expiresAt).getTime()
    if (exp < Date.now()) return false
  }
  return true
}

// Compute the expiry date for a plan starting now.
export function computeExpiry(plan: PlanId): Date | null {
  const p = PLANS[plan]
  if (p.durationMs === 0) return null
  return new Date(Date.now() + p.durationMs)
}

// Compute the renewal date (for monthly recurring only).
export function computeRenewal(plan: PlanId): Date | null {
  const p = PLANS[plan]
  if (!p.recurring) return null
  return new Date(Date.now() + p.durationMs)
}
