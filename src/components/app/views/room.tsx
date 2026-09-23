"use client"

import { useEffect, useRef, useState, useCallback, useMemo } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api, getToken } from "@/lib/api-client"
import { Avatar } from "@/components/app/brand"
import { useRouter, Link } from "@/lib/router"
import { useAuth } from "@/lib/auth-context"
import { Video, VideoOff, PhoneOff, Play, Pause, Square, RotateCcw, Settings2, ChevronLeft, Coffee, Timer as TimerIcon, Headphones, SkipForward, Pin, PinOff, Maximize2, Minimize2, Clock, Lock, Zap, Calendar, Crown, ArrowRight, X, Sparkles, Activity } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import { AmbientSounds } from "@/components/app/ambient-sounds"
import { Room, RoomEvent, Track, Participant, ParticipantEvent, ConnectionState, RemoteTrackPublication } from "livekit-client"
import { buildRoomOptions, applyPolicyToAllRemoteTracks, applyRemoteQualityCap, pauseRemoteTrack, resumeRemoteTrack, countSubscribedRemoteVideoTracks, ClientVideoPolicy } from "@/lib/video-quality-client"

// ── Types ──
type PomodoroConfig = { focusMin: number; breakMin: number; longBreakMin: number; rounds: number }
type PomodoroState = "ready" | "focusing" | "paused" | "short_break" | "long_break" | "completed"

const PRESETS: { label: string; config: PomodoroConfig }[] = [
  { label: "25 / 5", config: { focusMin: 25, breakMin: 5, longBreakMin: 15, rounds: 4 } },
  { label: "50 / 10", config: { focusMin: 50, breakMin: 10, longBreakMin: 20, rounds: 4 } },
  { label: "45 / 15", config: { focusMin: 45, breakMin: 15, longBreakMin: 30, rounds: 4 } },
  { label: "60 / 10", config: { focusMin: 60, breakMin: 10, longBreakMin: 20, rounds: 4 } },
  { label: "90 / 20", config: { focusMin: 90, breakMin: 20, longBreakMin: 30, rounds: 3 } },
]

// Format seconds as MM:SS for the free-time countdown.
function fmt(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`
}

export function RoomView({ id }: { id: string }) {
  const { me } = useAuth()
  const { navigate } = useRouter()
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ["room", id],
    queryFn: () => api.get<{ room: any }>(`/rooms/${id}`),
  })
  const room = data?.room

  // ── LiveKit state ──
  const [participants, setParticipants] = useState<Participant[]>([])
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.Disconnected)
  const [camOn, setCamOn] = useState(false)
  const [left, setLeft] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showAmbient, setShowAmbient] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pinnedId, setPinnedId] = useState<string | null>(null)
  const lkRoomRef = useRef<Room | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const heartbeatRef = useRef<any>(null)

  // ── Free-allowance entitlement (server-authoritative) ──
  // The countdown is purely visual; the server is the source of truth. We fetch
  // the entitlement on join and refresh it via the heartbeat. The displayed
  // seconds tick locally for smooth UX but the server value overwrites it on
  // every heartbeat to prevent client-side manipulation from affecting access.
  type Ent = {
    isPaid: boolean
    canJoinLiveRoom: boolean
    remainingFreeSeconds: number
    consumedFreeSeconds: number
    allowanceSeconds: number
    windowResetsAt: string
    hasActiveSession: boolean
    warningShown: boolean
    videoQuality: ClientVideoPolicy
  }
  const [entitlement, setEntitlement] = useState<Ent | null>(null)
  // Local tick: decremented every second for smooth display. Re-synced to the
  // server value on every heartbeat (every 20s). If a user manipulates this in
  // DevTools, the next heartbeat overwrites it AND the server still enforces
  // the real remaining via the token/heartbeat endpoints.
  const [displayedFreeSeconds, setDisplayedFreeSeconds] = useState<number | null>(null)
  const [exhausted, setExhausted] = useState(false)
  const [showWarning, setShowWarning] = useState(false)
  const warningShownRef = useRef(false)

  // ── 5-minute video-quality upsell for free users ──
  // Shown ONCE per room session, 5 minutes AFTER room entry. This is DISTINCT
  // from the 5-minute-remaining free-allowance warning (showWarning above).
  // The quality upsell does NOT add minutes, reset the allowance, or interrupt
  // the room — it's a non-blocking upgrade CTA for better video quality.
  const [showQualityUpsell, setShowQualityUpsell] = useState(false)
  const qualityUpsellShownRef = useRef(false)
  const roomEnteredAtRef = useRef<number | null>(null)

  // ── Dev diagnostics (participant count, subscribed tracks, visible count) ──
  // Computed from the LiveKit room + IntersectionObserver state. Only shown in
  // development via a small overlay; no secrets are logged.
  const [visibleCount, setVisibleCount] = useState(0)
  const [subscribedTrackCount, setSubscribedTrackCount] = useState(0)

  // ── Pomodoro state ──
  const { data: pomoData } = useQuery({
    queryKey: ["pomodoro", "settings"],
    queryFn: () => api.get<{ config: PomodoroConfig }>("/pomodoro/settings"),
  })
  const [config, setConfig] = useState<PomodoroConfig>(pomoData?.config ?? { focusMin: 25, breakMin: 5, longBreakMin: 15, rounds: 4 })
  const [pomoState, setPomoState] = useState<PomodoroState>("ready")
  const [completedRounds, setCompletedRounds] = useState(0)
  const [endsAt, setEndsAt] = useState<number | null>(null)
  const [pausedRemaining, setPausedRemaining] = useState<number | null>(null)
  const [now, setNow] = useState(Date.now())

  // ── Connect to LiveKit ──
  useEffect(() => {
    if (!me || !room) return
    let cancelled = false

    async function connect() {
      try {
        setError(null)
        // 1. Request token from Sankalp backend. The server is the source of
        // truth for the free allowance — it refuses to issue a token when the
        // global 30-min/24h allowance is exhausted. The token response also
        // includes the server-authoritative entitlement so the client can
        // render the countdown.
        type TokenRes = {
          token: string
          serverUrl: string
          roomName: string
          entitlement: Ent & { activeSessionId: string | null }
          hasPaidPlan: boolean
        }
        const tokenRes = await api.post<TokenRes>("/rooms/" + id + "/token", {})

        // The token endpoint creates the server-side StudySession and registers
        // it as the active live-room session. We use that sessionId for the
        // stop-on-leave flow. No separate /study/sessions call is needed.
        sessionIdRef.current = tokenRes.entitlement?.activeSessionId ?? null

        // Seed the entitlement + local countdown from the SERVER value.
        setEntitlement(tokenRes.entitlement)
        if (!tokenRes.hasPaidPlan) {
          setDisplayedFreeSeconds(tokenRes.entitlement.remainingFreeSeconds)
          warningShownRef.current = tokenRes.entitlement.warningShown
        }
        // The server-authoritative video-quality policy. The client applies
        // these caps via LiveKit APIs; a malicious client that changes these
        // values in DevTools only affects LOCAL display quality/bandwidth,
        // not access (the server still enforces the real entitlement).
        const policy = tokenRes.entitlement.videoQuality

        // 2. Create LiveKit Room + connect.
        //    adaptiveStream + dynacast + simulcast + 720p local capture are all
        //    configured from the server-authoritative policy. This is the ONLY
        //    place the Room is constructed — never re-create it on re-render.
        const lkRoom = new Room(buildRoomOptions(policy))
        lkRoomRef.current = lkRoom

        // 3. Connect to LiveKit Cloud (real global media transport — never
        //    localhost/127.0.0.1; the serverUrl comes from the server token
        //    response and points to LiveKit Cloud).
        await lkRoom.connect(tokenRes.serverUrl, tokenRes.token)
        if (cancelled) { lkRoom.disconnect(); return }

        setConnectionState(lkRoom.state)

        // 4. Listen for participant events
        const updateParticipants = () => {
          const all = Array.from(lkRoom.remoteParticipants.values())
          // Include local participant
          if (lkRoom.localParticipant) all.unshift(lkRoom.localParticipant)
          setParticipants(all)
          // Refresh subscribed-track count for dev diagnostics.
          setSubscribedTrackCount(countSubscribedRemoteVideoTracks(lkRoom))
        }
        updateParticipants()

        lkRoom.on(RoomEvent.ParticipantConnected, updateParticipants)
        lkRoom.on(RoomEvent.ParticipantDisconnected, updateParticipants)
        lkRoom.on(RoomEvent.TrackSubscribed, (pub, p) => {
          updateParticipants()
          // Apply the subscriber-side quality cap to every newly subscribed
          // remote camera track. This is the key bandwidth/cost control: each
          // subscriber receives at most the policy's max quality layer, not the
          // publisher's full HD stream.
          applyRemoteQualityCap(pub as RemoteTrackPublication, policy)
        })
        lkRoom.on(RoomEvent.TrackUnsubscribed, updateParticipants)
        lkRoom.on(RoomEvent.ConnectionStateChanged, (state) => {
          setConnectionState(state)
          if (state === ConnectionState.Disconnected) {
            // End study session (accrues live-room time server-side)
            if (sessionIdRef.current) {
              api.post("/study/sessions/" + sessionIdRef.current + "/stop").catch(() => {})
              sessionIdRef.current = null
            }
          }
        })
        lkRoom.on(RoomEvent.Reconnecting, () => setConnectionState(ConnectionState.Reconnecting))
        lkRoom.on(RoomEvent.Reconnected, () => {
          setConnectionState(ConnectionState.Connected)
          // Re-apply the quality caps after reconnect (tracks may have been
          // re-subscribed; re-assert the policy so the server forwards the
          // correct layer).
          applyPolicyToAllRemoteTracks(lkRoom, policy)
        })

        // Re-sync connection state AFTER all listeners are registered.
        setConnectionState(lkRoom.state)

        // Apply the quality cap to all remote tracks that already existed
        // before our TrackSubscribed listener was registered (race safety).
        applyPolicyToAllRemoteTracks(lkRoom, policy)

        // 5. Record room-entry time for the 5-min video-quality upsell (free
        //    users only). Paid users never see the upsell.
        if (!tokenRes.hasPaidPlan) {
          roomEnteredAtRef.current = Date.now()
        }

        // 6. Heartbeat: pings the server every 20s. The server recomputes the
        // entitlement and returns it so the client can re-sync its countdown.
        // If the server reports exhausted=true (free allowance hit 0), the
        // client disconnects from LiveKit and shows the purchase screen — this
        // is the server-authoritative "00:00 closes the room" enforcement.
        heartbeatRef.current = setInterval(async () => {
          try {
            const hb = await api.post<{ exhausted?: boolean } & Ent>("/rooms/" + id + "/heartbeat", {})
            setEntitlement(hb)
            if (!hb.isPaid) {
              setDisplayedFreeSeconds(hb.remainingFreeSeconds)
            }
            if (hb.exhausted) {
              // Server says the free allowance is exhausted. Close the room.
              setExhausted(true)
              if (lkRoomRef.current) {
                lkRoomRef.current.disconnect()
                lkRoomRef.current = null
              }
              if (heartbeatRef.current) clearInterval(heartbeatRef.current)
              if (sessionIdRef.current) {
                api.post("/study/sessions/" + sessionIdRef.current + "/stop").catch(() => {})
                sessionIdRef.current = null
              }
            }
          } catch {}
        }, 20000)

        toast.success("Connected to study room")
      } catch (e: any) {
        if (e?.code === "FREE_ALLOWANCE_EXHAUSTED" || e?.status === 403) {
          toast.error("Your 30 minutes of free study time are over.")
          setExhausted(true)
        } else {
          setError(e.message || "Failed to connect to room")
          toast.error(e.message || "Failed to connect to room")
        }
      }
    }

    connect()

    return () => {
      cancelled = true
      if (lkRoomRef.current) {
        lkRoomRef.current.disconnect()
        lkRoomRef.current = null
      }
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      if (sessionIdRef.current) {
        api.post("/study/sessions/" + sessionIdRef.current + "/stop").catch(() => {})
        sessionIdRef.current = null
      }
      api.post("/rooms/" + id + "/presence", { action: "leave" }).catch(() => {})
    }
  }, [me, room?.id])

  // ── Cleanup on unmount ──
  useEffect(() => {
    const onUnload = () => {
      if (lkRoomRef.current) lkRoomRef.current.disconnect()
      if (sessionIdRef.current) navigator.sendBeacon("/api/study/sessions/" + sessionIdRef.current + "/stop")
      api.post("/rooms/" + id + "/presence", { action: "leave" }).catch(() => {})
    }
    window.addEventListener("beforeunload", onUnload)
    return () => window.removeEventListener("beforeunload", onUnload)
  }, [id])

  // ── Tick for Pomodoro display ──
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(i)
  }, [])

  // ── Free-allowance countdown tick (visual only, server is authoritative) ──
  // Decrements the displayed seconds every 1s for smooth UX. The server value
  // (from the heartbeat every 20s) overwrites this, so manipulating it in
  // DevTools has no effect on the real entitlement.
  useEffect(() => {
    if (entitlement?.isPaid) return
    if (displayedFreeSeconds === null) return
    const i = setInterval(() => {
      setDisplayedFreeSeconds((s) => (s === null ? s : Math.max(0, s - 1)))
    }, 1000)
    return () => clearInterval(i)
  }, [entitlement?.isPaid, displayedFreeSeconds === null])

  // ── 5-minute warning (shown ONCE per allowance window) ──
  // Triggers when the displayed countdown crosses 5:00 and the server hasn't
  // already marked the warning as shown for this window. After showing, we
  // mark it on the server so it doesn't reappear on refresh/rejoin.
  useEffect(() => {
    if (!entitlement || entitlement.isPaid) return
    if (warningShownRef.current) return
    if (displayedFreeSeconds === null) return
    if (displayedFreeSeconds > 0 && displayedFreeSeconds <= 300) {
      setShowWarning(true)
      warningShownRef.current = true
      // Tell the server the warning was shown for this window (idempotent).
      api.post("/entitlement/warning-shown", {}).catch(() => {})
    }
  }, [displayedFreeSeconds, entitlement])

  // ── 5-minute video-quality upsell for free users (shown ONCE per room session) ──
  // This is DISTINCT from the 5-minute-remaining free-allowance warning above.
  // This triggers 5 minutes AFTER room entry (roomEnteredAtRef), NOT based on
  // remaining allowance. It's a non-blocking upgrade CTA for better video
  // quality — it does NOT add minutes, reset the allowance, or interrupt the
  // room. Paid users never see it. It shows at most once per room session.
  useEffect(() => {
    if (!entitlement || entitlement.isPaid) return
    if (qualityUpsellShownRef.current) return
    if (roomEnteredAtRef.current === null) return
    // 5 minutes after entry = 300_000 ms
    const elapsed = Date.now() - roomEnteredAtRef.current
    if (elapsed >= 300_000) {
      setShowQualityUpsell(true)
      qualityUpsellShownRef.current = true
    }
  }, [entitlement, displayedFreeSeconds]) // re-check on the 1s countdown tick

  // ── At 00:00, flag exhausted so the purchase overlay shows ──
  // The heartbeat server-side enforcement (exhausted=true) is the real close;
  // this local check just shows the overlay immediately without waiting up to
  // 20s for the next heartbeat.
  useEffect(() => {
    if (!entitlement || entitlement.isPaid) return
    if (displayedFreeSeconds === 0 && !exhausted) {
      setExhausted(true)
    }
  }, [displayedFreeSeconds, entitlement, exhausted])

  // ── Leave room ──
  const leave = useCallback(async () => {
    setLeft(true)
    if (lkRoomRef.current) {
      lkRoomRef.current.disconnect()
      lkRoomRef.current = null
    }
    if (heartbeatRef.current) clearInterval(heartbeatRef.current)
    if (sessionIdRef.current) {
      try { await api.post("/study/sessions/" + sessionIdRef.current + "/stop") } catch {}
      sessionIdRef.current = null
    }
    await api.post("/rooms/" + id + "/presence", { action: "leave" }).catch(() => {})
    qc.invalidateQueries({ queryKey: ["rooms"] })
    navigate("/rooms")
  }, [id, navigate, qc])

  // ── Camera toggle ──
  const toggleCam = async () => {
    const lkRoom = lkRoomRef.current
    if (!lkRoom) return
    try {
      if (camOn) {
        // Turn off camera
        await lkRoom.localParticipant.setCameraEnabled(false)
        setCamOn(false)
      } else {
        // Turn on camera (requests camera permission)
        await lkRoom.localParticipant.setCameraEnabled(true)
        setCamOn(true)
      }
    } catch (e: any) {
      toast.error("Camera permission denied. Please allow camera access in your browser.")
    }
  }

  // ── Pomodoro: timestamp-based remaining calculation ──
  const remainingMs = useMemo((): number => {
    if (pomoState === "ready") return config.focusMin * 60_000
    if (pomoState === "paused") return pausedRemaining ?? 0
    if (endsAt) return Math.max(0, endsAt - now)
    return 0
  }, [pomoState, endsAt, pausedRemaining, now, config])

  const mm = String(Math.floor(remainingMs / 60000)).padStart(2, "0")
  const ss = String(Math.floor((remainingMs % 60000) / 1000)).padStart(2, "0")

  const startFocus = async () => {
    setPomoState("focusing")
    setEndsAt(Date.now() + config.focusMin * 60_000)
    setPausedRemaining(null)
    if (!sessionIdRef.current) {
      try {
        const res = await api.post<{ sessionId: string }>("/study/sessions", { roomId: id, communityId: room?.community?.id, mode: "pomodoro" })
        sessionIdRef.current = res.sessionId
      } catch (e: any) { toast.error(e.message || "Failed to start study session") }
    }
  }
  const pause = () => { if (endsAt) setPausedRemaining(Math.max(0, endsAt - Date.now())); setPomoState("paused"); setEndsAt(null) }
  const resume = () => { if (pausedRemaining && pausedRemaining > 0) { setEndsAt(Date.now() + pausedRemaining); setPomoState("focusing"); setPausedRemaining(null) } else startFocus() }
  const reset = async () => { setPomoState("ready"); setEndsAt(null); setPausedRemaining(null); setCompletedRounds(0); if (sessionIdRef.current) { try { await api.post("/study/sessions/" + sessionIdRef.current + "/stop") } catch {}; sessionIdRef.current = null } }
  const skipBreak = () => { setPomoState("ready"); setEndsAt(null); setPausedRemaining(null) }

  // ── Pomodoro: auto-transition on zero ──
  useEffect(() => {
    if (pomoState !== "focusing" && pomoState !== "short_break" && pomoState !== "long_break") return
    if (remainingMs > 0) return
    if (pomoState === "focusing") {
      const newRounds = completedRounds + 1
      setCompletedRounds(newRounds)
      playChime()
      if (newRounds % config.rounds === 0) { setPomoState("long_break"); setEndsAt(Date.now() + config.longBreakMin * 60_000); toast.success("Focus complete! Long break (" + config.longBreakMin + " min)") }
      else { setPomoState("short_break"); setEndsAt(Date.now() + config.breakMin * 60_000); toast.success("Focus complete! Break (" + config.breakMin + " min)") }
    } else if (pomoState === "short_break" || pomoState === "long_break") {
      playChime()
      setPomoState("ready"); setEndsAt(null); setPausedRemaining(null)
      if (pomoState === "long_break") { setCompletedRounds(0); toast.success("Pomodoro cycle complete!") }
      else toast.success("Break over. Ready for next focus?")
    }
  }, [remainingMs, pomoState, completedRounds, config])

  const saveConfig = async (cfg: PomodoroConfig) => { setConfig(cfg); setShowSettings(false); try { await api.put("/pomodoro/settings", cfg); toast.success("Pomodoro settings saved") } catch (e: any) { toast.error(e.message) } }

  if (isLoading) return <div className="p-10 text-center text-muted-foreground">Loading room…</div>
  if (!room) return <div className="p-10 text-center text-muted-foreground">Room not found. <Link className="text-brand-emerald" to="/rooms">Back to rooms</Link></div>
  if (left) return null

  const count = participants.length
  const isConnected = connectionState === ConnectionState.Connected || connectionState === ConnectionState.Reconnecting

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* ── Minimal header ── */}
      <div className="flex items-center justify-between px-4 h-14 border-b bg-card/60 backdrop-blur">
        <div className="flex items-center gap-3">
          <button onClick={leave} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ChevronLeft className="size-4" /> Back
          </button>
          {/* ── Free-user countdown (top-left, server-authoritative) ── */}
          {entitlement && !entitlement.isPaid && displayedFreeSeconds !== null && (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-mono tabular-nums font-semibold",
                displayedFreeSeconds <= 60
                  ? "bg-destructive/15 text-destructive"
                  : displayedFreeSeconds <= 300
                  ? "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400"
                  : "bg-muted text-muted-foreground"
              )}
              title={`Free study time: ${fmt(displayedFreeSeconds)} · resets ${new Date(entitlement.windowResetsAt).toLocaleString("en-IN")}`}
            >
              <Clock className="size-3.5" />
              Free study time: {fmt(displayedFreeSeconds)}
            </span>
          )}
        </div>
        <div className="text-center min-w-0 flex-1 px-2">
          <h1 className="font-semibold truncate text-sm md:text-base">{room.name}</h1>
          <p className="text-[10px] text-muted-foreground">
            {count} {count === 1 ? "student" : "students"} studying · Silent focus room
            {connectionState === ConnectionState.Reconnecting && " · Reconnecting…"}
          </p>
        </div>
        <div className="w-16 flex justify-end">
          {isConnected && count > 0 && <span className="size-2 rounded-full bg-brand-emerald animate-pulse" />}
        </div>
      </div>

      {/* ── Error state ── */}
      {error && (
        <div className="p-4 bg-destructive/10 text-destructive text-sm text-center">
          {error}
        </div>
      )}

      {/* ── Participant grid (real LiveKit participants, virtualized) ── */}
      <div className="flex-1 overflow-hidden p-2 md:p-3">
        {!isConnected ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            {connectionState === ConnectionState.Reconnecting ? "Reconnecting…" : "Connecting to study room…"}
          </div>
        ) : count === 0 ? (
          <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
            You're the first one here. Start studying!
          </div>
        ) : pinnedId && participants.some((p) => p.identity === pinnedId) ? (
          /* ── Pinned layout: featured tile fills the stage, others are a thumbnail strip ── */
          <PinnedLayout
            participants={participants}
            pinnedId={pinnedId}
            myId={me?.id}
            onUnpin={() => setPinnedId(null)}
            onPin={(pid) => setPinnedId(pid)}
          />
        ) : (
          /* ── Default responsive grid (virtualized for large rooms) ──
              For ≤ VIRTUALIZATION_THRESHOLD participants, render all tiles
              (simple, and IntersectionObserver handles off-screen pausing).
              For larger rooms, render only the visible window + overscan so
              we never create 1000+ <video> DOM elements. The participant count
              in the header still reflects the REAL LiveKit count. */
          <VirtualizedParticipantGrid
            participants={participants}
            myId={me?.id}
            onPin={(pid) => setPinnedId(pid)}
            onUnpin={() => setPinnedId(null)}
            onVisibleCountChange={setVisibleCount}
            policy={entitlement?.videoQuality}
          />
        )}
      </div>

      {/* ── Pomodoro + controls bar ── */}
      <div className="border-t bg-card/80 backdrop-blur">
        <div className="flex items-center justify-center gap-4 py-2 px-4">
          <div className="text-center">
            <div className={cn("text-[10px] font-bold tracking-widest uppercase",
              pomoState === "focusing" && "text-brand-emerald", pomoState === "paused" && "text-amber-500",
              (pomoState === "short_break" || pomoState === "long_break") && "text-sky-500", pomoState === "ready" && "text-muted-foreground")}>
              {pomoState === "ready" ? "Ready" : pomoState === "focusing" ? "Focus" : pomoState === "paused" ? "Paused" : pomoState === "short_break" ? "Short Break" : pomoState === "long_break" ? "Long Break" : "Done"}
            </div>
            <div className="text-3xl md:text-4xl font-bold tabular-nums font-mono">{mm}:{ss}</div>
            <div className="text-[10px] text-muted-foreground">{config.focusMin}m focus · {config.breakMin}m break{completedRounds > 0 ? " · Round " + completedRounds : ""}</div>
          </div>
        </div>
        <div className="flex items-center justify-center gap-2 pb-1">
          {pomoState === "ready" && <button onClick={startFocus} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-brand-emerald text-white text-sm font-medium hover:opacity-90"><Play className="size-4" /> Start Focus</button>}
          {pomoState === "focusing" && <button onClick={pause} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-amber-500 text-white text-sm font-medium hover:opacity-90"><Pause className="size-4" /> Pause</button>}
          {pomoState === "paused" && <button onClick={resume} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-brand-emerald text-white text-sm font-medium hover:opacity-90"><Play className="size-4" /> Resume</button>}
          {(pomoState === "short_break" || pomoState === "long_break") && <button onClick={skipBreak} className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-muted text-muted-foreground text-sm font-medium hover:bg-accent"><SkipForward className="size-4" /> Skip Break</button>}
          {pomoState !== "ready" && <button onClick={reset} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-muted-foreground text-sm hover:bg-accent" title="Reset"><RotateCcw className="size-4" /></button>}
          <button onClick={() => setShowSettings(true)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-muted-foreground text-sm hover:bg-accent" title="Customize Pomodoro"><Settings2 className="size-4" /></button>
        </div>
        <div className="flex items-center justify-center gap-3 py-2 border-t" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
          <ControlBtn active={camOn} onClick={toggleCam} on={<Video className="size-5" />} off={<VideoOff className="size-5" />} label={camOn ? "Stop video" : "Camera"} />
          <ControlBtn active={showAmbient} onClick={() => setShowAmbient(!showAmbient)} on={<Headphones className="size-5" />} off={<Headphones className="size-5" />} label="Ambient" />
          <button onClick={leave} className="inline-flex items-center justify-center size-11 rounded-full bg-destructive text-white hover:bg-destructive/90 transition-colors" title="Leave room"><PhoneOff className="size-5" /></button>
        </div>
      </div>

      {/* ── Ambient sounds popover ── */}
      {showAmbient && <div className="absolute bottom-24 right-3 w-56 z-30"><AmbientSounds compact /></div>}
      {/* ── Pomodoro settings dialog ── */}
      {showSettings && <PomodoroSettings config={config} onSave={saveConfig} onClose={() => setShowSettings(false)} />}

      {/* ── 5-minute free-allowance warning (shown ONCE per window) ── */}
      {showWarning && !entitlement?.isPaid && (
        <FreeWarningModal
          remaining={displayedFreeSeconds ?? 0}
          resetsAt={entitlement?.windowResetsAt}
          onClose={() => setShowWarning(false)}
          onUpgrade={() => { setShowWarning(false); navigate("/pricing") }}
        />
      )}

      {/* ── 5-minute video-quality upsell (free users, shown ONCE per room session) ── */}
      {/* DISTINCT from the 5-min-remaining warning above. Non-blocking; does NOT
          add minutes, reset the allowance, or interrupt the room. */}
      {showQualityUpsell && !entitlement?.isPaid && !exhausted && !showWarning && (
        <QualityUpsellModal
          onClose={() => setShowQualityUpsell(false)}
          onUpgrade={() => { setShowQualityUpsell(false); navigate("/pricing") }}
        />
      )}

      {/* ── Dev diagnostics overlay (dev only, no secrets) ── */}
      {process.env.NODE_ENV !== "production" && entitlement && (
        <DevDiagnostics
          connectionState={connectionState}
          participantCount={count}
          subscribedTrackCount={subscribedTrackCount}
          visibleCount={visibleCount}
          tier={entitlement.videoQuality.tier}
          remoteMax={entitlement.videoQuality.remoteGridMaxQuality}
          localPreset={entitlement.videoQuality.localCapturePreset}
        />
      )}

      {/* ── Exhausted free-allowance purchase overlay (server-enforced) ── */}
      {exhausted && !entitlement?.isPaid && (
        <ExhaustedOverlay
          resetsAt={entitlement?.windowResetsAt}
          onPlan={() => navigate("/pricing")}
          onSolo={() => navigate("/study")}
        />
      )}
    </div>
  )
}

// ── Real LiveKit participant tile ──
// Renders a real LiveKit camera track. Handles both local (LocalVideoTrack)
// and remote (RemoteVideoTrack) participants. Listens to participant track
// events so the tile updates when the user toggles their camera on/off.
// Pin/unpin controls appear on hover; pinning promotes the tile to full stage.
function ParticipantTile({
  participant,
  isMe,
  isPinned = false,
  onPin,
  onUnpin,
  fill = false,
}: {
  participant: Participant
  isMe?: boolean
  isPinned?: boolean
  onPin?: (id: string) => void
  onUnpin?: () => void
  fill?: boolean // when true (pinned stage / thumbnails), show a larger avatar placeholder
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [hasVideo, setHasVideo] = useState(false)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return

    let attachedTrack: any = null

    // Re-evaluate the camera publication and attach/detach the track.
    const syncTrack = () => {
      const pub = participant.getTrackPublication(Track.Source.Camera)
      const track = pub?.track ?? null
      if (track === attachedTrack) return // no change
      // detach previous
      if (attachedTrack) {
        try { attachedTrack.detach(el) } catch {}
        attachedTrack = null
      }
      // attach new
      if (track) {
        try {
          track.attach(el)
          attachedTrack = track
          setHasVideo(true)
        } catch {
          setHasVideo(false)
        }
      } else {
        setHasVideo(false)
      }
    }

    // Initial sync (camera may already be on)
    syncTrack()

    // Re-sync on track lifecycle events (covers both local and remote)
    const events = [
      ParticipantEvent.TrackPublished,
      ParticipantEvent.TrackUnpublished,
      ParticipantEvent.TrackSubscribed,
      ParticipantEvent.TrackUnsubscribed,
      ParticipantEvent.LocalTrackPublished,
      ParticipantEvent.LocalTrackUnpublished,
    ]
    const handler = () => syncTrack()
    for (const ev of events) participant.on(ev, handler)

    // Also poll briefly as a safety net for track readiness races
    const poll = setInterval(syncTrack, 2000)

    return () => {
      clearInterval(poll)
      for (const ev of events) participant.off(ev, handler)
      if (attachedTrack) {
        try { attachedTrack.detach(el) } catch {}
        attachedTrack = null
      }
    }
  }, [participant])

  const name = participant.name || participant.identity
  const initials = name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()
  const canPin = !!onPin && !!onUnpin

  return (
    <div
      className={cn(
        "group relative rounded-xl overflow-hidden border bg-gradient-to-br from-emerald-950/30 to-emerald-800/10 flex items-center justify-center min-h-0 w-full h-full",
        isPinned && "ring-2 ring-brand-emerald"
      )}
    >
      {/* Always render the <video> element so ref is available for track attach.
          Hidden via opacity when no video, so the placeholder shows underneath. */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={isMe /* avoid echo for local preview; remote has no audio anyway */}
        className={cn("w-full h-full object-cover transition-opacity", hasVideo ? "opacity-100" : "opacity-0 absolute inset-0")}
      />
      {!hasVideo && (
        <div className="absolute inset-0 flex flex-col items-center gap-2 justify-center">
          <Avatar name={name} size={fill ? 96 : 64} />
          <span className="text-xs text-muted-foreground">Camera off</span>
        </div>
      )}
      {/* Name label (bottom-left) */}
      <div className="absolute bottom-1.5 left-1.5 right-1.5 flex items-center justify-between pointer-events-none">
        <span className="text-xs font-medium text-white bg-black/40 backdrop-blur px-1.5 py-0.5 rounded truncate max-w-full">
          {name}{isMe && " (you)"}
        </span>
      </div>
      {/* Pin / Unpin button (top-right, visible on hover) */}
      {canPin && (
        <button
          onClick={() => (isPinned ? onUnpin!() : onPin!(participant.identity))}
          className={cn(
            "absolute top-1.5 right-1.5 inline-flex items-center justify-center size-8 rounded-lg bg-black/40 backdrop-blur text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/60",
            isPinned && "opacity-100 bg-brand-emerald/80"
          )}
          title={isPinned ? "Unpin" : "Pin to full screen"}
          aria-label={isPinned ? "Unpin participant" : "Pin participant to full screen"}
        >
          {isPinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
        </button>
      )}
    </div>
  )
}

// ── Pinned layout: featured (pinned) participant fills the stage,
//    remaining participants render as a horizontal thumbnail strip below.
function PinnedLayout({
  participants,
  pinnedId,
  myId,
  onUnpin,
  onPin,
}: {
  participants: Participant[]
  pinnedId: string
  myId?: string
  onUnpin: () => void
  onPin: (id: string) => void
}) {
  const pinned = participants.find((p) => p.identity === pinnedId) ?? participants[0]
  const others = participants.filter((p) => p.identity !== pinned.identity)

  return (
    <div className="flex flex-col h-full w-full gap-2">
      {/* Featured (pinned) tile fills the available stage */}
      <div className="flex-1 min-h-0 relative">
        <ParticipantTile
          participant={pinned}
          isMe={pinned.identity === myId}
          isPinned
          onPin={onPin}
          onUnpin={onUnpin}
          fill
        />
      </div>
      {/* Thumbnail strip for the remaining participants (scrolls if many) */}
      {others.length > 0 && (
        <div className="flex-shrink-0 overflow-x-auto scroll-thin pb-1">
          <div className="flex gap-2">
            {others.map((p) => (
              <div key={p.identity} className="w-[140px] sm:w-[160px] md:w-[200px] aspect-video flex-shrink-0">
                <ParticipantTile
                  participant={p}
                  isMe={p.identity === myId}
                  isPinned={false}
                  onPin={onPin}
                  onUnpin={onUnpin}
                  fill
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Virtualized participant grid ──
// For rooms up to VIRTUALIZATION_THRESHOLD participants, render every tile in
// a CSS grid. IntersectionObserver (via VisibleTile) pauses off-screen remote
// tracks so LiveKit Adaptive Stream + our explicit pause keep bandwidth low.
//
// For larger rooms, render ONLY the visible window of tiles (with a small
// overscan) inside a scroll container. The participant count in the header
// still reflects the REAL LiveKit count; only the rendered <video> elements
// are windowed. This prevents 1000+ <video> DOM elements from crashing the
// browser. Remote tracks for off-screen tiles are explicitly paused via
// pauseRemoteTrack so LiveKit stops forwarding their media.
const VIRTUALIZATION_THRESHOLD = 60 // above this, window the grid
const OVERSCAN = 6 // extra rows/cols rendered beyond the visible viewport

function VirtualizedParticipantGrid({
  participants,
  myId,
  onPin,
  onUnpin,
  onVisibleCountChange,
  policy,
}: {
  participants: Participant[]
  myId?: string
  onPin: (id: string) => void
  onUnpin: () => void
  onVisibleCountChange: (n: number) => void
  policy?: ClientVideoPolicy
}) {
  const count = participants.length
  const containerRef = useRef<HTMLDivElement>(null)

  // ── Large-room windowing state (always declared; only used when count > threshold) ──
  const cols = useMemo(() => columnsForCount(count), [count])
  const rows = Math.ceil(count / cols)
  const [visibleRange, setVisibleRange] = useState<{ start: number; end: number }>({ start: 0, end: Math.min(rows, OVERSCAN * 2 + 1) })

  // Scroll handler for large-room windowing. Only attaches the listener when
  // count > threshold (the effect is a no-op otherwise — containerRef is null
  // because the small-room branch doesn't use it).
  useEffect(() => {
    if (count <= VIRTUALIZATION_THRESHOLD) return
    const el = containerRef.current
    if (!el) return
    const onScroll = () => {
      const rowHeight = el.clientHeight / Math.max(1, Math.ceil(el.clientHeight / 120))
      const firstVisible = Math.max(0, Math.floor(el.scrollTop / Math.max(1, rowHeight)) - OVERSCAN)
      const lastVisible = Math.min(rows, firstVisible + Math.ceil(el.clientHeight / Math.max(1, rowHeight)) + OVERSCAN * 2)
      setVisibleRange((prev) => (prev.start === firstVisible && prev.end === lastVisible ? prev : { start: firstVisible, end: lastVisible }))
    }
    onScroll()
    el.addEventListener("scroll", onScroll, { passive: true })
    return () => el.removeEventListener("scroll", onScroll)
  }, [rows, count])

  // Count visible tiles for diagnostics. For small rooms, all tiles are visible.
  useEffect(() => {
    if (count <= VIRTUALIZATION_THRESHOLD) {
      onVisibleCountChange(count)
      return
    }
    const visibleTiles = (visibleRange.end - visibleRange.start) * cols
    onVisibleCountChange(Math.min(visibleTiles, count))
  }, [visibleRange, cols, count, onVisibleCountChange])

  // ── Per-tile visibility callback (shared by both branches) ──
  const handleTileVisible = useCallback((p: Participant, visible: boolean) => {
    const pub = p.getTrackPublication(Track.Source.Camera) as RemoteTrackPublication | undefined
    if (!pub) return
    if (visible) resumeRemoteTrack(pub, policy ?? VIDEO_QUALITY_FALLBACK)
    else pauseRemoteTrack(pub)
  }, [policy])

  // ── Small rooms: render all tiles in a CSS grid. ──
  // IntersectionObserver (via VisibleTile) pauses off-screen remote tracks so
  // LiveKit Adaptive Stream + our explicit pause keep bandwidth low.
  if (count <= VIRTUALIZATION_THRESHOLD) {
    return (
      <div className="h-full w-full">
        <div className={cn("grid h-full w-full mx-auto gap-2 md:gap-3 auto-rows-fr", responsiveGridClass(count))}>
          {participants.map((p) => (
            <VisibleTile
              key={p.identity}
              participant={p}
              isMe={p.identity === myId}
              onPin={onPin}
              onUnpin={onUnpin}
              onVisibleChange={(visible) => handleTileVisible(p, visible)}
            />
          ))}
        </div>
      </div>
    )
  }

  // ── Large rooms: render only the visible window + overscan. ──
  // Off-screen rows are spacer divs (no <video> elements). The participant
  // count in the header still reflects the REAL LiveKit count; only the
  // rendered <video> elements are windowed.
  return (
    <div ref={containerRef} className="h-full w-full overflow-y-auto scroll-thin">
      <div className={cn("grid w-full mx-auto gap-2 md:gap-3", responsiveGridClass(count))} style={{ gridAutoRows: "minmax(120px, 1fr)" }}>
        {Array.from({ length: rows }).map((_, rowIdx) => {
          const startTile = rowIdx * cols
          const endTile = Math.min(count, startTile + cols)
          if (rowIdx < visibleRange.start || rowIdx >= visibleRange.end) {
            return Array.from({ length: cols }).map((_, c) => (
              <div key={`spacer-${rowIdx}-${c}`} className="rounded-xl border bg-card/30" />
            ))
          }
          return Array.from({ length: cols }).map((_, c) => {
            const idx = startTile + c
            if (idx >= endTile) return <div key={`empty-${rowIdx}-${c}`} />
            const p = participants[idx]
            return (
              <VisibleTile
                key={p.identity}
                participant={p}
                isMe={p.identity === myId}
                onPin={onPin}
                onUnpin={onUnpin}
                onVisibleChange={(visible) => handleTileVisible(p, visible)}
              />
            )
          })
        })}
      </div>
    </div>
  )
}

// Fallback policy used when the server policy isn't loaded yet (e.g. during
// the brief window between connect and the first token response). Defaults to
// the free (most conservative) cap.
const VIDEO_QUALITY_FALLBACK: ClientVideoPolicy = {
  tier: "free",
  remoteGridMaxQuality: "LOW",
  remoteGridMaxHeightPx: 240,
  localCapturePreset: "h720",
}

// ── VisibleTile: wraps ParticipantTile with an IntersectionObserver. ──
// Reports visibility changes to the parent so the parent can pause/resume the
// remote LiveKit track. This COMPLEMENTS (does not replace) LiveKit Adaptive
// Stream — Adaptive Stream pauses delivery when the <video> element is not
// visible (display:none / detached); this observer also handles "in the DOM
// but scrolled out of the viewport" which Adaptive Stream may not catch.
function VisibleTile({
  participant,
  isMe,
  isPinned = false,
  onPin,
  onUnpin,
  onVisibleChange,
}: {
  participant: Participant
  isMe?: boolean
  isPinned?: boolean
  onPin?: (id: string) => void
  onUnpin?: () => void
  onVisibleChange?: (visible: boolean) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === "undefined") {
      // SSR / no IntersectionObserver: assume visible.
      onVisibleChange?.(true)
      return
    }
    let stable = true
    const io = new IntersectionObserver(
      (entries) => {
        if (!stable) return
        for (const e of entries) {
          // Use a small threshold so tiny viewport scrolls don't flap.
          onVisibleChange?.(e.isIntersecting && e.intersectionRatio > 0.05)
        }
      },
      { threshold: [0, 0.05, 0.5, 1] }
    )
    io.observe(el)
    return () => { stable = false; io.disconnect() }
  }, [onVisibleChange])
  return (
    <div ref={ref} className="min-h-0 w-full h-full">
      <ParticipantTile
        participant={participant}
        isMe={isMe}
        isPinned={isPinned}
        onPin={onPin}
        onUnpin={onUnpin}
      />
    </div>
  )
}

// ── Columns for a participant count (mirrors responsiveGridClass for large counts) ──
function columnsForCount(n: number): number {
  if (n <= 1) return 1
  if (n === 2) return 2
  if (n <= 4) return 2
  if (n <= 6) return 3
  if (n <= 9) return 3
  if (n <= 12) return 4
  if (n <= 16) return 4
  if (n <= 25) return 5
  return 6
}

// ── 5-minute video-quality upsell modal (free users only) ──
// Shown ONCE per room session, 5 minutes AFTER room entry. Non-blocking — does
// NOT add minutes, reset the allowance, or interrupt the room. The user can
// close it and continue studying. Paid users never see it.
function QualityUpsellModal({ onClose, onUpgrade }: {
  onClose: () => void
  onUpgrade: () => void
}) {
  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4 pointer-events-auto" onClick={onClose}>
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div className="size-12 rounded-xl bg-brand-emerald/10 flex items-center justify-center">
            <Sparkles className="size-6 text-brand-emerald" />
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <h3 className="text-lg font-bold">Enjoy better video quality with Premium</h3>
        <p className="text-sm text-muted-foreground">Upgrade for a better study-room experience.</p>
        <div className="rounded-lg bg-muted px-3 py-2 text-center">
          <span className="text-2xl font-bold text-brand-emerald">₹14</span>
          <span className="text-xs text-muted-foreground"> / day</span>
        </div>
        <div className="flex flex-col gap-2">
          <button onClick={onUpgrade} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-brand-emerald text-white text-sm font-medium hover:opacity-90">
            <Zap className="size-4" /> Get Daily Pass
          </button>
          <button onClick={onUpgrade} className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium hover:bg-accent">
            View Other Plans
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Dev diagnostics overlay (dev only, no secrets) ──
// Small fixed-position overlay showing participant count, subscribed tracks,
// visible count, connection state, and the active video-quality tier. Helps
// verify that virtualization + off-screen pausing are working. Never logs
// tokens, secrets, or user data.
function DevDiagnostics({
  connectionState,
  participantCount,
  subscribedTrackCount,
  visibleCount,
  tier,
  remoteMax,
  localPreset,
}: {
  connectionState: ConnectionState
  participantCount: number
  subscribedTrackCount: number
  visibleCount: number
  tier: "free" | "paid"
  remoteMax: "LOW" | "MEDIUM" | "HIGH"
  localPreset: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="fixed bottom-20 left-3 z-30 text-[10px] font-mono">
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-black/60 text-white backdrop-blur hover:bg-black/80"
        title="Toggle dev diagnostics"
      >
        <Activity className="size-3" /> {open ? "Hide" : "Stats"}
      </button>
      {open && (
        <div className="mt-1 px-2 py-1.5 rounded-md bg-black/70 text-white backdrop-blur space-y-0.5">
          <div>conn: <span className={cn(connectionState === ConnectionState.Connected ? "text-emerald-400" : "text-amber-400")}>{connectionState}</span></div>
          <div>participants: <span className="text-emerald-400">{participantCount}</span></div>
          <div>subscribed video: <span className="text-emerald-400">{subscribedTrackCount}</span></div>
          <div>visible tiles: <span className="text-emerald-400">{visibleCount}</span></div>
          <div>tier: <span className="text-emerald-400">{tier}</span> · remote≤{remoteMax} · local={localPreset}</div>
        </div>
      )}
    </div>
  )
}

// ── Control button ──
function ControlBtn({ active, onClick, on, off, label }: { active: boolean; onClick: () => void; on: React.ReactNode; off: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} className="inline-flex flex-col items-center gap-1" title={label}>
      <span className={cn("inline-flex items-center justify-center size-11 rounded-full transition-colors", active ? "bg-brand-emerald text-white" : "bg-muted text-muted-foreground hover:bg-accent")}>
        {active ? on : off}
      </span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </button>
  )
}

// ── Responsive grid class (Google Meet / Zoom style) ──
// Tiles shrink as participant count grows, but never become unusably small.
// Each tile keeps an aspect-video shape so faces stay visible.
// Breakpoints: mobile (sm/md) uses fewer columns; desktop (lg+) uses more.
// The grid fills the full stage height so tiles auto-shrink to fit.
function responsiveGridClass(n: number): string {
  // 1 participant: single tile, centered, capped to a sensible max width.
  if (n <= 1) return "grid-cols-1 max-w-3xl mx-auto"
  // 2 participants: side-by-side on all sizes.
  if (n === 2) return "grid-cols-1 sm:grid-cols-2 max-w-5xl mx-auto"
  // 3–4 participants: 2 per row on mobile, up to 2 on desktop.
  if (n <= 4) return "grid-cols-2 max-w-5xl mx-auto"
  // 5–6 participants: 2 on mobile, 3 on desktop.
  if (n <= 6) return "grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto"
  // 7–9 participants: 3 per row on mobile, 3 on desktop.
  if (n <= 9) return "grid-cols-3 max-w-6xl mx-auto"
  // 10–12 participants: 3 on mobile, 4 on desktop.
  if (n <= 12) return "grid-cols-3 lg:grid-cols-4 max-w-7xl mx-auto"
  // 13–16 participants: 4 per row on all sizes.
  if (n <= 16) return "grid-cols-4 max-w-7xl mx-auto"
  // 17–25 participants: 5 per row on desktop, 4 on mobile.
  if (n <= 25) return "grid-cols-4 lg:grid-cols-5 max-w-7xl mx-auto"
  // 26+: 6 per row on desktop, 4 on mobile (very dense but still usable).
  return "grid-cols-4 lg:grid-cols-6 max-w-7xl mx-auto"
}

// ── Pomodoro settings dialog ──
function PomodoroSettings({ config, onSave, onClose }: { config: PomodoroConfig; onSave: (c: PomodoroConfig) => void; onClose: () => void }) {
  const [focusMin, setFocusMin] = useState(String(config.focusMin))
  const [breakMin, setBreakMin] = useState(String(config.breakMin))
  const [longBreakMin, setLongBreakMin] = useState(String(config.longBreakMin))
  const [rounds, setRounds] = useState(String(config.rounds))
  const [error, setError] = useState("")

  const applyPreset = (preset: PomodoroConfig) => { setFocusMin(String(preset.focusMin)); setBreakMin(String(preset.breakMin)); setLongBreakMin(String(preset.longBreakMin)); setRounds(String(preset.rounds)); setError("") }
  const save = () => {
    const f = parseInt(focusMin, 10), b = parseInt(breakMin, 10), lb = parseInt(longBreakMin, 10), r = parseInt(rounds, 10)
    if (isNaN(f) || f < 1 || f > 180) return setError("Focus must be 1-180 min")
    if (isNaN(b) || b < 1 || b > 60) return setError("Short break must be 1-60 min")
    if (isNaN(lb) || lb < 1 || lb > 60) return setError("Long break must be 1-60 min")
    if (isNaN(r) || r < 1 || r > 12) return setError("Rounds must be 1-12")
    onSave({ focusMin: f, breakMin: b, longBreakMin: lb, rounds: r })
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-md p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-semibold flex items-center gap-2"><Settings2 className="size-5 text-brand-emerald" /> Pomodoro Settings</h3>
        <div><div className="text-xs text-muted-foreground mb-1.5">Presets</div><div className="flex flex-wrap gap-1.5">{PRESETS.map((p) => <button key={p.label} onClick={() => applyPreset(p.config)} className="text-xs px-2.5 py-1.5 rounded-lg border hover:bg-accent transition-colors">{p.label}</button>)}</div></div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1"><label className="text-xs text-muted-foreground">Focus (min)</label><input type="number" value={focusMin} onChange={(e) => setFocusMin(e.target.value)} min={1} max={180} className="w-full h-9 rounded-md border bg-background px-3 text-sm" /></div>
          <div className="space-y-1"><label className="text-xs text-muted-foreground">Short Break (min)</label><input type="number" value={breakMin} onChange={(e) => setBreakMin(e.target.value)} min={1} max={60} className="w-full h-9 rounded-md border bg-background px-3 text-sm" /></div>
          <div className="space-y-1"><label className="text-xs text-muted-foreground">Long Break (min)</label><input type="number" value={longBreakMin} onChange={(e) => setLongBreakMin(e.target.value)} min={1} max={60} className="w-full h-9 rounded-md border bg-background px-3 text-sm" /></div>
          <div className="space-y-1"><label className="text-xs text-muted-foreground">Long break after</label><input type="number" value={rounds} onChange={(e) => setRounds(e.target.value)} min={1} max={12} className="w-full h-9 rounded-md border bg-background px-3 text-sm" /></div>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <div className="flex justify-end gap-2"><button onClick={onClose} className="px-4 py-2 rounded-lg text-sm hover:bg-accent">Cancel</button><button onClick={save} className="px-4 py-2 rounded-lg bg-brand-emerald text-white text-sm font-medium hover:opacity-90">Save Settings</button></div>
      </div>
    </div>
  )
}

// ── Chime ──
function playChime() { try { const ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); const o = ctx.createOscillator(); const g = ctx.createGain(); o.connect(g); g.connect(ctx.destination); o.frequency.value = 660; o.type = "sine"; g.gain.setValueAtTime(0.0001, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.8); o.start(); o.stop(ctx.currentTime + 0.8) } catch {} }

// ── 5-minute free-allowance warning modal ──
// Shown ONCE per 24h window when the countdown crosses 5:00. The server marks
// warningShown so it doesn't reappear on refresh/rejoin. Closing it doesn't
// re-trigger it (warningShownRef prevents local re-show too).
function FreeWarningModal({ remaining, resetsAt, onClose, onUpgrade }: {
  remaining: number
  resetsAt?: string
  onClose: () => void
  onUpgrade: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-md p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div className="size-12 rounded-xl bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center">
            <Clock className="size-6 text-amber-500" />
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="Close">
            <X className="size-5" />
          </button>
        </div>
        <h3 className="text-lg font-bold">5 minutes of free study time remaining today</h3>
        <p className="text-sm text-muted-foreground">
          Continue studying with a paid plan. Your free allowance resets in{" "}
          {resetsAt ? new Date(resetsAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "24 hours"}.
        </p>
        <div className="rounded-lg bg-muted px-3 py-2 text-center">
          <span className="font-mono tabular-nums text-2xl font-bold text-amber-600 dark:text-amber-400">{fmt(remaining)}</span>
          <span className="block text-xs text-muted-foreground mt-1">remaining today</span>
        </div>
        <div className="flex flex-col gap-2">
          <button onClick={onUpgrade} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-brand-emerald text-white text-sm font-medium hover:opacity-90">
            <Zap className="size-4" /> Get Daily Pass — ₹14 / day
          </button>
          <button onClick={onUpgrade} className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium hover:bg-accent">
            View Other Plans
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Exhausted free-allowance purchase overlay ──
// Shown when the server reports the free allowance is exhausted (00:00). The
// room has already been closed by the server (heartbeat returned exhausted=true
// or the token request was refused). The user must upgrade or wait for the
// 24h reset. This overlay blocks the room view until dismissed via navigation.
function ExhaustedOverlay({ resetsAt, onPlan, onSolo }: {
  resetsAt?: string
  onPlan: () => void
  onSolo: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center space-y-5">
        <div className="size-16 rounded-2xl bg-amber-50 dark:bg-amber-950/30 flex items-center justify-center mx-auto">
          <Lock className="size-8 text-amber-500" />
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl md:text-3xl font-bold">Your 30 minutes of free study time are over.</h1>
          <p className="text-muted-foreground">Get back to your study room with a plan.</p>
          {resetsAt && (
            <p className="text-xs text-muted-foreground">
              Free access resets {new Date(resetsAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}.
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <button onClick={onPlan} className="inline-flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-brand-emerald text-white text-sm font-medium hover:opacity-90">
            <Zap className="size-4" /> Get Daily Pass — ₹14 / day
          </button>
          <button onClick={onPlan} className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium hover:bg-accent">
            <ArrowRight className="size-4" /> View Other Plans
          </button>
          <button onClick={onSolo} className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground">
            Continue with Solo Study (free) →
          </button>
        </div>
      </div>
    </div>
  )
}
