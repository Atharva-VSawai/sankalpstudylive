"use client"

import { cn } from "@/lib/utils"
import { BrandLogo } from "@/components/branding/logo"

// Re-export the centralized BrandLogo so existing `import { Logo } from brand`
// callers get the theme-aware, responsive logo automatically. The old Logo
// signature (className, withText, size) is preserved for backward compat.
export function Logo({ className, withText = true }: { className?: string; withText?: boolean }) {
  return <BrandLogo className={className} withText={withText} />
}

export function Avatar({
  name,
  src,
  size = 36,
  ring,
  speaking,
  className,
}: {
  name?: string
  src?: string | null
  size?: number
  ring?: boolean
  speaking?: boolean
  className?: string
}) {
  const initials = (name || "?")
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase()
  return (
    <span
      className={cn(
        "relative inline-flex items-center justify-center rounded-full overflow-hidden bg-brand-gradient text-white font-semibold shrink-0",
        ring && "ring-2 ring-background",
        speaking && "speaking-ring",
        className
      )}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {src ? (
        <img src={src} alt={name || "avatar"} className="w-full h-full object-cover" />
      ) : (
        initials
      )}
    </span>
  )
}

export function LiveDot({ label = "LIVE" }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="relative flex">
        <span className="absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-60 animate-ping" />
        <span className="relative inline-flex size-2 rounded-full bg-red-500" />
      </span>
      <span className="text-[10px] font-bold tracking-wider text-red-500">{label}</span>
    </span>
  )
}

export function formatMinutes(min: number): string {
  if (min < 60) return `${Math.round(min)}m`
  const h = Math.floor(min / 60)
  const m = Math.round(min % 60)
  return m ? `${h}h ${m}m` : `${h}h`
}

export function timeAgo(date: Date | string | number): string {
  const t = typeof date === "object" ? date.getTime() : new Date(date).getTime()
  const diff = Date.now() - t
  const s = Math.floor(diff / 1000)
  if (s < 60) return "just now"
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d ago`
  return new Date(t).toLocaleDateString()
}

export const EXAM_META: Record<string, { color: string; tagline: string }> = {
  GATE: { color: "#10b981", tagline: "Engineering / M.Tech / PSU" },
  JEE: { color: "#f59e0b", tagline: "IIT / NIT / Engineering" },
  NEET: { color: "#ef4444", tagline: "MBBS / Medical" },
  UPSC: { color: "#8b5cf6", tagline: "Civil Services" },
  CAT: { color: "#0ea5e9", tagline: "MBA / IIM" },
  SSC: { color: "#14b8a6", tagline: "Govt Jobs (CGL/CHSL)" },
  Banking: { color: "#eab308", tagline: "IBPS / SBI / RBI" },
  MPSC: { color: "#a855f7", tagline: "Maharashtra State PSC" },
  Placements: { color: "#ec4899", tagline: "Campus placements" },
  DSA: { color: "#22c55e", tagline: "Coding / LeetCode" },
  "General Study": { color: "#64748b", tagline: "Open study" },
}
