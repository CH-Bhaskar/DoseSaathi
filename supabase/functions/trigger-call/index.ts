/* trigger-call — Edge Function invoked by scan-due-calls.
 *
 * POST { "attempt_id": "<uuid>" }
 *
 * Loads the queued attempt and the patient's call preferences, then
 * creates the Twilio outbound call with the TwiML URL pointing at
 * call-webhook and the status callback pointing at call-status.
 *
 * Honest failure modes (never a faked call):
 *   - Twilio credentials absent  -> 503 { error: 'provider_not_configured' }
 *     and the attempt is marked 'failed' (with a retry scheduled, so a
 *     later configuration still delivers the reminder).
 *   - Twilio API error           -> 502 { error: 'provider_error' } and
 *     the attempt is marked 'failed' with a retry scheduled.
 *   - Attempt not queued         -> 409 { error: 'attempt_not_queued' }
 *     (a second trigger for the same attempt can never double-dial).
 *   - Calls disabled / no consent / paused at trigger time
 *     -> 409 { error: 'calls_not_allowed' } and the attempt is
 *     'cancelled' (the patient changed their mind since the scan).
 */

import { jsonResponse } from '../_shared/http.ts'
import { retryStateAfter } from '../_shared/retry.ts'
import {
  SupabaseRest,
  supabaseConfigFromEnv,
} from '../_shared/supabaseRest.ts'
import { createTwilioCall, twilioConfigFromEnv } from '../_shared/twilio.ts'
import type { CallAttemptRow, CallPreferences } from '../_shared/types.ts'

function getEnv(key: string): string | undefined {
  return Deno.env.get(key)
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405)
  }
  const configResult = supabaseConfigFromEnv(getEnv)
  if (configResult.error !== null) {
    return jsonResponse({ error: 'supabase_not_configured' }, 500)
  }
  const { supabaseUrl, serviceRoleKey } = configResult.data
  const db = new SupabaseRest({ supabaseUrl, serviceRoleKey })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400)
  }
  const attemptId =
    typeof body === 'object' && body !== null && 'attempt_id' in body
      ? (body as { attempt_id: unknown }).attempt_id
      : undefined
  if (typeof attemptId !== 'string' || attemptId.length === 0) {
    return jsonResponse({ error: 'missing_attempt_id' }, 400)
  }

  const attemptRes = await db.selectOne<CallAttemptRow>(
    'call_attempts',
    `select=*&id=eq.${attemptId}`,
  )
  if (attemptRes.error !== null || attemptRes.data === null) {
    return jsonResponse({ error: 'attempt_not_found' }, 404)
  }
  const attempt = attemptRes.data
  if (attempt.status !== 'queued') {
    return jsonResponse({ error: 'attempt_not_queued' }, 409)
  }

  const prefsRes = await db.selectOne<CallPreferences>(
    'call_preferences',
    `select=*&user_id=eq.${attempt.patient_id}`,
  )
  const prefs = prefsRes.data
  if (
    prefs === null ||
    !prefs.calls_enabled ||
    !prefs.consent_calls ||
    prefs.paused ||
    !prefs.phone_number
  ) {
    await db.update('call_attempts', `id=eq.${attempt.id}`, {
      status: 'cancelled',
    })
    return jsonResponse({ error: 'calls_not_allowed' }, 409)
  }

  const twilio = twilioConfigFromEnv(getEnv)
  const nowIso = new Date().toISOString()
  if (twilio === null) {
    // Honest failure: no provider configured. Schedule a retry so the
    // reminder still goes out if Twilio is configured later.
    const retry = retryStateAfter({
      status: 'failed',
      retryCount: attempt.retry_count,
      configuredRetries: prefs.retry_count,
      retryDelayMinutes: prefs.retry_delay_minutes,
      nowIso,
    })
    await db.update('call_attempts', `id=eq.${attempt.id}`, {
      status: 'failed',
      next_retry_at: retry.nextRetryAt,
    })
    console.error('trigger-call: Twilio not configured; attempt failed', attempt.id)
    return jsonResponse({ error: 'provider_not_configured' }, 503)
  }

  const functionsBase = `${supabaseUrl.replace(/\/$/, '')}/functions/v1`
  const twimlUrl =
    `${functionsBase}/call-webhook?attempt_id=${encodeURIComponent(attempt.id)}&step=greeting`
  const statusCallbackUrl =
    `${functionsBase}/call-status?attempt_id=${encodeURIComponent(attempt.id)}`
  const call = await createTwilioCall(twilio, {
    toNumber: prefs.phone_number,
    twimlUrl,
    statusCallbackUrl,
  })
  if (!call.ok || call.callSid === null) {
    const retry = retryStateAfter({
      status: 'failed',
      retryCount: attempt.retry_count,
      configuredRetries: prefs.retry_count,
      retryDelayMinutes: prefs.retry_delay_minutes,
      nowIso,
    })
    await db.update('call_attempts', `id=eq.${attempt.id}`, {
      status: 'failed',
      next_retry_at: retry.nextRetryAt,
    })
    console.error('trigger-call: Twilio error', attempt.id, call.error)
    return jsonResponse({ error: 'provider_error' }, 502)
  }

  await db.update('call_attempts', `id=eq.${attempt.id}`, {
    status: 'calling',
    provider_call_sid: call.callSid,
  })
  return jsonResponse({ ok: true, call_sid: call.callSid })
})
