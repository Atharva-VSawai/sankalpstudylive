"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { api, getToken } from "@/lib/api-client"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Pencil, Eraser, Trash2, X, Palette, Type, Undo2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

type Point = { x: number; y: number }
type Stroke = {
  id: string
  userId: string
  username: string
  color: string
  points: Point[]
  createdAt: number
  kind?: "text"
  text?: string
  width?: number
}

const COLORS = ["#10b981", "#f59e0b", "#ef4444", "#0ea5e9", "#8b5cf6", "#ec4899", "#111827"]

export function Whiteboard({ roomId, onOpenChange }: { roomId: string; onOpenChange?: (v: boolean) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [color, setColor] = useState(COLORS[0])
  const [tool, setTool] = useState<"pen" | "eraser" | "text">("pen")
  const [thickness, setThickness] = useState(2.5)
  const [drawing, setDrawing] = useState(false)
  const [textInput, setTextInput] = useState<{ x: number; y: number; value: string } | null>(null)
  const currentStrokeRef = useRef<Stroke | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  // resize observer to handle responsive canvas
  useEffect(() => {
    const node = containerRef.current
    if (!node) return
    const update = () => setSize({ w: node.clientWidth, h: node.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(node)
    return () => ro.disconnect()
  }, [])

  // load existing strokes via API (SSE snapshot also delivers them)
  useEffect(() => {
    api.get<{ strokes: Stroke[] }>(`/rooms/${roomId}/whiteboard`).then((d) => setStrokes(d.strokes)).catch(() => {})
  }, [roomId])

  // listen for whiteboard events via a custom event (the room view dispatches these from SSE)
  useEffect(() => {
    const onStroke = (e: any) => setStrokes((prev) => [...prev.slice(-199), e.detail.stroke])
    const onSnapshot = (e: any) => setStrokes(e.detail.strokes ?? [])
    const onClear = () => setStrokes([])
    window.addEventListener("sankalp:whiteboard", onStroke as any)
    window.addEventListener("sankalp:whiteboard_snapshot", onSnapshot as any)
    window.addEventListener("sankalp:whiteboard_clear", onClear as any)
    return () => {
      window.removeEventListener("sankalp:whiteboard", onStroke as any)
      window.removeEventListener("sankalp:whiteboard_snapshot", onSnapshot as any)
      window.removeEventListener("sankalp:whiteboard_clear", onClear as any)
    }
  }, [])

  // redraw
  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext("2d")
    if (!ctx) return
    const w = size.w || c.width
    const h = size.h || c.height
    // set canvas pixel size to match container (HiDPI)
    const dpr = window.devicePixelRatio || 1
    c.width = w * dpr
    c.height = h * dpr
    c.style.width = `${w}px`
    c.style.height = `${h}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)
    // draw all strokes
    for (const s of strokes) {
      if (s.kind === "text" && s.text) {
        // text stroke
        ctx.fillStyle = s.color
        ctx.font = "600 16px ui-sans-serif, system-ui, sans-serif"
        ctx.textBaseline = "top"
        const lines = s.text.split("\n")
        for (let i = 0; i < lines.length; i++) {
          ctx.fillText(lines[i], s.points[0].x * w, s.points[0].y * h + i * 20)
        }
        continue
      }
      if (s.points.length < 1) continue
      ctx.beginPath()
      ctx.strokeStyle = s.color
      ctx.lineWidth = s.width ?? 2.5
      ctx.lineCap = "round"
      ctx.lineJoin = "round"
      ctx.moveTo(s.points[0].x * w, s.points[0].y * h)
      for (let i = 1; i < s.points.length; i++) {
        ctx.lineTo(s.points[i].x * w, s.points[i].y * h)
      }
      ctx.stroke()
    }
    // draw current in-progress stroke
    const cur = currentStrokeRef.current
    if (cur && cur.points.length > 0) {
      ctx.beginPath()
      ctx.strokeStyle = cur.color
      ctx.lineWidth = cur.width ?? thickness
      ctx.lineCap = "round"
      ctx.lineJoin = "round"
      ctx.moveTo(cur.points[0].x * w, cur.points[0].y * h)
      for (let i = 1; i < cur.points.length; i++) {
        ctx.lineTo(cur.points[i].x * w, cur.points[i].y * h)
      }
      ctx.stroke()
    }
  }, [strokes, size, thickness])

  const getPoint = (e: React.PointerEvent): Point => {
    const rect = canvasRef.current!.getBoundingClientRect()
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (tool === "eraser") return // eraser handled as clear for now
    if (tool === "text") {
      // place a text input at the click location
      const p = getPoint(e)
      setTextInput({ x: p.x, y: p.y, value: "" })
      return
    }
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrawing(true)
    currentStrokeRef.current = {
      id: "current",
      userId: "me",
      username: "me",
      color,
      points: [getPoint(e)],
      createdAt: Date.now(),
      width: thickness,
    }
    // force redraw to show the first dot
    setStrokes((p) => [...p])
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing || !currentStrokeRef.current) return
    const p = getPoint(e)
    // throttle: only add if moved enough
    const last = currentStrokeRef.current.points[currentStrokeRef.current.points.length - 1]
    if (Math.abs(p.x - last.x) + Math.abs(p.y - last.y) < 0.003) return
    currentStrokeRef.current.points.push(p)
    setStrokes((p) => [...p]) // trigger redraw
  }

  const onPointerUp = useCallback(async () => {
    if (!drawing || !currentStrokeRef.current) return
    setDrawing(false)
    const stroke = currentStrokeRef.current
    currentStrokeRef.current = null
    if (stroke.points.length < 2) {
      setStrokes((p) => [...p])
      return
    }
    // optimistically add; server will assign id
    setStrokes((p) => [...p.slice(-199), { ...stroke }])
    try {
      await api.post(`/rooms/${roomId}/whiteboard`, { color: stroke.color, points: stroke.points, width: stroke.width ?? thickness })
    } catch (e: any) {
      toast.error(e.message || "Failed to sync stroke")
    }
  }, [drawing, roomId, thickness])

  const clearBoard = async () => {
    try {
      await api.post(`/rooms/${roomId}/whiteboard`, { action: "clear" })
      setStrokes([])
    } catch (e: any) { toast.error(e.message) }
  }

  const undoStroke = async () => {
    try {
      const res = await api.post<{ undone: boolean }>(`/rooms/${roomId}/whiteboard`, { action: "undo" })
      if (res.undone) {
        // optimistically remove our last stroke
        setStrokes((prev) => {
          const arr = [...prev]
          for (let i = arr.length - 1; i >= 0; i--) {
            if (arr[i].userId === "me" || arr[i].userId === "current") { arr.splice(i, 1); break }
          }
          return arr
        })
        toast.success("Undid your last stroke")
      } else {
        toast.info("Nothing to undo")
      }
    } catch (e: any) { toast.error(e.message) }
  }

  const submitText = async () => {
    if (!textInput) return
    const text = textInput.value.trim()
    if (!text) { setTextInput(null); return }
    try {
      const res = await api.post<{ stroke: Stroke }>(`/rooms/${roomId}/whiteboard`, {
        kind: "text", color, x: textInput.x, y: textInput.y, text,
      })
      setStrokes((prev) => [...prev.slice(-199), res.stroke])
      setTextInput(null)
      setTool("pen")
    } catch (e: any) { toast.error(e.message); setTextInput(null) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => onOpenChange?.(false)}>
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-semibold flex items-center gap-2"><Palette className="size-4 text-brand-emerald" /> Shared whiteboard</h3>
          <div className="flex items-center gap-2">
            {/* Color picker */}
            <div className="flex items-center gap-1">
              {COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => { setColor(c); setTool("pen") }}
                  className={cn("size-6 rounded-full transition-transform", color === c && tool === "pen" ? "ring-2 ring-offset-2 ring-ring scale-110" : "hover:scale-110")}
                  style={{ background: c }}
                  title={c}
                />
              ))}
            </div>
            <div className="h-6 w-px bg-border mx-1" />
            {/* Thickness control */}
            <div className="flex items-center gap-1.5 px-1">
              <input
                type="range"
                min={1}
                max={10}
                step={0.5}
                value={thickness}
                onChange={(e) => setThickness(Number(e.target.value))}
                className="w-16 h-1 accent-[var(--brand-emerald)]"
                title={`Stroke width: ${thickness}px`}
              />
              <div className="size-6 flex items-center justify-center" title={`${thickness}px`}>
                <span className="rounded-full bg-foreground" style={{ width: thickness, height: thickness }} />
              </div>
            </div>
            <div className="h-6 w-px bg-border mx-1" />
            <Button size="sm" variant={tool === "pen" ? "default" : "outline"} onClick={() => setTool("pen")} title="Pen">
              <Pencil className="size-3.5" />
            </Button>
            <Button size="sm" variant={tool === "text" ? "default" : "outline"} onClick={() => setTool("text")} title="Text">
              <Type className="size-3.5" />
            </Button>
            <Button size="sm" variant={tool === "eraser" ? "default" : "outline"} onClick={() => setTool("eraser")} title="Eraser (clears board)">
              <Eraser className="size-3.5" />
            </Button>
            <Button size="sm" variant="outline" onClick={undoStroke} title="Undo your last stroke">
              <Undo2 className="size-3.5" />
            </Button>
            <Button size="sm" variant="outline" onClick={clearBoard} title="Clear board">
              <Trash2 className="size-3.5" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => onOpenChange?.(false)}><X className="size-4" /></Button>
          </div>
        </div>
        <div ref={containerRef} className="flex-1 relative bg-white dark:bg-zinc-900 touch-none">
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerLeave={onPointerUp}
            className={cn("absolute inset-0", tool === "pen" ? "cursor-crosshair" : tool === "text" ? "cursor-text" : "cursor-not-allowed")}
          />
          {strokes.length === 0 && !drawing && !textInput && (
            <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-sm pointer-events-none">
              Draw a formula, a diagram, or a quick concept map. Everyone in the room sees it in real time.
            </div>
          )}
          {tool === "text" && !textInput && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 text-xs px-3 py-1 rounded-full pointer-events-none">
              Click anywhere to place text
            </div>
          )}
          {textInput && (
            <Input
              autoFocus
              value={textInput.value}
              onChange={(e) => setTextInput({ ...textInput, value: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); submitText() }
                if (e.key === "Escape") { setTextInput(null) }
              }}
              onBlur={submitText}
              placeholder="Type and press Enter…"
              maxLength={200}
              className="absolute z-10 h-8 w-48 text-sm"
              style={{
                left: `${textInput.x * 100}%`,
                top: `${textInput.y * 100}%`,
                color,
                borderColor: color,
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
