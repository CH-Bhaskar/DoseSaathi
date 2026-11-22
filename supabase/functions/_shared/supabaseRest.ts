/* Minimal typed client for the Supabase PostgREST API, built on fetch.
 * Used by the Edge Functions with the service_role key (server side
 * only — this key must never reach frontend code). No supabase-js
 * dependency, so the module stays Deno- and Node-runnable.
 *
 * Every method returns { data } on success or { error } on failure;
 * callers never have to catch. Insert conflicts (HTTP 409) are
 * surfaced as { error: 'conflict' } so the scanner can treat a raced
 * duplicate idempotency key as "already exists". */

export interface RestSuccess<T> {
  data: T
  error: null
}

export interface RestFailure {
  data: null
  error: string
}

export type RestResult<T> = RestSuccess<T> | RestFailure

export interface SupabaseRestConfig {
  supabaseUrl: string
  serviceRoleKey: string
}

export class SupabaseRest {
  private baseUrl: string
  private headers: Record<string, string>

  constructor(config: SupabaseRestConfig) {
    this.baseUrl = `${config.supabaseUrl.replace(/\/$/, '')}/rest/v1`
    this.headers = {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      'Content-Type': 'application/json',
    }
  }

  private async request<T>(
    path: string,
    init: RequestInit,
  ): Promise<RestResult<T>> {
    let response: Response
    try {
      response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        headers: { ...this.headers, ...(init.headers ?? {}) },
      })
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error.message : 'network_error',
      }
    }
    if (response.status === 409) {
      return { data: null, error: 'conflict' }
    }
    if (!response.ok) {
      const body = await response.text().catch(() => '')
      return {
        data: null,
        error: `supabase_${response.status}: ${body.slice(0, 200)}`,
      }
    }
    if (response.status === 204) {
      return { data: null as T, error: null }
    }
    try {
      const data = (await response.json()) as T
      return { data, error: null }
    } catch {
      return { data: null, error: 'invalid_json' }
    }
  }

  /** SELECT with a PostgREST query string (already encoded). */
  select<T>(table: string, query: string): Promise<RestResult<T[]>> {
    return this.request<T[]>(`/${table}?${query}`, { method: 'GET' })
  }

  /** SELECT one row by an equality filter. */
  async selectOne<T>(
    table: string,
    query: string,
  ): Promise<RestResult<T | null>> {
    const result = await this.select<T>(table, `${query}&limit=1`)
    if (result.error !== null) return { data: null, error: result.error }
    return { data: result.data[0] ?? null, error: null }
  }

  /** INSERT one row, returning the inserted row. */
  insert<T>(table: string, row: Record<string, unknown>): Promise<RestResult<T>> {
    return this.request<T>(`/${table}`, {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(row),
    })
  }

  /** INSERT, ignoring a unique-conflict (used for the idempotency-key
   * upsert: a raced duplicate is not an error). Returns null data when
   * the row already existed. */
  async insertIgnoreConflict<T>(
    table: string,
    row: Record<string, unknown>,
    onConflict: string,
  ): Promise<RestResult<T | null>> {
    const result = await this.request<T[]>(`/${table}?on_conflict=${onConflict}`, {
      method: 'POST',
      headers: { Prefer: 'return=representation,resolution=ignore-duplicates' },
      body: JSON.stringify(row),
    })
    if (result.error !== null) return { data: null, error: result.error }
    return { data: result.data[0] ?? null, error: null }
  }

  /** UPDATE rows matching a PostgREST filter, returning updated rows. */
  update<T>(
    table: string,
    filter: string,
    patch: Record<string, unknown>,
  ): Promise<RestResult<T[]>> {
    return this.request<T[]>(`/${table}?${filter}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(patch),
    })
  }
}

/** Read the server-side Supabase config from the function environment.
 * Returns null (with a reason) when anything is missing — callers must
 * fail honestly instead of proceeding without a database. */
export function supabaseConfigFromEnv(
  getEnv: (key: string) => string | undefined,
): RestResult<SupabaseRestConfig> {
  const supabaseUrl = getEnv('SUPABASE_URL')
  const serviceRoleKey = getEnv('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceRoleKey) {
    return { data: null, error: 'supabase_not_configured' }
  }
  return { data: { supabaseUrl, serviceRoleKey }, error: null }
}
