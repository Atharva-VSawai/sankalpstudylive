"use client"

import { useState } from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/api-client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Film, Play, Trash2, Loader2, Clock } from "lucide-react"
import { toast } from "sonner"

// ── Profile → Timelapses section ──
// Cost-first: loads ONLY metadata + thumbnails initially. Clicking a timelapse
// requests a short-lived signed URL and plays that ONE video. No preloading of
// videos. No autoplay. The thumbnail is loaded via /api/timelapses/[id]/thumb
// which returns a redirect to a short-lived signed URL (so the browser caches
// it for the session but it expires).
function fmtDuration(s: number): string {
  const m = Math.floor(s / 60)
  const r = s % 60
  return m > 0 ? `${m}m ${r}s` : `${r}s`
}

function fmtStudyDuration(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

export function ProfileTimelapses() {
  const qc = useQueryClient()
  const [playing, setPlaying] = useState<{ id: string; url: string } | null>(null)

  // Load metadata only (no video). Paginated.
  const { data, isLoading } = useQuery({
    queryKey: ["timelapses"],
    queryFn: () => api.get<{ timelapses: any[]; nextCursor: string | null }>("/timelapses"),
  })
  const timelapses = data?.timelapses ?? []

  // Request a signed URL for one timelapse on demand.
  const playMut = useMutation({
    mutationFn: (id: string) => api.get<{ url: string }>(`/timelapses/${id}/signed-url`),
    onSuccess: (res, id) => setPlaying({ id, url: res.url }),
    onError: (e: any) => toast.error(e?.message ?? "Could not load timelapse"),
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.del(`/timelapses/${id}`),
    onSuccess: () => {
      toast.success("Timelapse deleted")
      qc.invalidateQueries({ queryKey: ["timelapses"] })
      setPlaying(null)
    },
    onError: (e: any) => {
      if (e?.code === "STORAGE_DELETE_FAILED") toast.error("Could not delete storage files; please try again.")
      else toast.error(e?.message ?? "Delete failed")
    },
  })

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Film className="size-4 text-brand-emerald" /> Study Timelapses
          <span className="text-xs font-normal text-muted-foreground ml-auto">{timelapses.length}</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-center py-6"><Loader2 className="size-6 mx-auto animate-spin text-muted-foreground" /></div>
        ) : timelapses.length === 0 ? (
          <div className="text-center py-6">
            <Film className="size-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm text-muted-foreground">No timelapses yet.</p>
            <p className="text-xs text-muted-foreground mt-1">Enable timelapse in a live room to start recording your study sessions.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {timelapses.map((t) => (
              <div key={t.id} className="group relative rounded-lg overflow-hidden border bg-card hover:shadow-md transition-shadow">
                {/* Thumbnail (signed URL via redirect; lazy-loaded) */}
                <div className="relative aspect-video bg-muted">
                  <img
                    src={`/api/timelapses/${t.id}/thumb`}
                    alt="Timelapse thumbnail"
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                  {/* Play button overlay */}
                  {t.status === "READY" && (
                    <button
                      onClick={() => playMut.mutate(t.id)}
                      className="absolute inset-0 flex items-center justify-center bg-black/30 hover:bg-black/50 transition-colors"
                      title="Play timelapse"
                    >
                      <span className="size-10 rounded-full bg-white/90 flex items-center justify-center">
                        <Play className="size-5 text-black ml-0.5" fill="black" />
                      </span>
                    </button>
                  )}
                  {t.status === "PROCESSING" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                      <Loader2 className="size-5 animate-spin text-white" />
                    </div>
                  )}
                  {t.status === "FAILED" && (
                    <div className="absolute inset-0 flex items-center justify-center bg-destructive/40 text-white text-xs px-2 text-center">
                      Upload failed
                    </div>
                  )}
                  {/* Duration badge */}
                  <div className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded bg-black/60 text-white text-[10px] font-mono">
                    {fmtDuration(t.timelapseDurationSeconds)}
                  </div>
                </div>
                {/* Metadata */}
                <div className="p-2">
                  <div className="text-xs font-medium truncate">
                    {fmtStudyDuration(t.studyDurationSeconds)} study
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {new Date(t.createdAt).toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" })}
                  </div>
                </div>
                {/* Delete button (on hover) */}
                <button
                  onClick={() => { if (confirm("Delete this timelapse? This cannot be undone.")) deleteMut.mutate(t.id) }}
                  className="absolute top-1.5 right-1.5 size-7 rounded-lg bg-black/50 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive flex items-center justify-center"
                  title="Delete timelapse"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Playback modal */}
        {playing && (
          <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setPlaying(null)}>
            <div className="max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
              <video
                src={playing.url}
                controls
                autoPlay
                className="w-full rounded-lg bg-black"
                style={{ maxHeight: "70vh" }}
              />
              <div className="mt-2 flex justify-between items-center">
                <span className="text-xs text-muted-foreground">This signed URL expires in 5 minutes.</span>
                <Button variant="outline" size="sm" onClick={() => setPlaying(null)}>Close</Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
