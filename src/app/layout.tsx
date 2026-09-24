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
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://www.sankalpstudylive.in"),
  title: "Sankalp — Study with people preparing for the same goal",
  description:
    "Sankalp is an India-focused virtual study platform. Join live study rooms and communities for GATE, JEE, NEET, UPSC, CAT, SSC, Banking, MPSC, Placements, DSA and more. Study together, stay accountable, earn streaks.",
  keywords: [
    "Sankalp", "study with me", "live study rooms", "India study platform",
    "GATE", "JEE", "NEET", "UPSC", "CAT", "SSC", "Banking", "MPSC", "DSA",
    "Pomodoro", "study timer", "study accountability",
  ],
  authors: [{ name: "Sankalp" }],
  // ── Favicon + PWA icons (real Sankalp logo mark, transparent PNG) ──
  icons: {
    icon: [
      { url: "/favicon.png", type: "image/png", sizes: "32x32" },
      { url: "/branding/icon-192.png", type: "image/png", sizes: "192x192" },
    ],
    apple: "/apple-touch-icon.png",
    shortcut: "/favicon.png",
  },
  // ── OpenGraph + Twitter preview (the icon mark) ──
  openGraph: {
    title: "Sankalp — Study with people preparing for the same goal",
    description:
      "Live study rooms and exam communities for India's competitive exams. Study together, stay accountable, earn streaks and badges.",
    siteName: "Sankalp",
    type: "website",
    images: [{ url: "/branding/icon-512.png", width: 512, height: 512, alt: "Sankalp Study Live" }],
  },
  twitter: {
    card: "summary",
    title: "Sankalp",
    description: "Study with people preparing for the same goal.",
    images: ["/branding/icon-512.png"],
  },
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
