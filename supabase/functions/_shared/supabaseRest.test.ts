import { afterEach, describe, expect, it, vi } from 'vitest'
import { SupabaseRest, supabaseConfigFromEnv } from './supabaseRest'

const CLIENT = new SupabaseRest({
  supabaseUrl: 'https://example.supabase.co',
  serviceRoleKey: 'service-role-key',
})

describe('supabaseConfigFromEnv', () => {
  it('returns null with a reason when the config is missing', () => {
    expect(supabaseConfigFromEnv(() => undefined)).toEqual({
      data: null,
      error: 'supabase_not_configured',
    })
  })
  it('returns the config when both variables are set', () => {
    const result = supabaseConfigFromEnv((key) =>
      key === 'SUPABASE_URL'
        ? 'https://example.supabase.co'
        : 'service-role-key',
    )
    expect(result.error).toBeNull()
  })
})

describe('SupabaseRest', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends the service-role key as apikey and Bearer token', async () => {
    let capturedHeaders: Record<string, string> = {}
    let capturedUrl = ''
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        capturedUrl = url
        capturedHeaders = init.headers as Record<string, string>
        return new Response('[]', { status: 200 })
      }),
    )
    const result = await CLIENT.select('call_attempts', 'select=*')
    expect(result.error).toBeNull()
    expect(capturedUrl).toBe(
      'https://example.supabase.co/rest/v1/call_attempts?select=*',
    )
    expect(capturedHeaders.apikey).toBe('service-role-key')
    expect(capturedHeaders.Authorization).toBe('Bearer service-role-key')
  })

  it('maps a 409 to a conflict error (duplicate idempotency key)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('duplicate key', { status: 409 })),
    )
    const result = await CLIENT.insert('call_attempts', { idempotency_key: 'x' })
    expect(result).toEqual({ data: null, error: 'conflict' })
  })

  it('insertIgnoreConflict returns null data when the row already existed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('[]', { status: 200 })),
    )
    const result = await CLIENT.insertIgnoreConflict(
      'call_attempts',
      { idempotency_key: 'x' },
      'idempotency_key',
    )
    expect(result).toEqual({ data: null, error: null })
  })

  it('maps a network failure to an error, never throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('dns failure')
      }),
    )
    const result = await CLIENT.select('call_attempts', 'select=*')
    expect(result).toEqual({ data: null, error: 'dns failure' })
  })
})
