/* The active data provider: always the Supabase provider. When
 * Supabase is not configured its methods throw 'supabase.notConfigured'
 * (see supabaseProvider) — the app shows an honest not-configured state
 * instead of fake data. Components and the store never import a concrete
 * provider directly. */
import { isConfigured } from '../lib/supabase'
import type { DataProvider } from './provider'
import { supabaseProvider } from './supabaseProvider'

export const provider: DataProvider = supabaseProvider
export { isConfigured }
export type { DataProvider }
