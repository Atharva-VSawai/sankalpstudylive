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
            staleTime: 30_000,
            refetchOnWindowFocus: false,
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
