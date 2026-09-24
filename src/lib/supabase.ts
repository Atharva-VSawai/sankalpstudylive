// Supabase client utilities — browser + server side.
// The publishable key is safe for the browser.
// The service role key must NEVER be exposed to the client.
//
// ── OPTIONAL SUPABASE ──
// Supabase is OPTIONAL. If NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
// are not set (empty), the client functions return a NO-OP stub that never has
// a session. This lets the app run with only the Sankalp local email/password
// auth (HMAC-signed tokens) — e.g. during development, in environments without
// Supabase, or before the user configures Google OAuth. When Supabase IS
// configured (production), the same code uses real Supabase Auth + Google OAuth
// automatically. No code changes are needed to switch between the two modes.

import { createClient, SupabaseClient } from "@supabase/supabase-js"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ""
const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || ""

// True only when BOTH the URL and publishable key are configured. When false,
// the browser/server clients are no-op stubs and Supabase Auth is effectively
// disabled — the app falls back to Sankalp local auth.
export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY)

// ── Browser client (uses publishable key — safe for client) ──
// Returns a real SupabaseClient when configured, or a NO-OP stub when not.
// The stub's auth.getSession() always resolves to { data: { session: null } }
// and auth.onAuthStateChange() returns a no-op subscription. This means the
// auth-context's fetchMe falls through to the Sankalp local-token path, and
// login/signup/loginWithGoogle fall through to their Sankalp/local handlers.
export function createBrowserClient(): SupabaseClient {
  if (!isSupabaseConfigured) {
    return createNoopSupabaseClient()
  }
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // Use the authorization-code flow so Supabase returns `?code=...`
      // instead of putting OAuth tokens in the hash used by our client router.
      flowType: "pkce",
    },
  })
}

// ── Server client (uses service role key if available, else publishable) ──
// Used in API routes for server-side Supabase operations (e.g. verifying JWTs
// in getAuth). Returns a real client when the publishable key is set; the
// service-role key is preferred when present. Returns a no-op stub when
// Supabase is not configured — getAuth then falls back to Sankalp tokens only.
export function createServerClient(): SupabaseClient {
  if (!isSupabaseConfigured) {
    return createNoopSupabaseClient()
  }
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  return createClient(SUPABASE_URL, serviceKey || SUPABASE_PUBLISHABLE_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}

export { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY }

// ── No-op Supabase stub (used when Supabase is not configured) ──
// A minimal duck-typed object that satisfies the auth-context + getAuth call
// sites without importing the real Supabase SDK. This keeps the app running
// with Sankalp-local auth only.
function createNoopSupabaseClient(): SupabaseClient {
  const noopAuth = {
    getSession: async () => ({ data: { session: null }, error: null as any }),
    getUser: async () => ({ data: { user: null }, error: null as any }),
    signInWithPassword: async () => ({ data: { user: null, session: null }, error: { message: "Supabase is not configured" } as any }),
    signUp: async () => ({ data: { user: null, session: null }, error: { message: "Supabase is not configured" } as any }),
    signInWithOAuth: async () => ({ data: { url: null, provider: null }, error: { message: "Supabase is not configured" } as any }),
    signOut: async () => ({ error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    refreshSession: async () => ({ data: { session: null }, error: null as any }),
  }
  return { auth: noopAuth as any, storage: undefined as any, from: () => ({ upload: async () => ({ data: null, error: { message: "Supabase not configured" } }), download: async () => ({ data: null, error: { message: "Supabase not configured" } }), createSignedUrl: async () => ({ data: null, error: { message: "Supabase not configured" } }), remove: async () => ({ data: null, error: null }), list: async () => ({ data: [], error: null }) }) } as any
}
