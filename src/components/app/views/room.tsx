"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api, getToken } from "@/lib/api-client"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, LiveDot } from "@/components/app/brand"
import { useRouter, Link } from "@/lib/router"
import { useAuth } from "@/lib/auth-context"
import {
  Mic, MicOff, Video, VideoOff, PhoneOff, Send, Play, Square, Coffee, Timer,
  Users, MessageSquare, Settings, Crown, Volume2, Hand, LogOut, Lock, Focus, Sparkles, Zap, Smile, Share2,
  MonitorUp, UserPlus, Search, Palette,
} from "lucide-react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { useConfetti } from "@/components/app/confetti"
import { AmbientSounds } from "@/components/app/ambient-sounds"
import { LevelUpModal } from "@/components/app/level-up-modal"
import { Whiteboard } from "@/components/app/whiteboard"

type Participant = {
  userId: string
  username: string
  displayName: string
  avatarUrl?: string
  micOn: boolean
  camOn: boolean
  isSpeaking: boolean
  role: string
  joinedAt: number
}

type Msg = { id: string; userId: string; username: string; text: string; isSystem: boolean; createdAt: number }
type TimerState = { mode: "focus" | "break" | "idle"; endsAt: number | null; round: number; focusMin: number; breakMin: number; startedBy: string | null }
type FloatingReaction = { id: string; emoji: string; userId: string; username: string; x: number; createdAt: number }

const REACTION_EMOJIS = ["🔥", "👏", "💪", "🙏", "💡", "✨", "🚀", "❤️", "🧠", "🎯"]

export function RoomView({ id }: { id: string }) {
  const { route, navigate } = useRouter()
  const { me } = useAuth()
  const qc = useQueryClient()
  const confetti = useConfetti()

  const { data, isLoading } = useQuery({
    queryKey: ["room", id],
    queryFn: () => api.get<{ room: any; participants: Participant[]; timer: TimerState }>(`/rooms/${id}`),
  })
  const room = data?.room

  const [participants, setParticipants] = useState<Participant[]>([])
  const [messages, setMessages] = useState<Msg[]>([])
  const [timer, setTimer] = useState<TimerState>({ mode: "idle", endsAt: null, round: 0, focusMin: 25, breakMin: 5, startedBy: null })
  const [chatText, setChatText] = useState("")
  const [tab, setTab] = useState<"chat" | "participants" | "queue">("chat")
  const [micOn, setMicOn] = useState(false)
  const [camOn, setCamOn] = useState(false)
  const [studyActive, setStudyActive] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [left, setLeft] = useState(false)
  const [floatingReactions, setFloatingReactions] = useState<FloatingReaction[]>([])
  const [showReactions, setShowReactions] = useState(false)
  const [showShare, setShowShare] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteUsername, setInviteUsername] = useState("")
  const [inviteSearch, setInviteSearch] = useState("")
  const [screenSharing, setScreenSharing] = useState(false)
  const [levelUp, setLevelUp] = useState<{ level: number; open: boolean }>({ level: 0, open: false })
  const [showWhiteboard, setShowWhiteboard] = useState(false)
  const [handRaised, setHandRaised] = useState(false)

  const sessionIdRef = useRef<string | null>(null)
  const esRef = useRef<EventSource | null>(null)
  const heartbeatRef = useRef<any>(null)

  // Join room on mount: get token, register presence
  useEffect(() => {
    if (!me || !room) return
    let cancelled = false

    async function join() {
      try {
        await api.post(`/rooms/${id}/token`, {})
        await api.post(`/rooms/${id}/presence`, { micOn, camOn })
        // Connect SSE
        const token = getToken()
        const es = new EventSource(`/api/rooms/${id}/events?token=${encodeURIComponent(token || "")}`)
        esRef.current = es
        es.addEventListener("presence", (e: any) => setParticipants(JSON.parse(e.data).participants))
        es.addEventListener("history", (e: any) => setMessages(JSON.parse(e.data).messages))
        es.addEventListener("message", (e: any) => setMessages((m) => [...m, JSON.parse(e.data).message]))
        es.addEventListener("timer", (e: any) => setTimer(JSON.parse(e.data).timer))
        es.addEventListener("reaction", (e: any) => {
          const r = JSON.parse(e.data).reaction
          // Spawn a floating reaction at a random x position
          const fr: FloatingReaction = {
            id: r.id,
            emoji: r.emoji,
            userId: r.userId,
            username: r.username,
            x: 10 + Math.random() * 80,
            createdAt: Date.now(),
          }
          setFloatingReactions((prev) => [...prev.slice(-12), fr])
          // auto-remove after 2.6s
          setTimeout(() => {
            setFloatingReactions((prev) => prev.filter((p) => p.id !== fr.id))
          }, 2600)
        })
        es.addEventListener("whiteboard", (e: any) => {
          window.dispatchEvent(new CustomEvent("sankalp:whiteboard", { detail: { stroke: JSON.parse(e.data).stroke } }))
        })
        es.addEventListener("whiteboard_snapshot", (e: any) => {
          window.dispatchEvent(new CustomEvent("sankalp:whiteboard_snapshot", { detail: { strokes: JSON.parse(e.data).strokes } }))
        })
        es.addEventListener("whiteboard_clear", () => {
          window.dispatchEvent(new CustomEvent("sankalp:whiteboard_clear"))
        })
        es.onerror = () => { /* auto-reconnect by browser */ }
        // heartbeat
        heartbeatRef.current = setInterval(() => {
          api.post(`/rooms/${id}/presence`, { action: "heartbeat" }).catch(() => {})
        }, 20000)
      } catch (e: any) {
        toast.error(e.message || "Failed to join room")
        navigate("/rooms")
      }
    }
    join()
    return () => {
      cancelled = true
      esRef.current?.close()
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      api.post(`/rooms/${id}/presence`, { action: "leave" }).catch(() => {})
    }
  }, [me, room?.id, id])

  // tick for countdown
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(i)
  }, [])

  const leave = useCallback(async () => {
    setLeft(true)
    esRef.current?.close()
    if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    // Stop study session if active
    if (sessionIdRef.current) {
      try { await api.post(`/study/sessions/${sessionIdRef.current}/stop`) } catch {}
      sessionIdRef.current = null
    }
    await api.post(`/rooms/${id}/presence`, { action: "leave" }).catch(() => {})
    qc.invalidateQueries({ queryKey: ["rooms"] })
    navigate("/rooms")
  }, [id, navigate, qc])

  // auto-stop session if page closing
  useEffect(() => {
    const onUnload = () => {
      if (sessionIdRef.current) {
        navigator.sendBeacon(`/api/study/sessions/${sessionIdRef.current}/stop`)
      }
      api.post(`/rooms/${id}/presence`, { action: "leave" }).catch(() => {})
    }
    window.addEventListener("beforeunload", onUnload)
    return () => window.removeEventListener("beforeunload", onUnload)
  }, [id])

  const toggleMic = async () => {
    const v = !micOn
    setMicOn(v)
    try { await api.patch(`/rooms/${id}/presence`, { micOn: v }) } catch {}
  }
  const toggleCam = async () => {
    const v = !camOn
    setCamOn(v)
    try { await api.patch(`/rooms/${id}/presence`, { camOn: v }) } catch {}
  }
  const toggleScreenShare = async () => {
    const v = !screenSharing
    setScreenSharing(v)
    try { await api.patch(`/rooms/${id}/presence`, { screenSharing: v }) } catch {}
    if (v) toast.success("Screen share started (simulated). Others will see your screen tile highlighted.")
    else toast.info("Screen share stopped.")
  }

  const sendInvite = async (username?: string) => {
    const u = (username ?? inviteUsername).trim().toLowerCase()
    if (!u) { toast.error("Enter a username"); return }
    try {
      await api.post(`/rooms/${id}/invite`, { username: u })
      toast.success(`Invited @${u} to this room`)
      setInviteUsername("")
      setShowInvite(false)
    } catch (e: any) { toast.error(e.message || "Failed to invite") }
  }

  const toggleHand = async () => {
    const next = !handRaised
    setHandRaised(next)
    try {
      await api.post(`/rooms/${id}/hand`, { raised: next })
      toast.success(next ? "Hand raised ✋" : "Hand lowered")
    } catch (e: any) {
      setHandRaised(!next) // revert
      toast.error(e.message || "Failed to toggle hand")
    }
  }

  const lowerHand = async (targetUserId: string) => {
    try {
      await api.post(`/rooms/${id}/hand`, { userId: targetUserId, raised: false })
      toast.success("Lowered their hand")
    } catch (e: any) {
      toast.error(e.message || "Failed to lower hand")
    }
  }

  const promoteCoHost = async (targetUserId: string) => {
    try {
      await api.patch(`/rooms/${id}/members/${targetUserId}`, { role: "co_host" })
      toast.success("Promoted to co-host")
    } catch (e: any) {
      toast.error(e.message || "Failed to promote")
    }
  }

  const demoteCoHost = async (targetUserId: string) => {
    try {
      await api.patch(`/rooms/${id}/members/${targetUserId}`, { role: "participant" })
      toast.success("Demoted to participant")
    } catch (e: any) {
      toast.error(e.message || "Failed to demote")
    }
  }

  const sendMessage = async () => {
    const text = chatText.trim()
    if (!text) return
    setChatText("")
    try { await api.post(`/rooms/${id}/messages`, { text }) } catch (e: any) { toast.error(e.message) }
  }

  const startTimer = async (mode: "focus" | "break") => {
    const minutes = mode === "focus" ? timer.focusMin : timer.breakMin
    try { await api.post(`/rooms/${id}/timer`, { action: "start", mode, minutes }) } catch (e: any) { toast.error(e.message) }
  }
  const stopTimer = async () => {
    try { await api.post(`/rooms/${id}/timer`, { action: "stop" }) } catch (e: any) { toast.error(e.message) }
  }

  const sendReaction = async (emoji: string) => {
    setShowReactions(false)
    try { await api.post(`/rooms/${id}/reactions`, { emoji }) } catch (e: any) { toast.error(e.message) }
  }
  const shareRoom = async () => {
    const url = `${window.location.origin}/#/rooms/${id}`
    try { await navigator.clipboard.writeText(url); toast.success("Room link copied — share it with a friend!") } catch { setShowShare(true) }
  }

  const startStudy = async () => {
    try {
      const res = await api.post<{ sessionId: string }>("/study/sessions", { roomId: id, communityId: room?.community?.id, mode: timer.mode === "focus" ? "pomodoro" : "focus" })
      sessionIdRef.current = res.sessionId
      setStudyActive(true)
      toast.success("Study session started")
    } catch (e: any) { toast.error(e.message) }
  }
  const stopStudy = async () => {
    if (!sessionIdRef.current) return
    try {
      const res = await api.post<{ durationMin: number; xpEarned: number; level: number; leveledUp: boolean; streak: number; awardedBadges: any[] }>(`/study/sessions/${sessionIdRef.current}/stop`)
      sessionIdRef.current = null
      setStudyActive(false)
      const xp = res.xpEarned ?? 0
      const mins = res.durationMin ?? 0
      toast.success(`Studied ${mins}m · +${xp} XP${res.streak ? ` · 🔥 ${res.streak}d` : ""}`)
      if (res.awardedBadges?.length) {
        for (const b of res.awardedBadges) toast(`Badge earned: ${b.name}`, { description: b.description })
        confetti.burst(120)
      } else if (mins >= 25) {
        confetti.burst(60)
      }
      if (res.leveledUp && res.level) {
        confetti.burst(140)
        setLevelUp({ level: res.level, open: true })
      }
      qc.invalidateQueries({ queryKey: ["me"] })
      qc.invalidateQueries({ queryKey: ["goals"] })
    } catch (e: any) { toast.error(e.message) }
  }

  if (isLoading) return <div className="p-10 text-center text-muted-foreground">Loading room…</div>
  if (!room) return <div className="p-10 text-center text-muted-foreground">Room not found. <Link className="text-brand-emerald" to="/rooms">Back to rooms</Link></div>
  if (left) return null

  const isHost = me?.id === room.owner.id
  const count = participants.length
  const raisedHands = participants
    .filter((p) => p.handRaised)
    .sort((a, b) => (a.handRaisedAt ?? 0) - (b.handRaisedAt ?? 0))
  const remaining = timer.endsAt ? Math.max(0, Math.floor((timer.endsAt - now) / 1000)) : 0
  const mm = String(Math.floor(remaining / 60)).padStart(2, "0")
  const ss = String(remaining % 60).padStart(2, "0")
  const timerPct = timer.endsAt
    ? 100 - (remaining / (timer.mode === "focus" ? timer.focusMin : timer.breakMin) / 60 * 100)
    : 0

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 h-14 border-b bg-card/60 backdrop-blur">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={leave} className="size-9"><LogOut className="size-4" /></Button>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <LiveDot />
              <h1 className="font-semibold truncate">{room.name}</h1>
              {room.isPrivate && <Lock className="size-3.5 text-muted-foreground" />}
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {room.community?.name ?? "Open room"} · {count}/{room.maxParticipants} · {room.focusMode ? "Focus mode" : "Open mode"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {timer.mode !== "idle" && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: timer.mode === "focus" ? "var(--brand-emerald)" : "var(--accent)", color: timer.mode === "focus" ? "white" : "var(--accent-foreground)" }}>
              {timer.mode === "focus" ? <Timer className="size-4" /> : <Coffee className="size-4" />}
              <span className="font-mono font-bold tabular-nums">{mm}:{ss}</span>
              <span className="text-xs opacity-80">round {timer.round}</span>
            </div>
          )}
        </div>
      </div>

      {/* Reactions ticker — recent reactions count + emoji */}
      {floatingReactions.length > 0 && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 bg-card/90 backdrop-blur border rounded-full px-3 py-1 shadow-sm fade-in">
          {Object.entries(
            floatingReactions.reduce((acc, r) => {
              acc[r.emoji] = (acc[r.emoji] ?? 0) + 1
              return acc
            }, {} as Record<string, number>)
          ).slice(-4).map(([emoji, n]) => (
            <span key={emoji} className="text-sm inline-flex items-center gap-0.5">
              {emoji}<span className="text-[10px] text-muted-foreground font-semibold">{n}</span>
            </span>
          ))}
        </div>
      )}

      {/* Body: stage + side panel */}
      <div className="flex-1 flex min-h-0">
        {/* Stage */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Timer bar */}
          {timer.mode !== "idle" && (
            <div className="h-1.5 bg-muted">
              <div className="h-full transition-all" style={{ width: `${timerPct}%`, background: timer.mode === "focus" ? "var(--brand-emerald)" : "var(--accent)" }} />
            </div>
          )}
          <div className="flex-1 overflow-y-auto scroll-thin p-4">
            {count === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground">Connecting…</div>
            ) : (
              <div className={cn("grid gap-3 mx-auto", gridClass(count))}>
                {participants.map((p) => (
                  <ParticipantTile key={p.userId} p={p} isMe={p.userId === me?.id} isHost={p.userId === room.owner.id} />
                ))}
              </div>
            )}
          </div>

          {/* Timer controls + study */}
          <div className="border-t bg-card/60 backdrop-blur px-4 py-3">
            <div className="flex flex-wrap items-center gap-2 justify-between">
              <div className="flex items-center gap-2">
                {timer.mode === "idle" ? (
                  <>
                    <Button size="sm" onClick={() => startTimer("focus")}><Timer className="size-4" /> Start {timer.focusMin}m focus</Button>
                    <Button size="sm" variant="outline" onClick={() => startTimer("break")}><Coffee className="size-4" /> Break</Button>
                  </>
                ) : (
                  <>
                    <div className="flex sm:hidden items-center gap-2 px-2.5 py-1.5 rounded-lg" style={{ background: timer.mode === "focus" ? "var(--brand-emerald)" : "var(--accent)", color: timer.mode === "focus" ? "white" : "var(--accent-foreground)" }}>
                      <span className="font-mono font-bold text-sm">{mm}:{ss}</span>
                    </div>
                    <Button size="sm" variant="outline" onClick={stopTimer}><Square className="size-3.5" /> Stop timer</Button>
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                {studyActive ? (
                  <Button size="sm" variant="destructive" onClick={stopStudy}><Square className="size-3.5" /> Stop study</Button>
                ) : (
                  <Button size="sm" onClick={startStudy} className="bg-brand-emerald hover:opacity-90"><Play className="size-3.5" /> Start study</Button>
                )}
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">
              {studyActive ? "Study time is being tracked server-side. Stop before you leave to bank your XP." : "Press Start study to begin tracking. Duration & XP are computed by the server."}
            </p>
          </div>
        </div>

        {/* Side panel */}
        <aside className="w-full sm:w-80 shrink-0 border-l bg-card/40 hidden sm:flex flex-col">
          <div className="flex border-b">
            <button onClick={() => setTab("chat")} className={cn("flex-1 py-2.5 text-sm font-medium border-b-2", tab === "chat" ? "border-primary" : "border-transparent text-muted-foreground")}>
              <MessageSquare className="size-4 inline mr-1.5" /> Chat
            </button>
            <button onClick={() => setTab("participants")} className={cn("flex-1 py-2.5 text-sm font-medium border-b-2", tab === "participants" ? "border-primary" : "border-transparent text-muted-foreground")}>
              <Users className="size-4 inline mr-1.5" /> People ({count})
            </button>
            <button onClick={() => setTab("queue")} className={cn("px-3 py-2.5 text-sm font-medium border-b-2 relative", tab === "queue" ? "border-primary" : "border-transparent text-muted-foreground")} title="Raised hands queue">
              <Hand className="size-4 inline" />
              {raisedHands.length > 0 && (
                <span className="absolute top-1 right-1 min-w-4 h-4 px-1 rounded-full bg-amber-500 text-white text-[9px] font-bold flex items-center justify-center">{raisedHands.length}</span>
              )}
            </button>
            <button onClick={() => setShowWhiteboard(true)} className="px-3 py-2.5 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-brand-emerald" title="Open shared whiteboard">
              <Palette className="size-4 inline" />
            </button>
          </div>

          {tab === "chat" ? (
            <>
              <div className="flex-1 overflow-y-auto scroll-thin p-3 space-y-2 min-h-0">
                {messages.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-6">No messages yet. Say hi 👋</p>
                ) : messages.map((m) => (
                  <div key={m.id} className={cn("text-sm", m.isSystem ? "text-center text-xs text-muted-foreground py-1" : "")}>
                    {m.isSystem ? (
                      <span className="bg-muted rounded px-2 py-0.5">{m.text}</span>
                    ) : (
                      <div className="flex gap-2">
                        <Avatar name={m.username} size={26} />
                        <div className="min-w-0">
                          <div className="text-xs text-muted-foreground">{m.username}</div>
                          <div className="break-words">{m.text}</div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div className="p-3 border-t flex gap-2">
                <Input value={chatText} onChange={(e) => setChatText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage() } }} placeholder="Message the room…" maxLength={500} />
                <Button size="icon" onClick={sendMessage}><Send className="size-4" /></Button>
              </div>
            </>
          ) : tab === "participants" ? (
            <div className="flex-1 overflow-y-auto scroll-thin p-2 space-y-1">
              {[...participants].sort((a, b) => {
                // raised hands first (by raisedAt), then everyone else
                if (a.handRaised && !b.handRaised) return -1
                if (!a.handRaised && b.handRaised) return 1
                if (a.handRaised && b.handRaised) return (a.handRaisedAt ?? 0) - (b.handRaisedAt ?? 0)
                return 0
              }).map((p) => (
                <div key={p.userId} className={cn("flex items-center gap-2 p-2 rounded-lg hover:bg-accent", p.handRaised && "bg-amber-50 dark:bg-amber-950/30 ring-1 ring-amber-200 dark:ring-amber-800")}>
                  <div className="relative">
                    <Avatar name={p.displayName} src={p.avatarUrl} size={32} speaking={p.isSpeaking} />
                    {p.handRaised && (
                      <span className="absolute -top-1 -right-1 size-4 rounded-full bg-amber-500 text-white flex items-center justify-center text-[8px]" title="Hand raised">✋</span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate flex items-center gap-1">
                      {p.displayName}
                      {p.userId === me?.id && <span className="text-[10px] text-muted-foreground">(you)</span>}
                      {p.handRaised && <span className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">raised</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">@{p.username}</div>
                  </div>
                  <div className="flex items-center gap-1">
                    {p.userId === room.owner.id && <Crown className="size-3.5 text-accent-foreground" />}
                    {p.micOn ? <Mic className="size-3.5 text-brand-emerald" /> : <MicOff className="size-3.5 text-muted-foreground" />}
                    {p.camOn ? <Video className="size-3.5 text-brand-emerald" /> : <VideoOff className="size-3.5 text-muted-foreground" />}
                    {/* Host can lower someone else's raised hand */}
                    {p.handRaised && p.userId !== me?.id && (room.ownerId === me?.id) && (
                      <button
                        onClick={() => lowerHand(p.userId)}
                        className="size-5 rounded-full bg-amber-500 hover:bg-amber-600 text-white flex items-center justify-center ml-1"
                        title={`Lower ${p.displayName}'s hand`}
                      >
                        <Hand className="size-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : tab === "queue" ? (
            <div className="flex-1 overflow-y-auto scroll-thin p-3">
              <div className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5"><Hand className="size-3.5" /> Speaker queue</div>
              {raisedHands.length === 0 ? (
                <div className="text-center py-10">
                  <Hand className="size-8 mx-auto mb-2 opacity-20" />
                  <p className="text-xs text-muted-foreground">No raised hands. Click ✋ to be next to speak.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {raisedHands.map((p, i) => (
                    <div key={p.userId} className={cn("flex items-center gap-3 p-2.5 rounded-lg border", i === 0 ? "bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800" : "bg-card")}>
                      <span className={cn("size-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0", i === 0 ? "bg-amber-500 text-white" : "bg-muted text-muted-foreground")}>{i + 1}</span>
                      <Avatar name={p.displayName} src={p.avatarUrl} size={32} />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {p.displayName}
                          {i === 0 && <span className="ml-1.5 text-[10px] text-amber-600 dark:text-amber-400 font-semibold">NEXT</span>}
                          {p.role === "co_host" && <span className="ml-1.5 text-[10px] text-brand-emerald font-semibold">co-host</span>}
                        </div>
                        <div className="text-[10px] text-muted-foreground">
                          raised {p.handRaisedAt ? new Date(p.handRaisedAt).toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" }) : ""}
                        </div>
                      </div>
                      {isHost && (
                        <div className="flex gap-1">
                          {p.role !== "co_host" && p.userId !== room.ownerId && (
                            <button
                              onClick={() => promoteCoHost(p.userId)}
                              className="text-[10px] px-2 py-1 rounded-md bg-brand-emerald hover:opacity-90 text-white"
                              title="Promote to co-host"
                            >
                              Promote
                            </button>
                          )}
                          {p.role === "co_host" && (
                            <button
                              onClick={() => demoteCoHost(p.userId)}
                              className="text-[10px] px-2 py-1 rounded-md bg-muted text-muted-foreground hover:bg-accent"
                              title="Demote to participant"
                            >
                              Demote
                            </button>
                          )}
                          <button
                            onClick={() => lowerHand(p.userId)}
                            className="text-[10px] px-2 py-1 rounded-md bg-amber-500 hover:bg-amber-600 text-white"
                            title="Lower hand"
                          >
                            Lower
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </aside>
      </div>

      {/* Bottom controls */}
      <div className="flex items-center justify-center gap-3 h-20 border-t bg-card/80 backdrop-blur relative" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <ControlBtn active={micOn} onClick={toggleMic} on={<Mic className="size-5" />} off={<MicOff className="size-5" />} label={micOn ? "Mute" : "Unmute"} />
        <ControlBtn active={camOn} onClick={toggleCam} on={<Video className="size-5" />} off={<VideoOff className="size-5" />} label={camOn ? "Stop video" : "Start video"} />
        <ControlBtn active={screenSharing} onClick={toggleScreenShare} on={<MonitorUp className="size-5" />} off={<MonitorUp className="size-5" />} label={screenSharing ? "Stop share" : "Share screen"} />
        <ControlBtn active={handRaised} onClick={toggleHand} on={<Hand className="size-5" />} off={<Hand className="size-5" />} label={handRaised ? "Lower hand" : "Raise hand"} />

        {/* Reactions */}
        <div className="relative">
          {showReactions && (
            <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-card border rounded-2xl shadow-lg p-2 flex gap-1 fade-in">
              {REACTION_EMOJIS.map((e) => (
                <button
                  key={e}
                  onClick={() => sendReaction(e)}
                  className="size-9 rounded-full hover:bg-accent text-xl transition-transform hover:scale-125"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => setShowReactions(!showReactions)}
            className="inline-flex flex-col items-center gap-1"
            title="Send reaction"
          >
            <span className={cn("inline-flex items-center justify-center size-12 rounded-full transition-colors", showReactions ? "bg-brand-emerald text-white" : "bg-muted text-muted-foreground hover:bg-accent")}>
              <Smile className="size-5" />
            </span>
            <span className="text-[10px] text-muted-foreground">React</span>
          </button>
        </div>

        {/* Share */}
        <button onClick={shareRoom} className="inline-flex flex-col items-center gap-1" title="Copy room link">
          <span className="inline-flex items-center justify-center size-12 rounded-full bg-muted text-muted-foreground hover:bg-accent transition-colors">
            <Share2 className="size-5" />
          </span>
          <span className="text-[10px] text-muted-foreground">Link</span>
        </button>

        {/* Invite friend */}
        <button onClick={() => setShowInvite(true)} className="inline-flex flex-col items-center gap-1" title="Invite a friend">
          <span className="inline-flex items-center justify-center size-12 rounded-full bg-muted text-muted-foreground hover:bg-accent transition-colors">
            <UserPlus className="size-5" />
          </span>
          <span className="text-[10px] text-muted-foreground">Invite</span>
        </button>

        <button onClick={leave} className="inline-flex items-center justify-center size-14 rounded-full bg-destructive text-white hover:bg-destructive/90 transition-colors" title="Leave">
          <PhoneOff className="size-5" />
        </button>
      </div>

      {/* Floating reactions overlay */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden z-30">
        {floatingReactions.map((fr) => (
          <div
            key={fr.id}
            className="absolute bottom-24 text-4xl select-none"
            style={{
              left: `${fr.x}%`,
              animation: "float-up 2.6s ease-out forwards",
            }}
          >
            <span className="drop-shadow-lg">{fr.emoji}</span>
            <style jsx>{`
              @keyframes float-up {
                0% { transform: translateY(0) scale(0.6); opacity: 0; }
                15% { transform: translateY(-20px) scale(1.2); opacity: 1; }
                100% { transform: translateY(-260px) scale(1); opacity: 0; }
              }
            `}</style>
          </div>
        ))}
      </div>

      {/* Share dialog (fallback if clipboard blocked) */}
      {showShare && (
        <div className="absolute inset-0 z-40 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowShare(false)}>
          <div className="bg-card rounded-xl p-5 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-2">Share this room</h3>
            <p className="text-xs text-muted-foreground mb-3">Send this link to a study buddy. They can join even without an account first (they'll sign up on open).</p>
            <code className="block w-full px-3 py-2 rounded-md bg-muted text-sm break-all">{typeof window !== "undefined" ? `${window.location.origin}/#/rooms/${id}` : ""}</code>
            <button onClick={() => setShowShare(false)} className="mt-3 w-full h-9 rounded-md bg-primary text-primary-foreground text-sm">Done</button>
          </div>
        </div>
      )}

      {/* Invite friend dialog */}
      <InviteDialog
        open={showInvite}
        onOpenChange={setShowInvite}
        inviteUsername={inviteUsername}
        setInviteUsername={setInviteUsername}
        inviteSearch={inviteSearch}
        setInviteSearch={setInviteSearch}
        onInvite={sendInvite}
      />

      {/* Ambient sounds — collapsible panel in the corner */}
      <div className="absolute top-16 right-3 w-56 z-20 hidden lg:block">
        <AmbientSounds compact />
      </div>

      {confetti.ConfettiLayer}
      <LevelUpModal level={levelUp.level} open={levelUp.open} onClose={() => setLevelUp({ level: 0, open: false })} />
      {showWhiteboard && <Whiteboard roomId={id} onOpenChange={setShowWhiteboard} />}
    </div>
  )
}

function InviteDialog({
  open, onOpenChange, inviteUsername, setInviteUsername, inviteSearch, setInviteSearch, onInvite,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  inviteUsername: string
  setInviteUsername: (v: string) => void
  inviteSearch: string
  setInviteSearch: (v: string) => void
  onInvite: (username?: string) => void
}) {
  const { data: friendsData } = useQuery({
    queryKey: ["friends"],
    queryFn: () => api.get<{ friends: any[]; incoming: any[]; outgoing: any[] }>("/friends"),
  })
  const { data: searchData } = useQuery({
    queryKey: ["search", inviteSearch],
    queryFn: () => api.get<{ users: any[] }>("/search/users", { q: inviteSearch, limit: 8 }),
    enabled: inviteSearch.length >= 1,
  })
  const friends = (friendsData?.friends ?? []).filter((f: any) =>
    !inviteSearch || f.username.includes(inviteSearch.toLowerCase()) || f.displayName.toLowerCase().includes(inviteSearch.toLowerCase())
  )
  const others = (searchData?.users ?? []).filter((u: any) => !friends.some((f: any) => f.userId === u.userId))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UserPlus className="size-5" /> Invite to room</DialogTitle>
          <DialogDescription>Send a room invite — they'll get a notification with a join button.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={inviteSearch} onChange={(e) => setInviteSearch(e.target.value)} placeholder="Search friends or anyone…" className="pl-9" autoFocus />
          </div>
          {/* Manual username entry */}
          <div className="flex gap-2">
            <div className="flex items-center relative flex-1">
              <span className="absolute left-3 text-muted-foreground">@</span>
              <Input value={inviteUsername} onChange={(e) => setInviteUsername(e.target.value)} placeholder="username" className="pl-7" />
            </div>
            <Button onClick={() => onInvite()} disabled={!inviteUsername.trim()}>Invite</Button>
          </div>
          {/* Friends list */}
          {friends.length > 0 && (
            <div>
              <div className="text-xs text-muted-foreground mb-1.5">Your friends</div>
              <div className="space-y-1 max-h-48 overflow-y-auto scroll-thin">
                {friends.map((f: any) => (
                  <button key={f.userId} onClick={() => onInvite(f.username)} className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-accent text-left">
                    <Avatar name={f.displayName} src={f.avatarUrl} size={28} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{f.displayName}</div>
                      <div className="text-xs text-muted-foreground">@{f.username}</div>
                    </div>
                    <UserPlus className="size-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </div>
          )}
          {/* Other users */}
          {others.length > 0 && (
            <div>
              <div className="text-xs text-muted-foreground mb-1.5">{friends.length > 0 ? "Others" : "People"}</div>
              <div className="space-y-1 max-h-40 overflow-y-auto scroll-thin">
                {others.map((u: any) => (
                  <button key={u.userId} onClick={() => onInvite(u.username)} className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-accent text-left">
                    <Avatar name={u.displayName} src={u.avatarUrl} size={28} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{u.displayName}</div>
                      <div className="text-xs text-muted-foreground">@{u.username} · {u.examGoal ?? "—"}</div>
                    </div>
                    <UserPlus className="size-4 text-muted-foreground" />
                  </button>
                ))}
              </div>
            </div>
          )}
          {friends.length === 0 && others.length === 0 && inviteSearch && (
            <p className="text-xs text-muted-foreground text-center py-3">No users found for "{inviteSearch}".</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function ParticipantTile({ p, isMe, isHost }: { p: Participant; isMe?: boolean; isHost?: boolean }) {
  const sharing = (p as any).screenSharing === true
  return (
    <div className={cn("relative aspect-video rounded-xl overflow-hidden border bg-gradient-to-br from-emerald-950/50 to-emerald-800/20 flex items-center justify-center", p.isSpeaking && "speaking-ring border-brand-emerald", sharing && "ring-2 ring-sky-400")}>
      {sharing ? (
        <div className="absolute inset-0 bg-gradient-to-br from-sky-900/60 to-sky-700/30 flex flex-col items-center justify-center gap-2">
          <MonitorUp className="size-8 text-sky-300" />
          <span className="text-xs text-sky-100">screen sharing</span>
        </div>
      ) : p.camOn ? (
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-600/30 to-amber-500/20 flex items-center justify-center">
          <Avatar name={p.displayName} src={p.avatarUrl} size={64} speaking={p.isSpeaking} />
          <span className="absolute top-2 left-2 text-[10px] bg-black/40 text-white px-1.5 py-0.5 rounded">camera on</span>
        </div>
      ) : (
        <Avatar name={p.displayName} src={p.avatarUrl} size={64} speaking={p.isSpeaking} />
      )}
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
        <span className="text-xs font-medium text-white bg-black/40 backdrop-blur px-2 py-0.5 rounded inline-flex items-center gap-1">
          {p.displayName}{isMe && " (you)"}
        </span>
        <span className={cn("size-6 rounded-full flex items-center justify-center", p.micOn ? "bg-brand-emerald text-white" : "bg-black/50 text-white")}>
          {p.micOn ? <Mic className="size-3" /> : <MicOff className="size-3" />}
        </span>
      </div>
      {isHost && <span className="absolute top-2 right-2 text-[10px] bg-amber-500 text-white px-1.5 py-0.5 rounded inline-flex items-center gap-1"><Crown className="size-2.5" /> host</span>}
    </div>
  )
}

function ControlBtn({ active, onClick, on, off, label }: { active: boolean; onClick: () => void; on: React.ReactNode; off: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} className="inline-flex flex-col items-center gap-1" title={label}>
      <span className={cn("inline-flex items-center justify-center size-12 rounded-full transition-colors", active ? "bg-brand-emerald text-white" : "bg-muted text-muted-foreground hover:bg-accent")}>
        {active ? on : off}
      </span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </button>
  )
}

function gridClass(n: number) {
  if (n <= 1) return "max-w-3xl grid-cols-1"
  if (n <= 4) return "max-w-4xl grid-cols-2"
  if (n <= 9) return "max-w-5xl grid-cols-3"
  if (n <= 16) return "max-w-6xl grid-cols-4"
  return "max-w-7xl grid-cols-5"
}
