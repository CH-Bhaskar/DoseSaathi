/* call-status — Twilio status callback (Edge Function).
 *
 * Twilio POSTs CallSid, CallStatus, and (with answering-machine
 * detection) AnsweredBy. This function translates Twilio's own report
 * into a call_attempts status — nothing more.
 *
 * Rule: a call is NEVER recorded as completed/delivered unless Twilio
 * confirms it. Unknown Twilio statuses map to 'failed', never to
 * 'completed'. Retry state (next_retry_at) is set from the patient's
 * retry policy for retryable outcomes; the retry itself is created by
 * scan-due-calls, never here.
 *
 * The attempt is found by provider_call_sid (set by trigger-call when
 * the call was created). The attempt_id query parameter is a fallback
 * for callbacks that arrive before the SID was stored.
 *
 * Every request is authenticated before any processing: the Twilio
 * request signature (X-Twilio-Signature, HMAC-SHA1 over the full URL +
 * sorted POST params, keyed by TWILIO_AUTH_TOKEN) is validated first
 * (see _shared/twilioSignature.ts). A missing or invalid signature —
 * or a missing TWILIO_AUTH_TOKEN — is a 403 with a generic body, and
 * no database access happens. */

import { parseTwilioBody, jsonResponse } from '../_shared/http.ts'
import { retryStateAfter } from '../_shared/retry.ts'
import { isTerminalStatus, mapTwilioStatus } from '../_shared/status.ts'
import {
  SupabaseRest,
  supabaseConfigFromEnv,
} from '../_shared/supabaseRest.ts'
import { validateTwilioRequest } from '../_shared/twilioSignature.ts'
import type { CallAttemptRow, CallPreferences } from '../_shared/types.ts'

function getEnv(key: string): string | undefined {
  return Deno.env.get(key)
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405)
  }
  // Authenticate first, before any other processing: validate the
  // Twilio request signature (X-Twilio-Signature) against
  // TWILIO_AUTH_TOKEN. Fail closed — a missing token, a missing
  // signature, or any mismatch is a 403 with a generic body, and no
  // database access happens. The body must be parsed here because
  // the signature covers the POST parameters.
  const body = await parseTwilioBody(req)
  const authToken = getEnv('TWILIO_AUTH_TOKEN')
  if (!authToken) {
    console.error(
      'call-status: TWILIO_AUTH_TOKEN is not set; signature validation is unconfigured, rejecting request',
    )
    return jsonResponse({ error: 'forbidden' }, 403)
  }
  const signatureValid = await validateTwilioRequest({
    authToken,
    signature: req.headers.get('X-Twilio-Signature'),
    url: req.url,
    params: body,
  })
  if (!signatureValid) {
    console.warn('call-status: invalid Twilio request signature')
    return jsonResponse({ error: 'forbidden' }, 403)
  }
  const configResult = supabaseConfigFromEnv(getEnv)
  if (configResult.error !== null) {
    return jsonResponse({ error: 'supabase_not_configured' }, 500)
  }
  const db = new SupabaseRest(configResult.data)

  const callSid = body.get('CallSid')
  const callStatus = body.get('CallStatus')
  const answeredBy = body.get('AnsweredBy')
  const url = new URL(req.url)
  const attemptIdParam = url.searchParams.get('attempt_id')

  if (!callSid && !attemptIdParam) {
    return jsonResponse({ error: 'missing_call_sid' }, 400)
  }

  let attempt: CallAttemptRow | null = null
  if (callSid) {
    const bySid = await db.selectOne<CallAttemptRow>(
      'call_attempts',
      `select=*&provider_call_sid=eq.${encodeURIComponent(callSid)}`,
    )
    if (bySid.error === null) attempt = bySid.data
  }
  if (attempt === null && attemptIdParam) {
    const byId = await db.selectOne<CallAttemptRow>(
      'call_attempts',
      `select=*&id=eq.${attemptIdParam}`,
    )
    if (byId.error === null) attempt = byId.data
  }
  if (attempt === null) {
    // Unknown SID — log, acknowledge, and do nothing. Never invent a
    // record for a call we did not place.
    console.warn('call-status: unknown call', callSid ?? attemptIdParam)
    return jsonResponse({ ok: true, ignored: true })
  }

  const mapped = mapTwilioStatus({ callStatus, answeredBy })
  if (!isTerminalStatus(mapped)) {
    // Still ringing / in progress — keep the attempt as 'calling'.
    return jsonResponse({ ok: true, status: 'calling' })
  }
  if (isTerminalStatus(attempt.status)) {
    // Already terminal (e.g. the webhook recorded 'voicemail' first).
    // Twilio's report agrees; do not regress a terminal state.
    return jsonResponse({ ok: true, status: attempt.status })
  }

  const nowIso = new Date().toISOString()
  const prefsRes = await db.selectOne<CallPreferences>(
    'call_preferences',
    `select=*&user_id=eq.${attempt.patient_id}`,
  )
  const prefs = prefsRes.data
  const retry = retryStateAfter({
    status: mapped,
    retryCount: attempt.retry_count,
    configuredRetries: prefs?.retry_count,
    retryDelayMinutes: prefs?.retry_delay_minutes,
    nowIso,
  })
  const updated = await db.update('call_attempts', `id=eq.${attempt.id}`, {
    status: mapped,
    next_retry_at: retry.nextRetryAt,
  })
  if (updated.error !== null) {
    console.error('call-status: failed to update attempt', updated.error)
    return jsonResponse({ error: 'update_failed' }, 500)
  }
  return jsonResponse({ ok: true, status: mapped, will_retry: retry.willRetry })
})
