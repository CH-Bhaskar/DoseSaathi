/* call-webhook — Edge Function serving TwiML for the interactive call.
 *
 * Flow (all prompts in _shared/prompts.ts, EN + KN):
 *   greeting -> menu (Press 1 taken / 2 later / 3 help)
 *     1 -> confirm (repeat-back; Press 1 confirms) -> dose recorded
 *          as 'taken', source 'call'
 *     2 -> remind later: a follow-up attempt is queued per the retry
 *          policy; the dose is NOT marked taken
 *     3 -> help: escalation_status 'pending' + an audit_events entry;
 *          the dose is NOT marked taken. The caregiver alert itself is
 *          written by scan-due-calls only after the consent gate
 *          passes — this webhook never alerts a caregiver directly.
 *     wrong key / no input / unintelligible speech -> the menu repeats
 *     (max 3); then the call ends politely with NOTHING recorded.
 *
 * Safety rules enforced here:
 *   - A dose is recorded as taken ONLY after the patient confirms the
 *     repeat-back (keypad 1 or a clear "yes"). Speech alone never
 *     records a dose.
 *   - Unanswered calls, voicemail, busy, failed, and ambiguous input
 *     never mark a dose taken.
 *   - The call never tells the patient to take an extra dose, change a
 *     dose, or take a missed dose late; medication questions get the
 *     prescription / doctor-or-pharmacist line (SAFETY_LINE).
 *   - Voicemail messages stay generic unless the patient consented to
 *     medicine details (speak_medicine_details).
 *   - The patient's name is spoken only when consented (the greeting
 *     uses the profile name only when consent_calls is true — the
 *     patient consented to the call itself; a name is part of that
 *     consented call. No name is ever spoken on voicemail.)
 *   - Speech recognition falls back to keypad-only, and says so.
 *   - The call speaks the PATIENT's own language, resolved once per
 *     request (see _shared/language.ts): the explicit voice-call
 *     choice (call_preferences.language) wins, else the patient
 *     profile's preferred_language, else 'en' as an explicit, logged
 *     last resort. Every prompt, the <Gather> language, speech
 *     interpretation, and voice resolution in the request use that
 *     one value, so the language never switches mid-call. (The two
 *     'Thank you. Goodbye.' error paths before any patient is known
 *     are unavoidably English — no patient has been identified yet.)
 *   - Every request is authenticated before any processing: the
 *     Twilio request signature (X-Twilio-Signature, HMAC-SHA1 over
 *     the full URL + sorted POST params, keyed by TWILIO_AUTH_TOKEN)
 *     is validated first (see _shared/twilioSignature.ts). A missing
 *     or invalid signature — or a missing TWILIO_AUTH_TOKEN — is a
 *     403 with a generic body, and no database access happens. The
 *     attempt_id in the URL is an identifier, never the auth.
 */

import { jsonResponse, parseTwilioBody, twimlResponse } from '../_shared/http.ts'
import { buildIdempotencyKey } from '../_shared/idempotency.ts'
import {
  MAX_CONFIRM_REPEATS,
  MAX_MENU_REPEATS,
  mapConfirmKey,
  mapMenuKey,
} from '../_shared/keypad.ts'
import {
  CONFIRM_PROMPT,
  CONFIRMED_PROMPT,
  GOODBYE_PROMPT,
  HELP_PROMPT,
  LATER_PROMPT,
  MENU_PROMPT,
  NOT_UNDERSTOOD_PROMPT,
  SAFETY_LINE,
  SPEECH_UNAVAILABLE_PROMPT,
  greetingPrompt,
  voicemailPrompt,
} from '../_shared/prompts.ts'
import { resolveCallLanguage } from '../_shared/language.ts'
import type { ResolvedCallLanguage } from '../_shared/language.ts'
import { effectiveRetryCap } from '../_shared/retry.ts'
import { interpretSpeech, interpretYesNo } from '../_shared/speech.ts'
import {
  SupabaseRest,
  supabaseConfigFromEnv,
} from '../_shared/supabaseRest.ts'
import { addMinutesIso } from '../_shared/time.ts'
import { validateTwilioRequest } from '../_shared/twilioSignature.ts'
import {
  redirectTo,
  resolveVoice,
  sayAndGather,
  sayAndHangup,
} from '../_shared/twiml.ts'
import type {
  CallAttemptRow,
  CallPreferences,
  CallResponseType,
  PatientCallInfo,
} from '../_shared/types.ts'

interface MedicationRow {
  id: string
  name: string
  dose_amount: string
}

interface DoseEventRow {
  id: string
  schedule_id: string
  scheduled_date: string
  scheduled_time: string
  status: string
}

function getEnv(key: string): string | undefined {
  return Deno.env.get(key)
}

function formatTimeLabel(time: string): string {
  const [hRaw, mRaw] = time.split(':')
  const h = Number(hRaw)
  const m = Number(mRaw)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

function isMachineAnswer(answeredBy: string | null): boolean {
  const value = (answeredBy ?? '').trim().toLowerCase()
  return (
    value === 'machine' ||
    value === 'machine_start' ||
    value === 'machine_end_beep' ||
    value === 'machine_end_silence' ||
    value === 'machine_end_other'
  )
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
      'call-webhook: TWILIO_AUTH_TOKEN is not set; signature validation is unconfigured, rejecting request',
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
    console.warn('call-webhook: invalid Twilio request signature')
    return jsonResponse({ error: 'forbidden' }, 403)
  }

  const url = new URL(req.url)
  const attemptId = url.searchParams.get('attempt_id') ?? ''
  const step = url.searchParams.get('step') ?? 'greeting'
  const repeats = Number(url.searchParams.get('repeats') ?? '0') || 0
  const baseUrl = `${url.origin}${url.pathname}`
  const stepUrl = (next: string, nextRepeats: number, extra?: string): string =>
    `${baseUrl}?attempt_id=${encodeURIComponent(attemptId)}&step=${next}&repeats=${nextRepeats}${extra ?? ''}`

  const configResult = supabaseConfigFromEnv(getEnv)
  if (configResult.error !== null || attemptId.length === 0) {
    // Twilio still needs valid TwiML; say nothing specific.
    return twimlResponse(
      sayAndHangup(['Thank you. Goodbye.'], 'en', 1),
    )
  }
  const db = new SupabaseRest(configResult.data)

  const attemptRes = await db.selectOne<CallAttemptRow>(
    'call_attempts',
    `select=*&id=eq.${attemptId}`,
  )
  if (attemptRes.error !== null || attemptRes.data === null) {
    return twimlResponse(sayAndHangup(['Thank you. Goodbye.'], 'en', 1))
  }
  const attempt = attemptRes.data

  const [prefsRes, patientRes, medRes, doseRes] = await Promise.all([
    db.selectOne<CallPreferences>(
      'call_preferences',
      `select=*&user_id=eq.${attempt.patient_id}`,
    ),
    db.selectOne<PatientCallInfo>(
      'profiles',
      `select=id,full_name,timezone,preferred_language&id=eq.${attempt.patient_id}`,
    ),
    db.selectOne<MedicationRow>(
      'medications',
      `select=id,name,dose_amount&id=eq.${attempt.medication_id}`,
    ),
    attempt.dose_event_id
      ? db.selectOne<DoseEventRow>(
          'dose_events',
          `select=id,schedule_id,scheduled_date,scheduled_time,status&id=eq.${attempt.dose_event_id}`,
        )
      : Promise.resolve({ data: null, error: null } as const),
  ])
  const prefs = prefsRes.data
  // Language resolution — the call speaks the PATIENT's own language.
  // Precedence (see _shared/language.ts): the explicit voice-call
  // choice (call_preferences.language) wins; otherwise the patient
  // profile's preferred_language; 'en' only as an explicit, logged
  // last resort for an unsupported stored value. Resolved once per
  // request: every prompt, the <Gather> language, speech
  // interpretation, and voice resolution below use this one value,
  // so the language can never switch mid-call. Retries and Press-2
  // follow-ups are new attempts with no stored language, so each one
  // re-resolves here at webhook time.
  const { language, source: languageSource }: ResolvedCallLanguage =
    resolveCallLanguage(prefs?.language, patientRes.data?.preferred_language)
  if (languageSource === 'fallback') {
    console.warn(
      `call-webhook: unsupported stored language (prefs=${String(prefs?.language)} profile=${String(patientRes.data?.preferred_language)}); falling back to 'en' (attempt ${attempt.id})`,
    )
  }
  const rate = prefs?.speech_rate ?? 1
  const { voice, preferredAvailable } = resolveVoice(language, prefs?.voice_name)
  if (!preferredAvailable && prefs?.voice_name) {
    // Honest fallback: the preferred voice does not exist for this
    // language. Log it and use the same-language default — the
    // language itself never changes.
    console.warn(
      `call-webhook: preferred voice ${prefs.voice_name} unavailable for ${language}; using ${voice} (attempt ${attempt.id})`,
    )
  }
  const patientName =
    prefs?.consent_calls && patientRes.data?.full_name
      ? patientRes.data.full_name.split(' ')[0] ?? null
      : null
  const med = medRes.data
  const dose = doseRes.data
  const timeLabel = dose
    ? formatTimeLabel(dose.scheduled_time)
    : new Date(attempt.scheduled_for).toLocaleTimeString('en-IN', {
        hour: 'numeric',
        minute: '2-digit',
      })
  const ctx = {
    patientName,
    medicationName: med?.name ?? '',
    doseAmount: med?.dose_amount ?? '',
    scheduledTimeLabel: timeLabel,
  }
  const speakDetails = prefs?.speak_medicine_details ?? false

  const recordResponse = async (input: {
    type: CallResponseType
    keyPressed: string | null
    speechText: string | null
    confirmed: boolean
  }): Promise<void> => {
    const result = await db.insert('call_responses', {
      call_attempt_id: attempt.id,
      response_type: input.type,
      key_pressed: input.keyPressed,
      speech_text: input.speechText,
      confirmed: input.confirmed,
    })
    if (result.error !== null) {
      console.error('call-webhook: failed to record response', result.error)
    }
  }

  const digits = body.get('Digits')
  const speechText = body.get('SpeechResult')
  const answeredBy = body.get('AnsweredBy')

  // -- Voicemail: generic unless details were consented ---------------
  if (isMachineAnswer(answeredBy)) {
    await db.update('call_attempts', `id=eq.${attempt.id}`, {
      status: 'voicemail',
    })
    return twimlResponse(
      sayAndHangup(
        [voicemailPrompt({ ...ctx, patientName: null }, language, speakDetails)],
        language,
        rate,
        voice,
      ),
    )
  }

  // -- Greeting ---------------------------------------------------------
  if (step === 'greeting') {
    return twimlResponse(
      sayAndGather({
        lines: [greetingPrompt(ctx, language, speakDetails), MENU_PROMPT[language]],
        language,
        rate,
        voice,
        actionUrl: stepUrl('menu', 0),
        speechAvailable: true,
      }),
    )
  }

  // -- Menu -------------------------------------------------------------
  if (step === 'menu') {
    const hasInput = digits !== null || (speechText !== null && speechText.trim() !== '')
    if (!hasInput) {
      if (repeats >= MAX_MENU_REPEATS) {
        await recordResponse({ type: 'none', keyPressed: null, speechText: null, confirmed: false })
        await db.update('call_attempts', `id=eq.${attempt.id}`, { status: 'completed' })
        return twimlResponse(sayAndHangup([GOODBYE_PROMPT[language]], language, rate, voice))
      }
      return twimlResponse(
        sayAndGather({
          lines: [NOT_UNDERSTOOD_PROMPT[language], MENU_PROMPT[language]],
          language,
          rate,
          voice,
          actionUrl: stepUrl('menu', repeats + 1),
          speechAvailable: true,
        }),
      )
    }

    // Keypad takes precedence over speech when both arrive.
    if (digits !== null) {
      const action = mapMenuKey(digits)
      if (action === 'confirm') {
        await recordResponse({ type: 'keypad', keyPressed: '1', speechText: null, confirmed: false })
        return twimlResponse(
          sayAndGather({
            lines: [CONFIRM_PROMPT[language]],
            language,
            rate,
            voice,
            actionUrl: stepUrl('confirm', 0, '&origin=keypad'),
            speechAvailable: true,
          }),
        )
      }
      if (action === 'later') {
        await recordResponse({ type: 'keypad', keyPressed: '2', speechText: null, confirmed: false })
        await scheduleRemindLater(db, attempt, dose, prefs)
        await db.update('call_attempts', `id=eq.${attempt.id}`, { status: 'completed' })
        return twimlResponse(sayAndHangup([LATER_PROMPT[language]], language, rate, voice))
      }
      if (action === 'help') {
        await recordResponse({ type: 'keypad', keyPressed: '3', speechText: null, confirmed: false })
        await flagHelp(db, attempt)
        return twimlResponse(
          sayAndHangup([HELP_PROMPT[language], SAFETY_LINE[language]], language, rate, voice),
        )
      }
      // Wrong key: repeat the menu.
      if (repeats >= MAX_MENU_REPEATS) {
        await recordResponse({ type: 'keypad', keyPressed: digits, speechText: null, confirmed: false })
        await db.update('call_attempts', `id=eq.${attempt.id}`, { status: 'completed' })
        return twimlResponse(sayAndHangup([GOODBYE_PROMPT[language]], language, rate, voice))
      }
      return twimlResponse(
        sayAndGather({
          lines: [NOT_UNDERSTOOD_PROMPT[language], MENU_PROMPT[language]],
          language,
          rate,
          voice,
          actionUrl: stepUrl('menu', repeats + 1),
          speechAvailable: true,
        }),
      )
    }

    // Speech only.
    const intent = interpretSpeech(speechText, language)
    if (intent === 'taken') {
      await recordResponse({ type: 'speech', keyPressed: null, speechText, confirmed: false })
      return twimlResponse(
        sayAndGather({
          lines: [CONFIRM_PROMPT[language]],
          language,
          rate,
          voice,
          actionUrl: stepUrl('confirm', 0, '&origin=speech'),
          speechAvailable: true,
        }),
      )
    }
    if (intent === 'later') {
      await recordResponse({ type: 'speech', keyPressed: null, speechText, confirmed: false })
      await scheduleRemindLater(db, attempt, dose, prefs)
      await db.update('call_attempts', `id=eq.${attempt.id}`, { status: 'completed' })
      return twimlResponse(sayAndHangup([LATER_PROMPT[language]], language, rate, voice))
    }
    if (intent === 'help') {
      await recordResponse({ type: 'speech', keyPressed: null, speechText, confirmed: false })
      await flagHelp(db, attempt)
      return twimlResponse(
        sayAndHangup([HELP_PROMPT[language], SAFETY_LINE[language]], language, rate, voice),
      )
    }
    // Unintelligible speech: fall back to keypad-only, and say so.
    if (repeats >= MAX_MENU_REPEATS) {
      await recordResponse({ type: 'speech', keyPressed: null, speechText, confirmed: false })
      await db.update('call_attempts', `id=eq.${attempt.id}`, { status: 'completed' })
      return twimlResponse(sayAndHangup([GOODBYE_PROMPT[language]], language, rate, voice))
    }
    return twimlResponse(
      sayAndGather({
        lines: [
          NOT_UNDERSTOOD_PROMPT[language],
          SPEECH_UNAVAILABLE_PROMPT[language],
          MENU_PROMPT[language],
        ],
        language,
        rate,
        voice,
        actionUrl: stepUrl('menu', repeats + 1),
        speechAvailable: false,
      }),
    )
  }

  // -- Confirm (repeat-back) --------------------------------------------
  if (step === 'confirm') {
    const origin = url.searchParams.get('origin') ?? 'keypad'
    let decision: 'confirmed' | 'back_to_menu' | 'repeat_confirm' = 'repeat_confirm'
    if (digits !== null) {
      decision = mapConfirmKey(digits)
    } else if (speechText !== null && speechText.trim() !== '') {
      const yesNo = interpretYesNo(speechText, language)
      if (yesNo === true) decision = 'confirmed'
      else if (yesNo === false) decision = 'back_to_menu'
    }
    if (decision === 'confirmed') {
      await recordResponse({
        type: origin === 'speech' ? 'speech' : 'keypad',
        keyPressed: digits,
        speechText,
        confirmed: true,
      })
      // Record the dose ONLY when it is still pending — the guarded
      // update means a concurrently-confirmed dose is never
      // overwritten, and the unique (schedule, date, time) constraint
      // still guards against duplicates.
      if (dose) {
        const updated = await db.update<DoseEventRow>(
          'dose_events',
          `id=eq.${dose.id}&status=eq.pending`,
          {
            status: 'taken',
            source: 'call',
            call_attempt_id: attempt.id,
            action_at: new Date().toISOString(),
          },
        )
        if (updated.error !== null) {
          console.error('call-webhook: failed to record dose event', updated.error)
        }
      }
      await db.update('call_attempts', `id=eq.${attempt.id}`, { status: 'completed' })
      return twimlResponse(sayAndHangup([CONFIRMED_PROMPT[language]], language, rate, voice))
    }
    if (decision === 'back_to_menu') {
      return twimlResponse(redirectTo(stepUrl('menu', 0)))
    }
    if (repeats >= MAX_CONFIRM_REPEATS) {
      await recordResponse({
        type: origin === 'speech' ? 'speech' : 'keypad',
        keyPressed: digits,
        speechText,
        confirmed: false,
      })
      await db.update('call_attempts', `id=eq.${attempt.id}`, { status: 'completed' })
      return twimlResponse(sayAndHangup([GOODBYE_PROMPT[language]], language, rate, voice))
    }
    return twimlResponse(
      sayAndGather({
        lines: [NOT_UNDERSTOOD_PROMPT[language], CONFIRM_PROMPT[language]],
        language,
        rate,
        voice,
        actionUrl: stepUrl('confirm', repeats + 1, `&origin=${origin}`),
        speechAvailable: true,
      }),
    )
  }

  // Unknown step: back to the menu.
  return twimlResponse(redirectTo(stepUrl('menu', 0)))
})

/** Press 2 — "remind me later". Queues a follow-up attempt under the
 * retry cap (never marks the dose taken) and snoozes the dose event
 * so the in-app UI agrees with the call. */
async function scheduleRemindLater(
  db: SupabaseRest,
  attempt: CallAttemptRow,
  dose: DoseEventRow | null,
  prefs: CallPreferences | null,
): Promise<void> {
  const nowIso = new Date().toISOString()
  const delay = prefs?.retry_delay_minutes ?? 15
  const retryCount = attempt.retry_count + 1
  if (retryCount <= effectiveRetryCap(prefs?.retry_count)) {
    const followUpAt = addMinutesIso(nowIso, delay)
    const key = buildIdempotencyKey({
      patientId: attempt.patient_id,
      scheduleId: attempt.schedule_id,
      scheduledDate: dose?.scheduled_date ?? attempt.scheduled_for.slice(0, 10),
      scheduledTime: dose?.scheduled_time ?? attempt.scheduled_for.slice(11, 16),
      attemptNumber: attempt.attempt_number + 1,
    })
    const inserted = await db.insertIgnoreConflict(
      'call_attempts',
      {
        patient_id: attempt.patient_id,
        medication_id: attempt.medication_id,
        schedule_id: attempt.schedule_id,
        dose_event_id: attempt.dose_event_id,
        scheduled_for: followUpAt,
        attempt_number: attempt.attempt_number + 1,
        status: 'queued',
        provider: 'twilio',
        idempotency_key: key,
        retry_count: retryCount,
        next_retry_at: null,
        escalation_status: 'none',
      },
      'idempotency_key',
    )
    if (inserted.error !== null) {
      console.error('call-webhook: failed to queue remind-later call', inserted.error)
    }
  }
  if (dose) {
    await db.update('dose_events', `id=eq.${dose.id}`, {
      snoozed_until: addMinutesIso(nowIso, delay),
    })
  }
}

/** Press 3 — "I need help". Flags the attempt for escalation and logs
 * an audit entry. The caregiver alert itself is written by
 * scan-due-calls only after the consent gate passes — this function
 * never alerts a caregiver directly, so "no consent, no alert" holds. */
async function flagHelp(db: SupabaseRest, attempt: CallAttemptRow): Promise<void> {
  await db.update('call_attempts', `id=eq.${attempt.id}`, {
    status: 'completed',
    escalation_status: 'pending',
  })
  const logged = await db.insert('audit_events', {
    user_id: attempt.patient_id,
    action: 'call_help_requested',
    entity: 'call_attempt',
    entity_id: attempt.id,
    details: { medication_id: attempt.medication_id },
  })
  if (logged.error !== null) {
    console.error('call-webhook: failed to log help request', logged.error)
  }
}
