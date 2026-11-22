import { createHmac } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  buildTwilioSignatureBase,
  computeTwilioSignature,
  signaturesEqual,
  validateTwilioRequest,
} from './twilioSignature'

/* The auth token below is a dummy used only by these tests — it is not
 * a real credential (same convention as the dummy `AC0000…` test SID
 * in twilio.test.ts). */

/* Independent implementation (node:crypto) used as the oracle: the
 * tests below check the Web Crypto implementation against it, so a
 * bug cannot hide by agreeing with itself. */
function independentSignature(
  authToken: string,
  url: string,
  params: URLSearchParams,
): string {
  const keys = [...new Set(params.keys())].sort()
  let base = url
  for (const key of keys) {
    base += key + (params.get(key) ?? '')
  }
  return createHmac('sha1', authToken).update(base, 'utf8').digest('base64')
}

const TOKEN = 'dummy-auth-token-for-tests-only'

const WEBHOOK_URL =
  'https://example.supabase.co/functions/v1/call-webhook?attempt_id=00000000-0000-0000-0000-000000000001&step=menu'

function webhookParams(): URLSearchParams {
  return new URLSearchParams({
    AnsweredBy: 'human',
    CallSid: 'CA11111111111111111111111111111111',
    Digits: '1',
    From: '+919876543210',
    To: '+911234567890',
  })
}

const STATUS_URL =
  'https://example.supabase.co/functions/v1/call-status?attempt_id=00000000-0000-0000-0000-000000000001'

describe('buildTwilioSignatureBase', () => {
  it('sorts keys alphabetically and appends key immediately followed by value', () => {
    const params = new URLSearchParams({
      To: '+911234567890',
      Digits: '1',
      From: '+919876543210',
    })
    expect(buildTwilioSignatureBase('https://example.com/hook', params)).toBe(
      'https://example.com/hookDigits1From+919876543210To+911234567890',
    )
  })
  it('with no parameters the base is the URL alone', () => {
    expect(
      buildTwilioSignatureBase('https://example.com/hook?a=1', new URLSearchParams()),
    ).toBe('https://example.com/hook?a=1')
  })
  it('a duplicate key resolves to its first value', () => {
    const params = new URLSearchParams('Digits=1&Digits=2')
    expect(buildTwilioSignatureBase('https://example.com/hook', params)).toBe(
      'https://example.com/hookDigits1',
    )
  })
})

describe('computeTwilioSignature', () => {
  it('matches the openssl-computed signature for a webhook request', async () => {
    // Expected value computed independently with:
    //   printf '%s' '<base>' | openssl dgst -sha1 -hmac <token> -binary | base64
    // where <base> is the URL above plus the sorted params.
    await expect(
      computeTwilioSignature(TOKEN, WEBHOOK_URL, webhookParams()),
    ).resolves.toBe('Rq4FsOfYhz2SERk6VTQppaRUq3c=')
  })
  it('matches the openssl-computed signature for an empty-params request', async () => {
    await expect(
      computeTwilioSignature(TOKEN, STATUS_URL, new URLSearchParams()),
    ).resolves.toBe('f4roiptcb9MOgaGfBwySy2mBgkE=')
  })
  it('agrees with node:crypto on a status-callback request', async () => {
    const params = new URLSearchParams({
      AnsweredBy: 'human',
      CallSid: 'CA22222222222222222222222222222222',
      CallStatus: 'completed',
    })
    const expected = independentSignature(TOKEN, STATUS_URL, params)
    await expect(computeTwilioSignature(TOKEN, STATUS_URL, params)).resolves.toBe(
      expected,
    )
  })
  it('agrees with node:crypto on values with spaces and symbols', async () => {
    const params = new URLSearchParams({
      SpeechResult: 'Yes, I took it.',
      CallSid: 'CA33333333333333333333333333333333',
    })
    const expected = independentSignature(TOKEN, WEBHOOK_URL, params)
    await expect(computeTwilioSignature(TOKEN, WEBHOOK_URL, params)).resolves.toBe(
      expected,
    )
  })
})

describe('signaturesEqual', () => {
  it('equal signatures compare true, any difference compares false', () => {
    expect(signaturesEqual('Rq4FsOfYhz2SERk6VTQppaRUq3c=', 'Rq4FsOfYhz2SERk6VTQppaRUq3c=')).toBe(
      true,
    )
    expect(signaturesEqual('Rq4FsOfYhz2SERk6VTQppaRUq3c=', 'Rq4FsOfYhz2SERk6VTQppaRUq3d=')).toBe(
      false,
    )
    expect(signaturesEqual('Rq4FsOfYhz2SERk6VTQppaRUq3c=', 'Rq4FsOfYhz2SERk6VTQppaRUq3c')).toBe(
      false,
    )
    expect(signaturesEqual('', '')).toBe(true)
  })
})

describe('validateTwilioRequest', () => {
  it('a valid signature passes (signature from the independent implementation)', async () => {
    const params = webhookParams()
    const signature = independentSignature(TOKEN, WEBHOOK_URL, params)
    await expect(
      validateTwilioRequest({ authToken: TOKEN, signature, url: WEBHOOK_URL, params }),
    ).resolves.toBe(true)
  })
  it('a tampered parameter fails', async () => {
    const params = webhookParams()
    const signature = independentSignature(TOKEN, WEBHOOK_URL, params)
    params.set('Digits', '2')
    await expect(
      validateTwilioRequest({ authToken: TOKEN, signature, url: WEBHOOK_URL, params }),
    ).resolves.toBe(false)
  })
  it('a wrong URL fails', async () => {
    const params = webhookParams()
    const signature = independentSignature(TOKEN, WEBHOOK_URL, params)
    const wrongUrl =
      'https://example.supabase.co/functions/v1/call-webhook?attempt_id=00000000-0000-0000-0000-000000000002&step=menu'
    await expect(
      validateTwilioRequest({ authToken: TOKEN, signature, url: wrongUrl, params }),
    ).resolves.toBe(false)
  })
  it('a missing or empty signature header fails', async () => {
    const params = webhookParams()
    await expect(
      validateTwilioRequest({ authToken: TOKEN, signature: null, url: WEBHOOK_URL, params }),
    ).resolves.toBe(false)
    await expect(
      validateTwilioRequest({ authToken: TOKEN, signature: '', url: WEBHOOK_URL, params }),
    ).resolves.toBe(false)
  })
  it('a missing auth token fails closed', async () => {
    const params = webhookParams()
    const signature = independentSignature(TOKEN, WEBHOOK_URL, params)
    for (const authToken of [null, undefined, ''] as const) {
      await expect(
        validateTwilioRequest({ authToken, signature, url: WEBHOOK_URL, params }),
      ).resolves.toBe(false)
    }
  })
  it('an empty-params request validates with a URL-only signature', async () => {
    const params = new URLSearchParams()
    const signature = independentSignature(TOKEN, STATUS_URL, params)
    await expect(
      validateTwilioRequest({ authToken: TOKEN, signature, url: STATUS_URL, params }),
    ).resolves.toBe(true)
  })
  it('a wrong auth token fails', async () => {
    const params = webhookParams()
    const signature = independentSignature(TOKEN, WEBHOOK_URL, params)
    await expect(
      validateTwilioRequest({
        authToken: 'a-different-dummy-token',
        signature,
        url: WEBHOOK_URL,
        params,
      }),
    ).resolves.toBe(false)
  })
})
