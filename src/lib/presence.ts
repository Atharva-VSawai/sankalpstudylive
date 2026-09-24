// In-memory presence store — sandbox stand-in for Redis pub/sub + presence.
// Production: Redis HASH per room + pub/sub channels. See docs/architecture.md.

export type PresenceParticipant = {
  userId: string
  username: string
  displayName: string
  avatarUrl?: string
  micOn: boolean
  camOn: boolean
  isSpeaking: boolean
  role: "host" | "co_host" | "participant" | "viewer"
  joinedAt: number
  lastSeenAt: number
  handRaised?: boolean
  handRaisedAt?: number | null
}

type RoomState = {
  participants: Map<string, PresenceParticipant> // userId -> participant
  messages: {
    id: string
    userId: string
    username: string
    text: string
    isSystem: boolean
    createdAt: number
  }[]
  timer: {
    mode: "focus" | "break" | "idle"
    endsAt: number | null // epoch ms
    round: number
    focusMin: number
    breakMin: number
    startedBy: string | null
  }
}

const rooms = new Map<string, RoomState>()
const listeners = new Map<string, Set<(evt: any) => void>>()

export function getRoom(roomId: string): RoomState {
  let r = rooms.get(roomId)
  if (!r) {
    r = {
      participants: new Map(),
      messages: [],
      timer: { mode: "idle", endsAt: null, round: 0, focusMin: 25, breakMin: 5, startedBy: null },
    }
    rooms.set(roomId, r)
  }
  return r
}

export function joinRoom(
  roomId: string,
  p: Omit<PresenceParticipant, "lastSeenAt"> & { lastSeenAt?: number }
) {
  const r = getRoom(roomId)
  const now = Date.now()
  const existing = r.participants.get(p.userId)
  const participant: PresenceParticipant = {
    ...p,
    micOn: existing?.micOn ?? p.micOn,
    camOn: existing?.camOn ?? p.camOn,
    lastSeenAt: now,
  }
  r.participants.set(p.userId, participant)
  emit(roomId, { type: "presence", participants: listParticipants(roomId) })
  return participant
}

export function leaveRoom(roomId: string, userId: string) {
  const r = rooms.get(roomId)
  if (!r) return
  r.participants.delete(userId)
  emit(roomId, { type: "presence", participants: listParticipants(roomId) })
}

// Remove every participant from an ended room. Production replaces this
// in-memory store with the equivalent Redis room-key deletion.
export function clearRoom(roomId: string) {
  const r = rooms.get(roomId)
  if (!r) return
  r.participants.clear()
  emit(roomId, { type: "presence", participants: [] })
}

export function updateParticipant(roomId: string, userId: string, patch: Partial<PresenceParticipant>) {
  const r = getRoom(roomId)
  const p = r.participants.get(userId)
  if (!p) return null
  Object.assign(p, patch, { lastSeenAt: Date.now() })
  emit(roomId, { type: "presence", participants: listParticipants(roomId) })
  return p
}

export function heartbeat(roomId: string, userId: string) {
  const r = rooms.get(roomId)
  if (!r) return
  const p = r.participants.get(userId)
  if (p) p.lastSeenAt = Date.now()
}

export function listParticipants(roomId: string): PresenceParticipant[] {
  const r = rooms.get(roomId)
  if (!r) return []
  return Array.from(r.participants.values())
}

export function postMessage(
  roomId: string,
  userId: string,
  username: string,
  text: string,
  isSystem = false
) {
  const r = getRoom(roomId)
  const msg = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId,
    username,
    text,
    isSystem,
    createdAt: Date.now(),
  }
  r.messages.push(msg)
  if (r.messages.length > 200) r.messages.shift()
  emit(roomId, { type: "message", message: msg })
  return msg
}

export function listMessages(roomId: string, limit = 50) {
  const r = rooms.get(roomId)
  if (!r) return []
  return r.messages.slice(-limit)
}

// Ephemeral emoji reactions (not persisted). Each reaction is broadcast once
// and clients render a floating animation; we keep a small recent buffer so
// late-joiners see the latest reactions.
type Reaction = {
  id: string
  userId: string
  username: string
  emoji: string
  createdAt: number
}

export function sendReaction(roomId: string, userId: string, username: string, emoji: string): Reaction {
  const r = getRoom(roomId)
  const reaction: Reaction = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    userId,
    username,
    emoji: emoji.slice(0, 8), // keep it tiny
    createdAt: Date.now(),
  }
  // keep last 30 for late joiners
  ;(r as any).reactions = (r as any).reactions ?? []
  ;(r as any).reactions.push(reaction)
  if ((r as any).reactions.length > 30) (r as any).reactions.shift()
  emit(roomId, { type: "reaction", reaction })
  return reaction
}

export function listReactions(roomId: string, limit = 30): Reaction[] {
  const r = rooms.get(roomId)
  if (!r) return []
  return ((r as any).reactions ?? []).slice(-limit)
}

// Shared whiteboard strokes (ephemeral, kept small for late joiners).
// Production: would use a CRDT; this is a simple append-only stroke list.
export type WhiteboardStroke = {
  id: string
  userId: string
  username: string
  color: string
  points: { x: number; y: number }[] // normalized 0..1
  createdAt: number
}

export function addWhiteboardStroke(roomId: string, stroke: Omit<WhiteboardStroke, "id" | "createdAt">): WhiteboardStroke {
  const r = getRoom(roomId)
  const s: WhiteboardStroke = {
    ...stroke,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: Date.now(),
  }
  ;(r as any).whiteboard = (r as any).whiteboard ?? []
  ;(r as any).whiteboard.push(s)
  // cap at 200 strokes to keep memory bounded
  if ((r as any).whiteboard.length > 200) (r as any).whiteboard = (r as any).whiteboard.slice(-200)
  emit(roomId, { type: "whiteboard", stroke: s })
  return s
}

export function listWhiteboardStrokes(roomId: string): WhiteboardStroke[] {
  const r = rooms.get(roomId)
  if (!r) return []
  return (r as any).whiteboard ?? []
}

export function clearWhiteboard(roomId: string, userId: string) {
  const r = rooms.get(roomId)
  if (!r) return
  ;(r as any).whiteboard = []
  emit(roomId, { type: "whiteboard_clear", userId })
}

// Undo the most recent stroke by `userId` (for the whiteboard).
export function undoWhiteboardStroke(roomId: string, userId: string): WhiteboardStroke | null {
  const r = rooms.get(roomId)
  if (!r) return null
  const strokes: WhiteboardStroke[] = (r as any).whiteboard ?? []
  // find last index by this user
  let lastIdx = -1
  for (let i = strokes.length - 1; i >= 0; i--) {
    if (strokes[i].userId === userId) { lastIdx = i; break }
  }
  if (lastIdx === -1) return null
  const removed = strokes.splice(lastIdx, 1)[0]
  emit(roomId, { type: "whiteboard_undo", strokeId: removed.id, userId })
  return removed
}

export function setTimer(
  roomId: string,
  mode: "focus" | "break" | "idle",
  minutes: number,
  startedBy: string
) {
  const r = getRoom(roomId)
  r.timer = {
    mode,
    endsAt: mode === "idle" ? null : Date.now() + minutes * 60_000,
    round: mode === "focus" ? r.timer.round + 1 : r.timer.round,
    focusMin: r.timer.focusMin,
    breakMin: r.timer.breakMin,
    startedBy,
  }
  emit(roomId, { type: "timer", timer: r.timer })
  return r.timer
}

export function stopTimer(roomId: string) {
  const r = rooms.get(roomId)
  if (!r) return
  r.timer = { ...r.timer, mode: "idle", endsAt: null }
  emit(roomId, { type: "timer", timer: r.timer })
}

export function getTimer(roomId: string) {
  return getRoom(roomId).timer
}

export function subscribe(roomId: string, cb: (evt: any) => void): () => void {
  let set = listeners.get(roomId)
  if (!set) {
    set = new Set()
    listeners.set(roomId, set)
  }
  set.add(cb)
  return () => {
    set!.delete(cb)
    if (set!.size === 0) listeners.delete(roomId)
  }
}

function emit(roomId: string, evt: any) {
  const set = listeners.get(roomId)
  if (!set) return
  for (const cb of set) cb(evt)
}

// Reap stale participants (no heartbeat in 45s)
export function reapStale(roomId: string, maxAgeMs = 45_000) {
  const r = rooms.get(roomId)
  if (!r) return
  const now = Date.now()
  let changed = false
  for (const [uid, p] of r.participants) {
    if (now - p.lastSeenAt > maxAgeMs) {
      r.participants.delete(uid)
      changed = true
    }
  }
  if (changed) emit(roomId, { type: "presence", participants: listParticipants(roomId) })
}
