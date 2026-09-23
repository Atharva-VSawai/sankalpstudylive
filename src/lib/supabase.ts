// Supabase client utilities — browser + server side.
// The publishable key is safe for the browser.
// The service role key must NEVER be exposed to the client.

import { createClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || ""

// ── Browser client (uses publishable key — safe for client) ──
export function createBrowserClient() {
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  })
}

// ── Server client (uses service role key if available, else publishable) ──
// Used in API routes for server-side Supabase operations.
export function createServerClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  return createClient(SUPABASE_URL, serviceKey || SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

export { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY }
