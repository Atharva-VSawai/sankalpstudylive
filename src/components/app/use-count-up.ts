"use client"

import { useEffect, useRef, useState } from "react"

// Animated count-up hook. Animates from 0 to `end` over `duration` ms once visible.
export function useCountUp(end: number, duration = 1400, start = 0): { ref: React.RefObject<HTMLSpanElement>, value: number } {
  const ref = useRef<HTMLSpanElement>(null)
  const [value, setValue] = useState(start)
  const started = useRef(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && !started.current) {
            started.current = true
            const t0 = performance.now()
            const tick = (now: number) => {
              const p = Math.min(1, (now - t0) / duration)
              // easeOutCubic
              const eased = 1 - Math.pow(1 - p, 3)
              setValue(Math.round(start + (end - start) * eased))
              if (p < 1) requestAnimationFrame(tick)
            }
            requestAnimationFrame(tick)
          }
        }
      },
      { threshold: 0.3 }
    )
    obs.observe(node)
    return () => obs.disconnect()
  }, [end, duration, start])

  return { ref, value }
}
