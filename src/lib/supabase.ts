/* Supabase client. Credentials come only from environment variables
 * (see .env.example). When they are absent the app is NOT CONFIGURED:
 * `supabase` is null, `isConfigured` is false, and no network call to
 * Supabase is ever attempted — the app shows an honest not-configured
 * state instead of fake data or a fake login. */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isConfigured = Boolean(url && anonKey)

export const supabase: SupabaseClient | null = isConfigured
  ? createClient(url as string, anonKey as string, {
      auth: { persistSession: true, autoRefreshToken: true },
    })
  : null
