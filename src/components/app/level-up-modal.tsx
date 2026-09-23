"use client"

import { Dialog, DialogContent } from "@/components/ui/dialog"
import { Sparkles, Zap } from "lucide-react"
import { useEffect } from "react"

// Full-screen level-up celebration modal with animated badge + confetti trigger.
export function LevelUpModal({ level, open, onClose }: { level: number; open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return
    const t = setTimeout(onClose, 5000) // auto-close after 5s
    return () => clearTimeout(t)
  }, [open, onClose])

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm p-0 overflow-hidden border-0">
        <div className="relative bg-brand-gradient text-white p-8 text-center overflow-hidden">
          {/* radial glow */}
          <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(circle at 50% 30%, white 0%, transparent 60%)" }} />
          {/* floating sparkles */}
          <div className="absolute inset-0 pointer-events-none">
            {Array.from({ length: 8 }).map((_, i) => (
              <span
                key={i}
                className="absolute text-white/70"
                style={{
                  left: `${10 + i * 11}%`,
                  top: `${15 + (i % 3) * 25}%`,
                  animation: `sparkle-${i} ${1.5 + (i % 3) * 0.5}s ease-in-out infinite`,
                  fontSize: 10 + (i % 3) * 4,
                }}
              >
                ✨
              </span>
            ))}
            <style jsx>{`
              ${Array.from({ length: 8 }).map((_, i) => `
                @keyframes sparkle-${i} {
                  0%, 100% { transform: translateY(0) scale(0.8); opacity: 0.4; }
                  50% { transform: translateY(-${10 + i * 3}px) scale(1.2); opacity: 1; }
                }
              `).join("")}
            `}</style>
          </div>

          <div className="relative">
            <div className="mx-auto size-24 rounded-full bg-white/20 backdrop-blur flex items-center justify-center mb-4 ring-4 ring-white/30" style={{ animation: "pop-in 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) both" }}>
              <span className="text-5xl font-bold" style={{ textShadow: "0 2px 8px rgba(0,0,0,0.2)" }}>{level}</span>
            </div>
            <div className="inline-flex items-center gap-1.5 bg-white/20 backdrop-blur px-3 py-1 rounded-full text-xs font-semibold mb-2">
              <Sparkles className="size-3.5" /> LEVEL UP
            </div>
            <h2 className="text-2xl font-bold">You reached Level {level}!</h2>
            <p className="text-white/80 text-sm mt-1">Keep showing up. The streak grows with you. 🔥</p>
            <button
              onClick={onClose}
              className="mt-5 inline-flex items-center gap-1.5 bg-white text-emerald-700 px-4 py-2 rounded-lg text-sm font-semibold hover:bg-white/90 transition-colors"
            >
              <Zap className="size-4" /> Keep studying
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
