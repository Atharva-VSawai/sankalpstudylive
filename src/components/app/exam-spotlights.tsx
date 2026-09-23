"use client"

import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import { useRouter, Link } from "@/lib/router"
import { useAuth } from "@/lib/auth-context"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { EXAM_META } from "@/components/app/brand"
import { ArrowRight, Users, Clock, BookOpen, Target } from "lucide-react"

// Exam-specific spotlight cards on the landing — each shows the exam's community
// with a tailored CTA. Clearly uses demo data (no fabricated user counts beyond
// what the seeded communities actually have).
export function ExamSpotlights() {
  const { navigate } = useRouter()
  const { me } = useAuth()
  const { data } = useQuery({
    queryKey: ["communities", "spotlight"],
    queryFn: () => api.get<{ communities: any[] }>("/communities"),
  })
  const communities = data?.communities ?? []
  // pick the 6 featured / largest for spotlights
  const spotlights = communities.filter((c: any) => c.isFeatured).slice(0, 6)
  const shown = spotlights.length > 0 ? spotlights : communities.slice(0, 6)

  if (shown.length === 0) return null

  return (
    <section className="bg-card/40 border-y">
      <div className="mx-auto max-w-7xl px-4 py-14">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <h2 className="text-2xl md:text-3xl font-bold">Find your exam community</h2>
          <p className="mt-2 text-muted-foreground">Tailored rooms and aspirants for every major Indian exam.</p>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {shown.map((c: any) => {
            const meta = EXAM_META[c.examGoal] ?? EXAM_META["General Study"]
            return (
              <Card key={c.id} className="overflow-hidden hover:shadow-lg transition-all hover:-translate-y-1 group">
                <div className="h-1.5" style={{ background: c.color }} />
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <h3 className="font-bold text-lg" style={{ color: c.color }}>{c.name}</h3>
                      <p className="text-xs text-muted-foreground">{meta?.tagline ?? c.examGoal}</p>
                    </div>
                    <span
                      className="size-12 rounded-xl flex items-center justify-center text-white font-bold shrink-0"
                      style={{ background: c.color }}
                    >
                      {c.name.slice(0, 2).toUpperCase()}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{c.description}</p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
                    <span className="inline-flex items-center gap-1"><Users className="size-3" /> {c.memberCount}</span>
                    {c.liveRooms > 0 && (
                      <span className="inline-flex items-center gap-1 text-red-500">
                        <span className="size-1.5 rounded-full bg-red-500 animate-pulse" /> {c.liveRooms} live
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1"><BookOpen className="size-3" /> Rooms</span>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      style={{ background: c.color }}
                      onClick={() => navigate(me ? `/communities/${c.slug}` : "/signup")}
                    >
                      <Target className="size-3.5" /> {me ? "Open community" : "Join"}
                    </Button>
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => navigate(me ? `/rooms` : "/signup")}>
                      Browse rooms <ArrowRight className="size-3.5" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
        <div className="text-center mt-8">
          <Link to="/communities" className="text-sm text-brand-emerald hover:underline inline-flex items-center gap-1">
            See all {communities.length || 11} communities <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </div>
    </section>
  )
}
