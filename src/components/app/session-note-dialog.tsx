"use client"

import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { api, ApiError } from "@/lib/api-client"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { NotebookPen, X } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

const SUGGESTED_TAGS = ["revision", "mock-test", "concept", "practice", "doubt-clearing", "notes"]

export function SessionNoteDialog({
  sessionId,
  open,
  onOpenChange,
  existingNote,
  existingTags,
}: {
  sessionId: string
  open: boolean
  onOpenChange: (v: boolean) => void
  existingNote?: string | null
  existingTags?: string[]
}) {
  const qc = useQueryClient()
  const [note, setNote] = useState(existingNote ?? "")
  const [tags, setTags] = useState<string[]>(existingTags ?? [])
  const [customTag, setCustomTag] = useState("")

  const save = useMutation({
    mutationFn: () => api.patch(`/study/sessions/${sessionId}/note`, { note, tags }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["study", "sessions"] })
      toast.success("Note saved")
      onOpenChange(false)
    },
    onError: (e: ApiError) => toast.error(e.message),
  })

  const toggleTag = (t: string) => {
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
  }
  const addCustomTag = () => {
    const t = customTag.trim().toLowerCase().replace(/[^a-z0-9-]/g, "")
    if (!t) return
    if (!tags.includes(t)) setTags((prev) => [...prev, t])
    setCustomTag("")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><NotebookPen className="size-5 text-brand-emerald" /> Session reflection</DialogTitle>
          <DialogDescription>Jot down what you studied. You can tag it for easy recall later.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Revised Network Theorems — Thevenin & Norton. Did 15 PYQs."
              rows={4}
              maxLength={1000}
            />
            <div className="text-right text-[10px] text-muted-foreground">{note.length}/1000</div>
          </div>
          <div className="space-y-1.5">
            <Label>Tags</Label>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTED_TAGS.map((t) => (
                <button
                  key={t}
                  onClick={() => toggleTag(t)}
                  className={cn(
                    "text-xs px-2 py-1 rounded-full border transition-colors",
                    tags.includes(t) ? "bg-brand-emerald text-white border-brand-emerald" : "hover:bg-accent"
                  )}
                >
                  #{t}
                </button>
              ))}
              {tags.filter((t) => !SUGGESTED_TAGS.includes(t)).map((t) => (
                <button
                  key={t}
                  onClick={() => toggleTag(t)}
                  className="text-xs px-2 py-1 rounded-full bg-brand-emerald text-white border border-brand-emerald inline-flex items-center gap-1"
                >
                  #{t} <X className="size-3" />
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={customTag}
                onChange={(e) => setCustomTag(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomTag() } }}
                placeholder="custom tag"
                className="text-sm"
              />
              <Button size="sm" variant="outline" onClick={addCustomTag}>Add</Button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isPending}>Save note</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
