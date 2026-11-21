import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Uses the existing SOOULL Supabase project when its public URL and
 * publishable/legacy anon key are configured. Never expose a secret or
 * service-role key in the browser.
 */
export const supabase =
  supabaseUrl && supabasePublishableKey
    ? createClient(supabaseUrl, supabasePublishableKey, { auth: { experimental: { passkey: true } } })
    : null

export const isSupabaseConfigured = Boolean(supabase)
