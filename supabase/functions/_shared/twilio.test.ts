import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTwilioCall, twilioConfigFromEnv } from './twilio'

const CONFIG = {
  accountSid: 'AC00000000000000000000000000000000',
  authToken: 'test-auth-token',
  fromNumber: '+919999999999',
}

describe('twilioConfigFromEnv', () => {
  it('returns the config when all three variables are set', () => {
    const getEnv = (key: string) =>
      (
        {
          TWILIO_ACCOUNT_SID: CONFIG.accountSid,
          TWILIO_AUTH_TOKEN: CONFIG.authToken,
          TWILIO_PHONE_NUMBER: CONFIG.fromNumber,
        } as Record<string, string>
      )[key]
    expect(twilioConfigFromEnv(getEnv)).toEqual(CONFIG)
  })
  it('returns null when any credential is missing', () => {
    expect(twilioConfigFromEnv(() => undefined)).toBeNull()
    expect(
      twilioConfigFromEnv((key) =>
        key === 'TWILIO_ACCOUNT_SID' ? CONFIG.accountSid : undefined,
      ),
    ).toBeNull()
  })
})

describe('createTwilioCall', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('posts to the Twilio Calls API with Basic auth and machine detection', async () => {
    let capturedUrl = ''
    let capturedInit: RequestInit | undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        capturedUrl = url
        capturedInit = init
        return new Response(JSON.stringify({ sid: 'CA123' }), { status: 201 })
      }),
    )
    const result = await createTwilioCall(CONFIG, {
      toNumber: '+918888888888',
      twimlUrl: 'https://example.supabase.co/functions/v1/call-webhook?attempt_id=1',
      statusCallbackUrl: 'https://example.supabase.co/functions/v1/call-status',
    })
    expect(result).toEqual({ ok: true, callSid: 'CA123', error: null })
    expect(capturedUrl).toBe(
      `https://api.twilio.com/2010-04-01/Accounts/${CONFIG.accountSid}/Calls.json`,
    )
    const headers = capturedInit?.headers as Record<string, string>
    expect(headers.Authorization).toBe(
      `Basic ${btoa(`${CONFIG.accountSid}:${CONFIG.authToken}`)}`,
    )
    const body = new URLSearchParams(capturedInit?.body as string)
    expect(body.get('To')).toBe('+918888888888')
    expect(body.get('From')).toBe(CONFIG.fromNumber)
    expect(body.get('MachineDetection')).toBe('DetectMessageEnd')
    expect(body.get('Url')).toContain('call-webhook')
    expect(body.get('StatusCallback')).toContain('call-status')
  })

  it('reports a Twilio API error honestly, with no SID', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"message":"Auth failed"}', { status: 401 })),
    )
    const result = await createTwilioCall(CONFIG, {
      toNumber: '+918888888888',
      twimlUrl: 'https://example.com/twiml',
      statusCallbackUrl: 'https://example.com/status',
    })
    expect(result.ok).toBe(false)
    expect(result.callSid).toBeNull()
    expect(result.error).toContain('twilio_401')
  })

  it('reports a network failure honestly', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('connection refused')
      }),
    )
    const result = await createTwilioCall(CONFIG, {
      toNumber: '+918888888888',
      twimlUrl: 'https://example.com/twiml',
      statusCallbackUrl: 'https://example.com/status',
    })
    expect(result.ok).toBe(false)
    expect(result.error).toBe('connection refused')
  })
})
