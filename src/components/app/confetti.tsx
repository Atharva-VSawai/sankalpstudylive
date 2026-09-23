"use client"

import { useEffect, useState, useCallback } from "react"

// Lightweight CSS confetti burst — no canvas, no deps.
// Renders ~80 colored squares that animate outward + fall, then cleans up.

type ConfettiPiece = {
  id: number
  left: number
  delay: number
  duration: number
  color: string
  rotate: number
  size: number
  drift: number
}

const COLORS = ["#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#0ea5e9", "#ec4899", "#22c55e"]

export function useConfetti() {
  const [pieces, setPieces] = useState<ConfettiPiece[]>([])

  const burst = useCallback((count = 80) => {
    const next: ConfettiPiece[] = Array.from({ length: count }, (_, i) => ({
      id: Date.now() + i,
      left: 40 + Math.random() * 20, // start around center-top
      delay: Math.random() * 0.15,
      duration: 1.6 + Math.random() * 1.4,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      rotate: Math.random() * 360,
      size: 6 + Math.random() * 8,
      drift: (Math.random() - 0.5) * 60,
    }))
    setPieces(next)
    // cleanup after animation
    setTimeout(() => setPieces([]), 3500)
  }, [])

  const ConfettiLayer = pieces.length > 0 ? (
    <div className="pointer-events-none fixed inset-0 z-[100] overflow-hidden">
      {pieces.map((p) => (
        <div
          key={p.id}
          className="absolute top-[15%]"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.size * 0.6,
            background: p.color,
            transform: `rotate(${p.rotate}deg)`,
            borderRadius: 1,
            animation: `confetti-fall ${p.duration}s ease-in ${p.delay}s forwards`,
            // @ts-expect-error custom prop
            "--drift": `${p.drift}px`,
          }}
        />
      ))}
      <style jsx global>{`
        @keyframes confetti-fall {
          0% {
            transform: translate(0, -20px) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translate(var(--drift), 100vh) rotate(720deg);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  ) : null

  return { burst, ConfettiLayer }
}
