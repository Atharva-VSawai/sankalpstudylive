"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import { useRouter, Link } from "@/lib/router"
import { useAuth } from "@/lib/auth-context"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, LiveDot, Logo, EXAM_META, formatMinutes } from "@/components/app/brand"
import { ArrowRight, Users, Video, Flame, Trophy, BookOpen, Clock, Sparkles, ChevronRight, Timer, ShieldCheck, Zap } from "lucide-react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"

export function LandingView() {
  const { navigate } = useRouter()
  const { me } = useAuth()

  const { data: commData } = useQuery({
    queryKey: ["communities", "landing"],
    queryFn: () => api.get<{ communities: any[] }>("/communities"),
  })
  const { data: roomsData } = useQuery({
    queryKey: ["rooms", "landing"],
    queryFn: () => api.get<{ rooms: any[] }>("/rooms", { live: true, limit: 6 }),
  })

  const communities = commData?.communities ?? []
  const liveRooms = roomsData?.rooms ?? []

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden hero-glow">
        <div className="mx-auto max-w-7xl px-4 py-20 md:py-28">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="fade-in">
              <span className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
                <span className="size-1.5 rounded-full bg-brand-emerald" /> Built for India's exam aspirants
              </span>
              <h1 className="mt-5 text-4xl md:text-6xl font-bold tracking-tight leading-[1.05]">
                Study with people preparing for the{" "}
                <span className="text-brand-gradient">same goal.</span>
              </h1>
              <p className="mt-5 text-lg text-muted-foreground max-w-xl">
                Join live video study rooms and exam communities — GATE, JEE, NEET, UPSC, CAT, SSC, Banking, MPSC, Placements & DSA. Show up, stay accountable, and grow your streak.
              </p>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <Button size="lg" className="h-12 px-6 text-base" onClick={() => navigate(me ? "/communities" : "/signup")}>
                  Start Studying <ArrowRight className="size-4" />
                </Button>
                <Button size="lg" variant="outline" className="h-12 px-6 text-base" onClick={() => navigate("/rooms")}>
                  Browse live rooms
                </Button>
              </div>
              <div className="mt-8 flex items-center gap-6 text-sm text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><ShieldCheck className="size-4 text-brand-emerald" /> Mic defaults off</span>
                <span className="inline-flex items-center gap-1.5"><Timer className="size-4 text-brand-emerald" /> Pomodoro built-in</span>
                <span className="inline-flex items-center gap-1.5"><Flame className="size-4 text-accent-foreground text-orange-500" /> Streaks</span>
              </div>
            </div>

            {/* Hero visual: mock live room grid */}
            <div className="relative fade-in">
              <div className="absolute -inset-4 bg-brand-gradient opacity-10 blur-2xl rounded-3xl" />
              <Card className="relative overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <LiveDot />
                      <span className="text-sm font-semibold">Focus Room · 25 min Pomodoro</span>
                    </div>
                    <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><Users className="size-3" /> 6 studying</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      ["Aarav", "GATE"], ["Diya", "NEET"], ["Vihaan", "UPSC"],
                      ["Ananya", "JEE"], ["Kabir", "CAT"], ["Ishita", "DSA"],
                    ].map(([n, exam], i) => (
                      <div key={i} className="aspect-[4/3] rounded-lg bg-gradient-to-br from-emerald-900/40 to-emerald-700/20 border border-emerald-500/20 flex flex-col items-center justify-center gap-1.5 relative">
                        <Avatar name={n} size={40} ring />
                        <span className="text-[10px] font-medium">{n}</span>
                        <span className="text-[9px] text-muted-foreground">{exam}</span>
                        {i === 0 && <span className="absolute top-1 right-1 text-[8px] bg-brand-emerald text-white px-1 rounded">host</span>}
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center justify-between rounded-lg bg-accent/40 px-3 py-2">
                    <span className="text-xs inline-flex items-center gap-1.5"><Timer className="size-3.5 text-brand-emerald" /> Focus ends in <span className="font-mono font-semibold">14:32</span></span>
                    <span className="text-xs inline-flex items-center gap-1"><Sparkles className="size-3.5 text-accent-foreground" /> +150 XP</span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* Live rooms strip */}
      <section className="border-y bg-card/40">
        <div className="mx-auto max-w-7xl px-4 py-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2"><LiveDot /> Live right now</h2>
            <Link to="/rooms" className="text-sm text-brand-emerald hover:underline inline-flex items-center gap-1">All rooms <ChevronRight className="size-3.5" /></Link>
          </div>
          {liveRooms.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">No live rooms at the moment. <Link className="text-brand-emerald" to="/rooms">Browse all rooms →</Link></CardContent></Card>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {liveRooms.slice(0, 6).map((r: any) => (
                <Link key={r.id} to={`/rooms/${r.id}`}>
                  <Card className="hover:shadow-md transition-shadow h-full">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <LiveDot label="LIVE" />
                        <span className="text-xs text-muted-foreground inline-flex items-center gap-1"><Users className="size-3" /> {r.participantCount}/{r.maxParticipants}</span>
                      </div>
                      <h3 className="font-semibold truncate">{r.name}</h3>
                      <p className="text-xs text-muted-foreground truncate">{r.description || "Focus room"}</p>
                      <div className="mt-3 flex items-center justify-between">
                        <span className="text-xs inline-flex items-center gap-1.5">
                          <Avatar name={r.owner?.displayName} size={18} />
                          {r.owner?.displayName}
                        </span>
                        {r.community && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-medium" style={{ background: `${r.community.color}22`, color: r.community.color }}>
                            {r.community.name}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Communities */}
      <section className="mx-auto max-w-7xl px-4 py-14">
        <div className="text-center max-w-2xl mx-auto mb-8">
          <h2 className="text-2xl md:text-3xl font-bold">Find your exam community</h2>
          <p className="mt-2 text-muted-foreground">Pick a goal. Join rooms hosted by people on the same journey.</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {communities.map((c: any) => (
            <Link key={c.id} to={`/communities/${c.slug}`}>
              <Card className="hover:shadow-md transition-all hover:-translate-y-0.5 h-full">
                <CardContent className="p-4 flex items-center gap-3">
                  <span className="size-10 rounded-xl flex items-center justify-center text-white font-bold shrink-0" style={{ background: c.color }}>
                    {c.name.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{c.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{c.liveRooms > 0 ? `${c.liveRooms} live · ` : ""}{c.memberCount} members</div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-card/40 border-y">
        <div className="mx-auto max-w-7xl px-4 py-14">
          <div className="text-center max-w-2xl mx-auto mb-10">
            <h2 className="text-2xl md:text-3xl font-bold">How Sankalp works</h2>
            <p className="mt-2 text-muted-foreground">Three steps to a better study habit.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: <Users className="size-5" />, n: "1", t: "Join a community", d: "Pick your exam — GATE, NEET, UPSC, CAT and more — and meet aspirants on the same path." },
              { icon: <Video className="size-5" />, n: "2", t: "Enter a live study room", d: "Camera optional, mic off by default. A shared Pomodoro keeps everyone in sync." },
              { icon: <Trophy className="size-5" />, n: "3", t: "Build your streak", d: "Server-tracked study time earns XP, badges and leaderboard rank. Show up daily." },
            ].map((s) => (
              <Card key={s.n}>
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="size-10 rounded-xl bg-brand-gradient text-white flex items-center justify-center">{s.icon}</span>
                    <span className="text-3xl font-bold text-muted-foreground/40">{s.n}</span>
                  </div>
                  <h3 className="font-semibold text-lg">{s.t}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{s.d}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Study statistics — truthful, demo-account only */}
      <section className="mx-auto max-w-7xl px-4 py-14">
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            { icon: <Flame className="size-5 text-orange-500" />, label: "Max streak", value: "100 days", sub: "Badge: Century of Focus" },
            { icon: <Clock className="size-5 text-brand-emerald" />, label: "Focus sessions", value: "Pomodoro", sub: "25 / 5 / 15 minute cycles" },
            { icon: <BookOpen className="size-5 text-accent-foreground" />, label: "Exam goals", value: `${communities.length || 11} tracks`, sub: "GATE, JEE, NEET, UPSC & more" },
          ].map((s, i) => (
            <Card key={i}><CardContent className="p-5 flex items-center gap-4">
              <span className="size-11 rounded-xl bg-accent/40 flex items-center justify-center">{s.icon}</span>
              <div>
                <div className="text-xs text-muted-foreground">{s.label}</div>
                <div className="text-xl font-bold">{s.value}</div>
                <div className="text-xs text-muted-foreground">{s.sub}</div>
              </div>
            </CardContent></Card>
          ))}
        </div>
        <p className="mt-4 text-xs text-muted-foreground text-center">Some numbers above reflect demo accounts seeded for this preview, not real user statistics.</p>
      </section>

      {/* Exam categories */}
      <section className="bg-card/40 border-y">
        <div className="mx-auto max-w-7xl px-4 py-14">
          <h2 className="text-2xl md:text-3xl font-bold text-center mb-8">Exam categories</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {Object.entries(EXAM_META).map(([exam, meta]) => (
              <Link key={exam} to={`/communities/${exam.toLowerCase().replace(/\s+/g, "-")}`}>
                <Card className="hover:shadow-md transition-shadow h-full">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold">{exam}</span>
                      <span className="size-2.5 rounded-full" style={{ background: meta.color }} />
                    </div>
                    <p className="text-xs text-muted-foreground">{meta.tagline}</p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto max-w-3xl px-4 py-14">
        <h2 className="text-2xl md:text-3xl font-bold text-center mb-8">Frequently asked questions</h2>
        <Accordion type="single" collapsible className="w-full">
          {[
            ["Is the microphone on by default?", "No. Your microphone is muted when you join every room. You choose when to unmute. Camera is also off by default — you can study with just your presence shown."],
            ["Do I need to show my face?", "No. Many aspirants study with the camera off. You still appear in the room so others know they're not studying alone."],
            ["How is study time tracked?", "When you start studying, the server records the start time. When you stop, the server computes the duration and awards XP. We never trust client-reported durations, so leaderboards stay fair."],
            ["What are streaks?", "A streak counts consecutive days you studied. Study at least one session each day to keep it alive. Time zones are respected, so your streak resets at your local midnight."],
            ["Is Sankalp free?", "Yes. Live study rooms and communities are free. Sankalp Plus adds deep analytics, unlimited hosted rooms and custom goals."],
            ["Will there be an Android app?", "Yes — a native Android app is planned and will use the exact same backend, database, communities, rooms and study data. Nothing is duplicated."],
          ].map(([q, a], i) => (
            <AccordionItem key={i} value={`i-${i}`}>
              <AccordionTrigger className="text-left">{q}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{a}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-4 pb-16">
        <Card className="overflow-hidden border-0">
          <CardContent className="relative p-10 md:p-16 bg-brand-gradient text-white text-center">
            <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, white 1px, transparent 1px)", backgroundSize: "24px 24px" }} />
            <div className="relative">
              <Logo className="justify-center mb-4" />
              <h2 className="text-3xl md:text-4xl font-bold">Your resolve starts today.</h2>
              <p className="mt-3 text-white/80 max-w-xl mx-auto">Join thousands of aspirants studying together. Pick a room, press start, and let the streak begin.</p>
              <Button size="lg" variant="secondary" className="mt-6 h-12 px-8 text-base" onClick={() => navigate(me ? "/dashboard" : "/signup")}>
                Start Studying <ArrowRight className="size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
