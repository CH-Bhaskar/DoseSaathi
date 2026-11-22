/* scan-due-calls — scheduled Edge Function (pg_cron, every 10 min).
 *
 * One run does four jobs:
 *   1. Find doses due now and queue a first call attempt for each
 *      (consent, quiet-hours, per-medicine, and duplicate checks all
 *      live in _shared/scan.ts).
 *   2. Retry attempts whose retry window has arrived (hard cap: 3).
 *   3. Trigger queued attempts that are due (includes Press-2
 *      "remind me later" follow-ups created by call-webhook).
 *   4. Escalate to caregivers: unconfirmed doses past the configured
 *      delay, and Press-3 help requests (help escalates immediately —
 *      the delay exists for passive non-confirmation, not for an
 *      explicit request for help). Consent-gated, always.
 *
 * Idempotency: every insert goes through the UNIQUE idempotency_key
 * with resolution=ignore-duplicates, so a re-run or a race can never
 * queue the same call twice.
 *
 * This function never places a call itself — it inserts attempt rows
 * and invokes trigger-call, which owns the Twilio interaction. */

import { shouldEscalate, escalationMessage } from '../_shared/escalation.ts'
import { jsonResponse } from '../_shared/http.ts'
import { planDueCalls, planRetries } from '../_shared/scan.ts'
import {
  SupabaseRest,
  supabaseConfigFromEnv,
} from '../_shared/supabaseRest.ts'
import { isDoseDue, zonedTimeToUtc } from '../_shared/time.ts'
import type {
  CallAttemptRow,
  CallPreferences,
  DueDose,
  MedicineCallSettings,
  PatientCallInfo,
} from '../_shared/types.ts'

const DUE_WINDOW_MINUTES = 15

interface DoseEventRow {
  id: string
  schedule_id: string
  medication_id: string
  patient_id: string
  scheduled_date: string
  scheduled_time: string
  status: string
}

interface MedicationRow {
  id: string
  patient_id: string
  name: string
  dose_amount: string
}

interface CaregiverRow {
  patient_id: string
  caregiver_id: string | null
}

function getEnv(key: string): string | undefined {
  return Deno.env.get(key)
}

function isoDateDaysFromNow(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000)
  return d.toISOString().slice(0, 10)
}

async function invokeTriggerCall(
  supabaseUrl: string,
  serviceRoleKey: string,
  attemptId: string,
): Promise<boolean> {
  try {
    const response = await fetch(
      `${supabaseUrl.replace(/\/$/, '')}/functions/v1/trigger-call`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ attempt_id: attemptId }),
      },
    )
    return response.ok
  } catch (error) {
    console.error('trigger-call invocation failed', attemptId, error)
    return false
  }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405)
  }
  const configResult = supabaseConfigFromEnv(getEnv)
  if (configResult.error !== null) {
    console.error('scan-due-calls: supabase not configured')
    return jsonResponse({ error: 'supabase_not_configured' }, 500)
  }
  const { supabaseUrl, serviceRoleKey } = configResult.data
  const db = new SupabaseRest({ supabaseUrl, serviceRoleKey })
  const now = new Date()
  const nowIso = now.toISOString()
  const runStartedAt = nowIso

  // -- Load the working set ---------------------------------------------
  const dateFrom = isoDateDaysFromNow(-1)
  const dateTo = isoDateDaysFromNow(1)
  const [eventsRes, prefsRes, settingsRes, profilesRes, attemptsRes, medsRes, caregiversRes] =
    await Promise.all([
      db.select<DoseEventRow>(
        'dose_events',
        `select=id,schedule_id,medication_id,patient_id,scheduled_date,scheduled_time,status&scheduled_date=gte.${dateFrom}&scheduled_date=lte.${dateTo}`,
      ),
      db.select<CallPreferences>('call_preferences', 'select=*'),
      db.select<MedicineCallSettings>('medicine_call_settings', 'select=*'),
      db.select<PatientCallInfo>(
        'profiles',
        'select=id,full_name,timezone,preferred_language',
      ),
      db.select<CallAttemptRow>(
        'call_attempts',
        `select=*&created_at=gte.${new Date(now.getTime() - 48 * 3_600_000).toISOString()}`,
      ),
      db.select<MedicationRow>(
        'medications',
        'select=id,patient_id,name,dose_amount',
      ),
      db.select<CaregiverRow>(
        'caregiver_connections',
        'select=patient_id,caregiver_id&status=eq.active',
      ),
    ])
  for (const [name, res] of [
    ['dose_events', eventsRes],
    ['call_preferences', prefsRes],
    ['medicine_call_settings', settingsRes],
    ['profiles', profilesRes],
    ['call_attempts', attemptsRes],
    ['medications', medsRes],
    ['caregiver_connections', caregiversRes],
  ] as const) {
    if (res.error !== null) {
      console.error(`scan-due-calls: failed to load ${name}: ${res.error}`)
      return jsonResponse({ error: `load_failed_${name}` }, 500)
    }
  }
  const events = eventsRes.data ?? []
  const prefsList = prefsRes.data ?? []
  const settingsList = settingsRes.data ?? []
  const profilesList = profilesRes.data ?? []
  const attempts = attemptsRes.data ?? []
  const medsList = medsRes.data ?? []
  const caregiversList = caregiversRes.data ?? []

  const preferencesByUser = new Map(prefsList.map((p) => [p.user_id, p]))
  const settingsByMedication = new Map(
    settingsList.map((s) => [`${s.user_id}:${s.medication_id}`, s]),
  )
  const patientsById = new Map(profilesList.map((p) => [p.id, p]))
  const medsById = new Map(medsList.map((m) => [m.id, m]))
  const eventsById = new Map(events.map((e) => [e.id, e]))
  const activeCaregiversByPatient = new Map<string, string[]>()
  for (const c of caregiversList) {
    if (!c.caregiver_id) continue
    const list = activeCaregiversByPatient.get(c.patient_id) ?? []
    list.push(c.caregiver_id)
    activeCaregiversByPatient.set(c.patient_id, list)
  }

  // -- Job 1: first attempts for doses due now --------------------------
  const dueDoses: DueDose[] = []
  for (const e of events) {
    if (e.status !== 'pending') continue
    const patient = patientsById.get(e.patient_id)
    const timezone = patient?.timezone ?? 'Asia/Kolkata'
    if (!isDoseDue(e.scheduled_date, e.scheduled_time, timezone, now, DUE_WINDOW_MINUTES)) {
      continue
    }
    const dueAt = zonedTimeToUtc(e.scheduled_date, e.scheduled_time, timezone)
    if (dueAt === null) continue
    const med = medsById.get(e.medication_id)
    dueDoses.push({
      dose_event_id: e.id,
      schedule_id: e.schedule_id,
      medication_id: e.medication_id,
      patient_id: e.patient_id,
      scheduled_date: e.scheduled_date,
      scheduled_time: e.scheduled_time,
      scheduled_for: dueAt.toISOString(),
      medication_name: med?.name ?? '',
      dose_amount: med?.dose_amount ?? '',
    })
  }
  const plan = planDueCalls({
    doses: dueDoses,
    preferencesByUser,
    settingsByMedication,
    patientsById,
    existingAttempts: attempts,
    now,
  })

  // -- Job 2: retries whose window has arrived --------------------------
  const confirmedDoseEventIds = new Set(
    events.filter((e) => e.status !== 'pending').map((e) => e.id),
  )
  const doseIdentityByEventId = new Map(
    events.map((e) => [
      e.id,
      { date: e.scheduled_date, time: e.scheduled_time },
    ]),
  )
  const retries = planRetries({
    attempts,
    preferencesByUser,
    confirmedDoseEventIds,
    doseIdentityByEventId,
    nowIso,
  })

  // -- Insert + trigger --------------------------------------------------
  const invokedAttemptIds = new Set<string>()
  let queued = 0
  let triggered = 0
  for (const call of [...plan.toCall, ...retries]) {
    const retryCount = call.attemptNumber - 1
    const inserted = await db.insertIgnoreConflict<CallAttemptRow>(
      'call_attempts',
      {
        patient_id: call.patientId,
        medication_id: call.medicationId,
        schedule_id: call.scheduleId,
        dose_event_id: call.doseEventId,
        scheduled_for: call.scheduledFor,
        attempt_number: call.attemptNumber,
        status: 'queued',
        provider: 'twilio',
        idempotency_key: call.idempotencyKey,
        retry_count: retryCount,
        next_retry_at: null,
        escalation_status: 'none',
      },
      'idempotency_key',
    )
    if (inserted.error !== null) {
      console.error('scan-due-calls: insert failed', call.idempotencyKey, inserted.error)
      continue
    }
    if (inserted.data === null) continue // raced duplicate — already queued
    queued += 1
    invokedAttemptIds.add(inserted.data.id)
    if (await invokeTriggerCall(supabaseUrl, serviceRoleKey, inserted.data.id)) {
      triggered += 1
    }
  }

  // -- Job 3: queued attempts that are due (e.g. Press-2 follow-ups) ----
  let queuedTriggered = 0
  for (const attempt of attempts) {
    if (attempt.status !== 'queued') continue
    if (attempt.created_at >= runStartedAt) continue // inserted above
    if (invokedAttemptIds.has(attempt.id)) continue
    if (new Date(attempt.scheduled_for).getTime() > now.getTime()) continue
    invokedAttemptIds.add(attempt.id)
    if (await invokeTriggerCall(supabaseUrl, serviceRoleKey, attempt.id)) {
      queuedTriggered += 1
    }
  }

  // -- Job 4: caregiver escalation ---------------------------------------
  let escalated = 0
  let escalationDeclined = 0
  for (const attempt of attempts) {
    const isHelpRequest = attempt.escalation_status === 'pending'
    const isUnconfirmed =
      attempt.escalation_status === 'none' &&
      (attempt.status === 'no_answer' ||
        attempt.status === 'busy' ||
        attempt.status === 'failed' ||
        attempt.status === 'voicemail' ||
        attempt.status === 'completed')
    if (!isHelpRequest && !isUnconfirmed) continue

    const prefs = preferencesByUser.get(attempt.patient_id)
    if (!prefs) continue
    const doseEvent = attempt.dose_event_id
      ? eventsById.get(attempt.dose_event_id)
      : undefined
    const doseStillUnconfirmed =
      doseEvent === undefined || doseEvent.status === 'pending'
    const minutesSinceDue =
      (now.getTime() - new Date(attempt.scheduled_for).getTime()) / 60_000
    const activeCaregivers =
      activeCaregiversByPatient.get(attempt.patient_id) ?? []
    const decision = shouldEscalate({
      escalationEnabled: prefs.escalation_enabled,
      consentEscalation: prefs.consent_escalation,
      doseStillUnconfirmed,
      minutesSinceDue,
      // Help requests escalate immediately; passive non-confirmation
      // waits out the configured delay.
      escalationDelayMinutes: isHelpRequest ? 0 : prefs.escalation_delay_minutes,
      escalationStatus: attempt.escalation_status,
      hasActiveCaregiver: activeCaregivers.length > 0,
    })
    if (!decision.escalate) {
      if (
        decision.reason === 'no_consent' ||
        decision.reason === 'no_active_caregiver' ||
        decision.reason === 'escalation_disabled'
      ) {
        // Permanent gate failure — stop re-checking this attempt.
        await db.update('call_attempts', `id=eq.${attempt.id}`, {
          escalation_status: 'declined',
        })
        escalationDeclined += 1
      } else if (decision.reason === 'dose_confirmed' && isHelpRequest) {
        // Dose got confirmed another way; the help flag is moot.
        await db.update('call_attempts', `id=eq.${attempt.id}`, {
          escalation_status: 'none',
        })
      }
      continue
    }

    const patient = patientsById.get(attempt.patient_id)
    const med = medsById.get(attempt.medication_id)
    const message = escalationMessage({
      patientName: patient?.full_name ?? null,
      medicationName: med?.name ?? '',
      doseAmount: med?.dose_amount ?? '',
      scheduledTimeLabel: new Date(attempt.scheduled_for).toLocaleTimeString(
        'en-IN',
        { hour: 'numeric', minute: '2-digit' },
      ),
      speakMedicineDetails: prefs.speak_medicine_details,
      reason: isHelpRequest ? 'help' : 'unconfirmed',
    })
    let allLogged = true
    for (const caregiverId of activeCaregivers) {
      const logged = await db.insert('notification_logs', {
        patient_id: attempt.patient_id,
        recipient_id: caregiverId,
        recipient_email: null,
        type: 'missed_dose_alert',
        channel: 'in_app',
        message,
        status: 'queued',
      })
      if (logged.error !== null) {
        console.error('scan-due-calls: notification log failed', logged.error)
        allLogged = false
      }
    }
    if (allLogged) {
      await db.update('call_attempts', `id=eq.${attempt.id}`, {
        escalation_status: 'notified',
      })
      escalated += 1
    }
  }

  return jsonResponse({
    ok: true,
    due_doses: dueDoses.length,
    planned: plan.toCall.length,
    retries_planned: retries.length,
    queued,
    triggered,
    queued_triggered: queuedTriggered,
    escalated,
    escalation_declined: escalationDeclined,
    skipped: plan.skipped.map((s) => ({
      schedule_id: s.dose.schedule_id,
      reason: s.reason,
    })),
  })
})
