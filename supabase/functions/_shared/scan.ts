/* Pure planning for scan-due-calls.
 *
 * Given the doses due in this scan window, the patients' call
 * preferences, per-medicine settings, and the attempts already queued,
 * decide which doses get a call and why each skipped dose is skipped.
 * No I/O happens here — the function entry does the database reads and
 * writes, and this module is unit-tested with plain data.
 *
 * Duplicate-scan defence (two layers):
 *   1. This planner skips any dose whose idempotency key already has an
 *      attempt row (pre-insert existence check, by key).
 *   2. The UNIQUE constraint on call_attempts.idempotency_key makes a
 *      duplicate insert fail even if two scanners race.
 * A retry is a NEW attempt (attempt_number + 1) with a NEW key, so the
 * retry path never collides with the original. */

import { buildIdempotencyKey } from './idempotency'
import { effectiveRetryCap } from './retry'
import { isInQuietHours } from './time'
import type {
  CallAttemptRow,
  CallPreferences,
  DueDose,
  MedicineCallSettings,
  PatientCallInfo,
} from './types'

export type SkipReason =
  | 'no_preferences'
  | 'calls_disabled'
  | 'no_consent'
  | 'paused'
  | 'no_phone'
  | 'quiet_hours'
  | 'medicine_calls_disabled'
  | 'already_queued'

export interface PlannedCall {
  patientId: string
  scheduleId: string
  medicationId: string
  doseEventId: string | null
  scheduledFor: string
  attemptNumber: number
  idempotencyKey: string
  phoneNumber: string
}

export interface SkippedDose {
  dose: DueDose
  reason: SkipReason
}

export interface ScanPlan {
  toCall: PlannedCall[]
  skipped: SkippedDose[]
}

/** Plan first attempts for doses due now. */
export function planDueCalls(input: {
  doses: DueDose[]
  preferencesByUser: Map<string, CallPreferences>
  settingsByMedication: Map<string, MedicineCallSettings>
  patientsById: Map<string, PatientCallInfo>
  /** Attempts already in the database (any status). */
  existingAttempts: CallAttemptRow[]
  now: Date
}): ScanPlan {
  const existingKeys = new Set(input.existingAttempts.map((a) => a.idempotency_key))
  const plannedKeys = new Set<string>()
  const toCall: PlannedCall[] = []
  const skipped: SkippedDose[] = []

  for (const dose of input.doses) {
    const prefs = input.preferencesByUser.get(dose.patient_id)
    const skip = (reason: SkipReason) => skipped.push({ dose, reason })

    if (!prefs) {
      skip('no_preferences')
      continue
    }
    if (!prefs.calls_enabled) {
      skip('calls_disabled')
      continue
    }
    if (!prefs.consent_calls) {
      skip('no_consent')
      continue
    }
    if (prefs.paused) {
      skip('paused')
      continue
    }
    if (!prefs.phone_number) {
      skip('no_phone')
      continue
    }
    const patient = input.patientsById.get(dose.patient_id)
    const timezone = patient?.timezone ?? 'Asia/Kolkata'
    if (
      isInQuietHours(
        input.now,
        timezone,
        prefs.quiet_hours_start,
        prefs.quiet_hours_end,
      )
    ) {
      skip('quiet_hours')
      continue
    }
    const medSettings = input.settingsByMedication.get(
      `${dose.patient_id}:${dose.medication_id}`,
    )
    if (medSettings && !medSettings.calls_enabled) {
      skip('medicine_calls_disabled')
      continue
    }
    const idempotencyKey = buildIdempotencyKey({
      patientId: dose.patient_id,
      scheduleId: dose.schedule_id,
      scheduledDate: dose.scheduled_date,
      scheduledTime: dose.scheduled_time,
      attemptNumber: 1,
    })
    if (existingKeys.has(idempotencyKey) || plannedKeys.has(idempotencyKey)) {
      skip('already_queued')
      continue
    }
    plannedKeys.add(idempotencyKey)
    toCall.push({
      patientId: dose.patient_id,
      scheduleId: dose.schedule_id,
      medicationId: dose.medication_id,
      doseEventId: dose.dose_event_id,
      scheduledFor: dose.scheduled_for,
      attemptNumber: 1,
      idempotencyKey,
      phoneNumber: prefs.phone_number,
    })
  }

  return { toCall, skipped }
}

/** Plan retries for attempts whose retry window has arrived. A retry
 * needs: a retryable terminal status, next_retry_at reached, retries
 * left under the cap, and no attempt row already existing for the next
 * attempt number. The dose must still be unconfirmed. */
export function planRetries(input: {
  attempts: CallAttemptRow[]
  preferencesByUser: Map<string, CallPreferences>
  /** Dose-event ids that are already confirmed (taken/skipped/missed). */
  confirmedDoseEventIds: Set<string>
  /** The scheduled date/time for each attempt's dose, keyed by
   * dose_event_id (null dose_event_id falls back to scheduled_for). */
  doseIdentityByEventId: Map<string, { date: string; time: string }>
  nowIso: string
}): PlannedCall[] {
  const nowMs = new Date(input.nowIso).getTime()
  const planned: PlannedCall[] = []
  const existingKeys = new Set(input.attempts.map((a) => a.idempotency_key))

  for (const attempt of input.attempts) {
    if (
      attempt.status !== 'no_answer' &&
      attempt.status !== 'busy' &&
      attempt.status !== 'failed' &&
      attempt.status !== 'voicemail'
    ) {
      continue
    }
    if (!attempt.next_retry_at) continue
    if (new Date(attempt.next_retry_at).getTime() > nowMs) continue
    if (attempt.dose_event_id && input.confirmedDoseEventIds.has(attempt.dose_event_id)) {
      continue
    }
    const prefs = input.preferencesByUser.get(attempt.patient_id)
    if (!prefs || !prefs.calls_enabled || !prefs.consent_calls || prefs.paused) {
      continue
    }
    if (!prefs.phone_number) continue
    if (attempt.retry_count >= effectiveRetryCap(prefs.retry_count)) continue

    const identity = attempt.dose_event_id
      ? input.doseIdentityByEventId.get(attempt.dose_event_id)
      : undefined
    const date = identity?.date ?? attempt.scheduled_for.slice(0, 10)
    const time = identity?.time ?? attempt.scheduled_for.slice(11, 16)
    const attemptNumber = attempt.attempt_number + 1
    const idempotencyKey = buildIdempotencyKey({
      patientId: attempt.patient_id,
      scheduleId: attempt.schedule_id,
      scheduledDate: date,
      scheduledTime: time,
      attemptNumber,
    })
    if (existingKeys.has(idempotencyKey)) continue
    existingKeys.add(idempotencyKey)
    planned.push({
      patientId: attempt.patient_id,
      scheduleId: attempt.schedule_id,
      medicationId: attempt.medication_id,
      doseEventId: attempt.dose_event_id,
      scheduledFor: attempt.scheduled_for,
      attemptNumber,
      idempotencyKey,
      phoneNumber: prefs.phone_number,
    })
  }

  return planned
}
