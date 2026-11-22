/* Twilio request-signature validation for the Edge Functions.
 *
 * Twilio signs every webhook request so the receiver can prove the
 * request really came from Twilio: HMAC-SHA1 over the full request URL
 * (including the query string) with the POST parameters appended in
 * alphabetical order — each key immediately followed by its value —
 * keyed by the Twilio Auth Token, base64-encoded, sent as the
 * `X-Twilio-Signature` header. See Twilio's "Validate incoming Twilio
 * requests" documentation.
 *
 * The POST parameters arrive already URL-decoded (URLSearchParams) —
 * that matches what Twilio signs: Twilio's own validators operate on
 * the decoded parameter map.
 *
 * Pure + Deno-safe: Web Crypto SubtleCrypto only (no Node `crypto`
 * imports — the functions run on Deno). The tests cross-check this
 * implementation against node:crypto and against signatures computed
 * with the openssl CLI, so a bug here cannot hide by agreeing with
 * itself.
 *
 * Everything here fails closed: a missing auth token, a missing
 * signature, or any mismatch is invalid. Callers must reject the
 * request (403) and never fall back to "allow". */

const textEncoder = new TextEncoder()

/** Build the signature base string: the URL with the POST parameters
 * appended in alphabetical key order (key immediately followed by its
 * value). With no parameters the base is the URL alone. Duplicate
 * keys (Twilio does not send any) resolve to their first value. */
export function buildTwilioSignatureBase(
  url: string,
  params: URLSearchParams,
): string {
  const keys = [...new Set(params.keys())].sort()
  let base = url
  for (const key of keys) {
    base += key + (params.get(key) ?? '')
  }
  return base
}

/** HMAC-SHA1 (base64) of the signature base, keyed by the Twilio Auth
 * Token. This is the value Twilio sends as `X-Twilio-Signature`. */
export async function computeTwilioSignature(
  authToken: string,
  url: string,
  params: URLSearchParams,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(authToken),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  )
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    textEncoder.encode(buildTwilioSignatureBase(url, params)),
  )
  return bytesToBase64(new Uint8Array(signature))
}

/** Timing-safe comparison of two base64 signatures: every byte is
 * compared and the result is accumulated, so the running time does
 * not depend on where the first difference is. (A length difference
 * returns early — base64 HMAC-SHA1 signatures are a fixed 28
 * characters, so a length mismatch is already a certain reject.) */
export function signaturesEqual(a: string, b: string): boolean {
  const aBytes = textEncoder.encode(a)
  const bBytes = textEncoder.encode(b)
  if (aBytes.length !== bBytes.length) return false
  let diff = 0
  for (let i = 0; i < aBytes.length; i++) {
    diff |= aBytes[i] ^ bBytes[i]
  }
  return diff === 0
}

/** Validate a Twilio webhook request against its signature header.
 * Fails closed: a missing auth token or a missing/empty signature is
 * invalid, as is any mismatch. The `url` must be the exact public URL
 * Twilio called, including the query string (in the Edge Functions:
 * `req.url` as received). */
export async function validateTwilioRequest(input: {
  authToken: string | null | undefined
  signature: string | null
  url: string
  params: URLSearchParams
}): Promise<boolean> {
  const { authToken, signature, url, params } = input
  if (!authToken || !signature) return false
  const expected = await computeTwilioSignature(authToken, url, params)
  return signaturesEqual(signature, expected)
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}
