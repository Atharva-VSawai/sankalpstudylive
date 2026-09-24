"use client"

import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { ThemeProvider } from "next-themes"
import { useState, ReactNode } from "react"
import { AuthProvider } from "@/lib/auth-context"
import { RouterProvider } from "@/lib/router"

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Most app data is not second-by-second. Keeping it warm avoids
            // refetching every time the hash-router swaps views while live
            // surfaces opt into their own shorter refresh intervals.
            staleTime: 120_000,
            gcTime: 10 * 60_000,
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
            retry: 1,
          },
        },
      })
  )
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={client}>
        <RouterProvider>
          <AuthProvider>{children}</AuthProvider>
        </RouterProvider>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
