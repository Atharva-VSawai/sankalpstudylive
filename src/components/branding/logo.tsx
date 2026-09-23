"use client"

import { cn } from "@/lib/utils"

// ─────────────────────────────────────────────────────────────────────────────
// Sankalp Study Live — centralized branding component.
// ─────────────────────────────────────────────────────────────────────────────
// The Sankalp logo is a circular mark with a green-to-gold gradient and a
// stylized mountain/tent shape (the "resolve" mark), plus the "Sankalp"
// wordmark. This component renders the logo with:
//
//   - Theme-aware text color: uses `--brand-ink` which is dark on light themes
//     and light on dark themes, so the wordmark is always readable. Because
//     `--brand-ink` is a CSS variable that flips via the `.dark` class, the
//     wordmark adapts automatically — no JS mounted guard needed (avoids the
//     hydration mismatch + the setState-in-effect lint rule).
//   - The gradient mark is identical in both themes (it's colorful, so it has
//     strong contrast on both light and dark surfaces).
//   - Responsive variants: `full` (mark + text), `compact` (mark + smaller
//     text), `icon` (mark only). The `withText` prop is the legacy toggle.
//   - Accessibility: alt text "Sankalp Study Live" via aria-label.
//   - No layout shift: fixed size via the `size` prop; the SVG uses
//     `viewBox` so it scales without distortion.
//   - The SVG is inline (not an <img>) so it inherits CSS variables, stays
//     crisp at any DPI, and adds zero network requests.
//
// If you later have separate light/dark PNG/WebP logo files, drop them in
// /public/branding/ and this component can switch between them using the
// `resolvedTheme` from next-themes. For now, the SVG mark + theme-aware
// `--brand-ink` wordmark handles both themes without separate files.

export type LogoVariant = "full" | "compact" | "icon"

export function BrandLogo({
  className,
  withText = true,
  variant,
  size = 32,
}: {
  className?: string
  withText?: boolean // legacy: show/hide the wordmark
  variant?: LogoVariant // responsive variant: full | compact | icon
  size?: number // the mark size in px (wordmark scales with it)
}) {
  // `variant` wins over `withText` if both are supplied; `icon` hides text.
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
      {/* ── The mark: a rounded square with the green→gold gradient and the
          "resolve" tent/mountain shape inside. SVG is inline so it stays
          crisp at any DPI and inherits the brand CSS variables. ── */}
      <span
        className="relative inline-flex items-center justify-center rounded-xl bg-brand-gradient text-white shadow-sm shrink-0"
        style={{ width: size, height: size }}
      >
        <svg
          viewBox="0 0 24 24"
          className="size-[62.5%]"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          {/* The "resolve" mark: a mountain/tent peak + a small seedling dot.
              This matches the Sankalp brand (Sanskrit for "commitment/resolve"). */}
          <path d="M4 19h16" />
          <path d="M5 19c0-5 3-9 7-9s7 4 7 9" />
          <path d="M12 4c1.2 1.2 1.2 2.8 0 4-1.2-1.2-1.2-2.8 0-4Z" fill="currentColor" stroke="none" />
        </svg>
      </span>
      {showText && (
        <span
          // --brand-ink is dark on light themes, light on dark themes — always
          // readable. Pure CSS; no JS mounted guard needed.
          className={cn("text-brand-ink transition-colors", textClass)}
          style={{ lineHeight: 1 }}
        >
          Sankalp
        </span>
      )}
    </span>
  )
}

// ── Backward-compatible re-export so existing `import { Logo } from brand` ──
// callers keep working. This delegates to BrandLogo.
export function Logo({ className, withText = true, size = 32 }: { className?: string; withText?: boolean; size?: number }) {
  return <BrandLogo className={className} withText={withText} size={size} />
}
