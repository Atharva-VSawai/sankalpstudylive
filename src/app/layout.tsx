import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sankalp — Study with people preparing for the same goal",
  description:
    "Sankalp is an India-focused virtual study platform. Join live study rooms and communities for GATE, JEE, NEET, UPSC, CAT, SSC, Banking, MPSC, Placements, DSA and more. Study together, stay accountable, earn streaks.",
  keywords: [
    "Sankalp", "study with me", "live study rooms", "India study platform",
    "GATE", "JEE", "NEET", "UPSC", "CAT", "SSC", "Banking", "MPSC", "DSA",
    "Pomodoro", "study timer", "study accountability",
  ],
  authors: [{ name: "Sankalp" }],
  // ── Favicon + PWA icons (SVG stays crisp at any size; the brand mark) ──
  icons: {
    icon: [
      { url: "/logo.svg", type: "image/svg+xml" },
      { url: "/logo.svg", type: "image/svg+xml", sizes: "any" },
    ],
    apple: "/logo.svg",
    shortcut: "/logo.svg",
  },
  // ── OpenGraph + Twitter preview ──
  openGraph: {
    title: "Sankalp — Study with people preparing for the same goal",
    description:
      "Live study rooms and exam communities for India's competitive exams. Study together, stay accountable, earn streaks and badges.",
    siteName: "Sankalp",
    type: "website",
    images: [{ url: "/logo.svg", alt: "Sankalp Study Live" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Sankalp",
    description: "Study with people preparing for the same goal.",
    images: ["/logo.svg"],
  },
  manifest: undefined,
};

export const viewport: Viewport = {
  themeColor: [
    // brand-emerald (light) and brand-saffron (dark) match the CSS vars
    { media: "(prefers-color-scheme: light)", color: "#0e8a5b" },
    { media: "(prefers-color-scheme: dark)", color: "#e0a02a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground min-h-screen`}
      >
        {children}
        <Toaster />
        <SonnerToaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
