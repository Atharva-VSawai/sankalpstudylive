"use client"

import Image from "next/image"
import { cn } from "@/lib/utils"
import { useTheme } from "next-themes"

// ─────────────────────────────────────────────────────────────────────────────
// Sankalp Study Live — centralized branding component.
// ─────────────────────────────────────────────────────────────────────────────
// Uses the supplied Sankalp brand artwork saved as clean transparent PNGs in
// /public/branding/. Full wordmarks switch between the light and dark artwork;
// the mark-only asset is shared because its green/gold mark works on both.
//
// Theme behavior:
//   - light theme: logo-full-light.png (dark teal wordmark)
//   - dark theme: logo-full-dark.png (white wordmark)
//
// Responsive variants:
//   - `full`: icon mark + "Sankalp" wordmark (desktop navbar)
//   - `compact`: icon mark + smaller wordmark (tablet)
//   - `icon`: icon mark only (mobile / favicon / loading screen)
//
// Performance: the full logo is a fixed-size local next/image asset, so the
// header has no layout shift and the browser can cache the selected theme file.
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
  const { resolvedTheme } = useTheme()
  const fullLogo = resolvedTheme === "dark"
    ? "/branding/logo-full-dark.png"
    : "/branding/logo-full-light.png"
  const logoWidth = variant === "compact" ? Math.round(size * 3.4) : Math.round(size * 4.2)
  const logoHeight = Math.round(logoWidth / 2)

  return (
    <span
      className={cn("inline-flex items-center gap-2 select-none", className)}
      aria-label="Sankalp Study Live"
      role="img"
    >
      {showText ? (
        <Image
          src={fullLogo}
          alt="Sankalp Study Live"
          width={logoWidth}
          height={logoHeight}
          priority
          className="shrink-0 object-contain object-left"
          style={{ width: logoWidth, height: logoHeight }}
        />
      ) : (
        <Image
          src="/branding/logo-mark.png"
          alt=""
          width={size}
          height={size}
          priority
          className="shrink-0 rounded-lg"
          style={{ width: size, height: size }}
        />
      )}
    </span>
  )
}

// ── Backward-compatible re-export ──
export function Logo({ className, withText = true, size = 32 }: { className?: string; withText?: boolean; size?: number }) {
  return <BrandLogo className={className} withText={withText} size={size} />
}
