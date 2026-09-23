"use client"

import { Providers } from "@/components/app/providers"
import { AppShell } from "@/components/app/app-shell"

export default function Home() {
  return (
    <Providers>
      <AppShell />
    </Providers>
  )
}
