"use client"

import Image from "next/image"
import { cn } from "@/lib/utils"
import { useTheme } from "next-themes"

// ─────────────────────────────────────────────────────────────────────────────
// Sankalp Study Live — centralized branding component.
// ─────────────────────────────────────────────────────────────────────────────
// Uses the REAL Sankalp logo assets extracted from the user's uploaded brand
// board and saved to /public/branding/. The icon mark (logo-mark.png) is a
// transparent PNG showing the green-gradient "S" with leaves + book + sparkle.
//
// Theme behavior:
//   - The icon mark is the same in both themes (it's a colorful gradient on
//     transparent — strong contrast on both light and dark surfaces).
//   - The wordmark "Sankalp" uses `--brand-ink` CSS variable (dark on light,
//     light on dark) so it's always readable — pure CSS, no JS guard needed.
//
// Responsive variants:
//   - `full`: icon mark + "Sankalp" wordmark (desktop navbar)
//   - `compact`: icon mark + smaller wordmark (tablet)
//   - `icon`: icon mark only (mobile / favicon / loading screen)
//
// Performance:
//   - Uses next/image for the icon mark (optimized, lazy-loadable, no layout
//     shift via fixed width/height).
//   - The wordmark is text (zero bytes).
//   - The icon PNG is ~30 KB at 256px — negligible.
//
// Accessibility:
//   - aria-label="Sankalp Study Live" on the wrapper.
//   - The <Image> has alt="" (decorative; the aria-label covers it).

export type LogoVariant = "full" | "compact" | "icon"

export function BrandLogo({
  className,
  withText = true,
  variant,
  size = 32,
}: {
  className?: string
  withText?: boolean
  variant?: LogoVariant
  size?: number
}) {
  const showText = variant ? variant !== "icon" : withText
  const textClass =
    variant === "compact"
      ? "text-base font-bold tracking-tight"
      : "text-lg font-bold tracking-tight"

  return (
    <span
      className={cn("inline-flex items-center gap-2 select-none", className)}
      aria-label="Sankalp Study Live"
      role="img"
    >
      {/* ── The icon mark: the real Sankalp "S" with leaves + book + sparkle.
          Transparent PNG, loaded via next/image for optimization. ── */}
      <Image
        src="/branding/logo-mark.png"
        alt=""
        width={size}
        height={size}
        priority
        className="shrink-0 rounded-lg"
        style={{ width: size, height: size }}
      />
      {showText && (
        <span
          className={cn("text-brand-ink transition-colors", textClass)}
          style={{ lineHeight: 1 }}
        >
          Sankalp
        </span>
      )}
    </span>
  )
}

// ── Backward-compatible re-export ──
export function Logo({ className, withText = true, size = 32 }: { className?: string; withText?: boolean; size?: number }) {
  return <BrandLogo className={className} withText={withText} size={size} />
}
