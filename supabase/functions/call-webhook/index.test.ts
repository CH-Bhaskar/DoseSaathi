import { createHmac } from 'node:crypto'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

/* Handler-level tests for call-webhook: the Deno runtime is stubbed
 * (serve captures the handler, env reads from a local map) so the
 * real handler runs under Node. The Supabase REST calls are mocked
 * with a fetch stub. Signatures are computed with node:crypto, an
 * implementation independent of the Web Crypto helper under test.
 *
 * The tokens/keys below are dummies used only by these tests — they
 * are not real credentials. */

type Handler = (req: Request) => Promise<Response>

const TOKEN = 'dummy-auth-token-for-tests-only'
const SUPABASE_URL = 'https://example.supabase.co'
const ATTEMPT_ID = '00000000-0000-0000-0000-000000000001'
const CALL_SID = 'CA11111111111111111111111111111111'

const WEBHOOK_URL = `${SUPABASE_URL}/functions/v1/call-webhook?attempt_id=${ATTEMPT_ID}&step=greeting`

const ATTEMPT = {
  id: ATTEMPT_ID,
  patient_id: 'patient-1',
  medication_id: 'med-1',
  schedule_id: 'sched-1',
  dose_event_id: 'dose-1',
  scheduled_for: '2026-11-22T08:00:00.000Z',
  attempt_number: 1,
  status: 'calling',
  provider: 'twilio',
  provider_call_sid: CALL_SID,
  idempotency_key: 'test-key-1',
  retry_count: 0,
  next_retry_at: null,
  escalation_status: 'none',
}

const PATIENT = {
  id: 'patient-1',
  full_name: 'Ravi Kumar',
  timezone: 'Asia/Kolkata',
  preferred_language: 'en',
}

const MEDICATION = { id: 'med-1', name: 'Amlodipine', dose_amount: '5 mg' }

const DOSE = {
  id: 'dose-1',
  schedule_id: 'sched-1',
  scheduled_date: '2026-11-22',
  scheduled_time: '08:00',
  status: 'pending',
}

let handler: Handler | null = null
const env = new Map<string, string>()
const fetchMock = vi.fn<typeof fetch>()

function sign(url: string, params: URLSearchParams): string {
  const keys = [...new Set(params.keys())].sort()
  let base = url
  for (const key of keys) {
    base += key + (params.get(key) ?? '')
  }
  return createHmac('sha1', TOKEN).update(base, 'utf8').digest('base64')
}

function greetingParams(): URLSearchParams {
  return new URLSearchParams({
    CallSid: CALL_SID,
    CallStatus: 'in-progress',
    From: '+919876543210',
    To: '+911234567890',
  })
}

function twilioRequest(
  url: string,
  params: URLSearchParams,
  signature: string | null,
  method = 'POST',
): Request {
  const headers: Record<string, string> = {
    'Content-Type': 'application/x-www-form-urlencoded',
  }
  if (signature !== null) headers['X-Twilio-Signature'] = signature
  // GET/HEAD requests cannot carry a body.
  const body = method === 'POST' ? params.toString() : undefined
  return new Request(url, { method, headers, body })
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

async function callHandler(req: Request): Promise<Response> {
  if (!handler) throw new Error('handler was not captured')
  return handler(req)
}

beforeAll(async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.stubGlobal('Deno', {
    serve: (h: Handler) => {
      handler = h
    },
    env: { get: (key: string) => env.get(key) },
  })
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockImplementation(async (input) => {
    const url = input instanceof Request ? input.url : String(input)
    if (url.includes('/rest/v1/call_attempts')) {
      return jsonResponse([ATTEMPT])
    }
    if (url.includes('/rest/v1/call_preferences')) {
      return jsonResponse([])
    }
    if (url.includes('/rest/v1/profiles')) {
      return jsonResponse([PATIENT])
    }
    if (url.includes('/rest/v1/medications')) {
      return jsonResponse([MEDICATION])
    }
    if (url.includes('/rest/v1/dose_events')) {
      return jsonResponse([DOSE])
    }
    return jsonResponse({ error: 'not found' }, 404)
  })
  await import('./index')
})

beforeEach(() => {
  env.set('TWILIO_AUTH_TOKEN', TOKEN)
  env.set('SUPABASE_URL', SUPABASE_URL)
  env.set('SUPABASE_SERVICE_ROLE_KEY', 'dummy-service-role-key-for-tests-only')
  fetchMock.mockClear()
})

afterEach(() => {
  env.clear()
})

describe('call-webhook signature validation', () => {
  it('rejects a request with no signature (403) before any database access', async () => {
    const res = await callHandler(twilioRequest(WEBHOOK_URL, greetingParams(), null))
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'forbidden' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a request with an invalid signature (403) before any database access', async () => {
    const res = await callHandler(
      twilioRequest(WEBHOOK_URL, greetingParams(), 'AAAAAAAAAAAAAAAAAAAAAAAAAAA='),
    )
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'forbidden' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a request with a signature for tampered parameters (403)', async () => {
    const params = greetingParams()
    const signature = sign(WEBHOOK_URL, params)
    params.set('CallSid', 'CA99999999999999999999999999999999')
    const res = await callHandler(twilioRequest(WEBHOOK_URL, params, signature))
    expect(res.status).toBe(403)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fails closed when TWILIO_AUTH_TOKEN is not set (403)', async () => {
    env.delete('TWILIO_AUTH_TOKEN')
    const params = greetingParams()
    const res = await callHandler(
      twilioRequest(WEBHOOK_URL, params, sign(WEBHOOK_URL, params)),
    )
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'forbidden' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a non-POST request (405)', async () => {
    const res = await callHandler(
      twilioRequest(WEBHOOK_URL, greetingParams(), null, 'GET'),
    )
    expect(res.status).toBe(405)
  })

  it('accepts a validly signed request and serves the greeting TwiML', async () => {
    const params = greetingParams()
    const res = await callHandler(
      twilioRequest(WEBHOOK_URL, params, sign(WEBHOOK_URL, params)),
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('text/xml')
    const twiml = await res.text()
    expect(twiml).toContain('<Gather')
    expect(twiml).toContain('step=menu')
    expect(fetchMock).toHaveBeenCalled()
  })
})
