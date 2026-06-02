import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const supabaseAnon = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

// ── DA Platform Supabase (READ-ONLY) ─────────────────────────────────────────
// Used by the Reputation Manager to read active dealers for review-request
// campaigns. NEVER write to this database — it is the DA Platform source of
// truth. Returns null when not configured so callers can degrade gracefully.
export function getDaPlatformSupabase() {
  const url = process.env.DA_PLATFORM_SUPABASE_URL
  const key = process.env.DA_PLATFORM_SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  return createClient(url, key)
}

export const DA_PLATFORM_CONNECTED = !!(
  process.env.DA_PLATFORM_SUPABASE_URL && process.env.DA_PLATFORM_SUPABASE_SERVICE_KEY
)
