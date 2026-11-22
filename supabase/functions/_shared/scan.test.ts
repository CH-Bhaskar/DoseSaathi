import { describe, expect, it } from 'vitest'
import { buildIdempotencyKey } from './idempotency'
import { planDueCalls, planRetries } from './scan'
import type {
  CallAttemptRow,
  CallPreferences,
  DueDose,
  MedicineCallSettings,
  PatientCallInfo,
} from './types'

const PATIENT_ID = '11111111-1111-1111-1111-111111111111'
const SCHEDULE_ID = '22222222-2222-2222-2222-222222222222'
const MEDICATION_ID = '33333333-3333-3333-3333-333333333333'
const NOW = new Date('2026-11-22T03:05:00Z') // 08:35 IST

function prefs(overrides: Partial<CallPreferences> = {}): CallPreferences {
  return {
    user_id: PATIENT_ID,
    calls_enabled: true,
    paused: false,
    phone_number: '+919999999999',
    language: 'en',
    voice_name: null,
    speech_rate: 0.9,
    retry_count: 2,
    retry_delay_minutes: 15,
    quiet_hours_start: '21:00',
    quiet_hours_end: '07:00',
    escalation_enabled: true,
    escalation_delay_minutes: 60,
    speak_medicine_details: false,
    consent_calls: true,
    consent_escalation: true,
    consent_calls_changed_at: null,
    ...overrides,
  }
}

function dose(overrides: Partial<DueDose> = {}): DueDose {
  return {
    dose_event_id: '44444444-4444-4444-4444-444444444444',
    schedule_id: SCHEDULE_ID,
    medication_id: MEDICATION_ID,
    patient_id: PATIENT_ID,
    scheduled_date: '2026-11-22',
    scheduled_time: '08:30',
    scheduled_for: '2026-11-22T03:00:00.000Z',
    medication_name: 'Amlodipine',
    dose_amount: '5 mg',
    ...overrides,
  }
}

function patient(): PatientCallInfo {
  return {
    id: PATIENT_ID,
    full_name: 'Ravi',
    timezone: 'Asia/Kolkata',
    preferred_language: 'en',
  }
}

function attempt(overrides: Partial<CallAttemptRow> = {}): CallAttemptRow {
  return {
    id: '55555555-5555-5555-5555-555555555555',
    patient_id: PATIENT_ID,
    medication_id: MEDICATION_ID,
    schedule_id: SCHEDULE_ID,
    dose_event_id: '44444444-4444-4444-4444-444444444444',
    scheduled_for: '2026-11-22T03:00:00.000Z',
    attempt_number: 1,
    status: 'queued',
    provider: 'twilio',
    provider_call_sid: null,
    idempotency_key: buildIdempotencyKey({
      patientId: PATIENT_ID,
      scheduleId: SCHEDULE_ID,
      scheduledDate: '2026-11-22',
      scheduledTime: '08:30',
      attemptNumber: 1,
    }),
    retry_count: 0,
    next_retry_at: null,
    escalation_status: 'none',
    created_at: '2026-11-22T03:00:00.000Z',
    updated_at: '2026-11-22T03:00:00.000Z',
    ...overrides,
  }
}

function planInput(overrides: {
  doses?: DueDose[]
  prefs?: CallPreferences | null
  settings?: MedicineCallSettings[]
  existingAttempts?: CallAttemptRow[]
  now?: Date
} = {}) {
  return {
    doses: overrides.doses ?? [dose()],
    preferencesByUser: new Map(
      overrides.prefs === null ? [] : [[PATIENT_ID, overrides.prefs ?? prefs()]],
    ),
    settingsByMedication: new Map(
      (overrides.settings ?? []).map((s) => [`${s.user_id}:${s.medication_id}`, s]),
    ),
    patientsById: new Map([[PATIENT_ID, patient()]]),
    existingAttempts: overrides.existingAttempts ?? [],
    now: overrides.now ?? NOW,
  }
}

describe('planDueCalls', () => {
  it('plans a call for a due dose with consent', () => {
    const plan = planDueCalls(planInput())
    expect(plan.toCall).toHaveLength(1)
    expect(plan.toCall[0]).toMatchObject({
      patientId: PATIENT_ID,
      scheduleId: SCHEDULE_ID,
      attemptNumber: 1,
      phoneNumber: '+919999999999',
    })
    expect(plan.toCall[0]?.idempotencyKey).toBe(
      'call:11111111-1111-1111-1111-111111111111:22222222-2222-2222-2222-222222222222:2026-11-22:08:30:a1',
    )
    expect(plan.skipped).toHaveLength(0)
  })

  it('a second scan over the same dose plans nothing (duplicate-scan defence)', () => {
    const first = planDueCalls(planInput())
    expect(first.toCall).toHaveLength(1)
    // The first scan inserted the attempt; the second scan sees it.
    const second = planDueCalls(
      planInput({ existingAttempts: [attempt()] }),
    )
    expect(second.toCall).toHaveLength(0)
    expect(second.skipped).toHaveLength(1)
    expect(second.skipped[0]?.reason).toBe('already_queued')
  })

  it('the same dose listed twice in one scan is planned once', () => {
    const plan = planDueCalls(planInput({ doses: [dose(), dose()] }))
    expect(plan.toCall).toHaveLength(1)
    expect(plan.skipped).toHaveLength(1)
    expect(plan.skipped[0]?.reason).toBe('already_queued')
  })

  it('skips without preferences', () => {
    const plan = planDueCalls(planInput({ prefs: null }))
    expect(plan.skipped[0]?.reason).toBe('no_preferences')
  })
  it('skips when calls are disabled', () => {
    const plan = planDueCalls(planInput({ prefs: prefs({ calls_enabled: false }) }))
    expect(plan.skipped[0]?.reason).toBe('calls_disabled')
  })
  it('skips without consent', () => {
    const plan = planDueCalls(planInput({ prefs: prefs({ consent_calls: false }) }))
    expect(plan.skipped[0]?.reason).toBe('no_consent')
  })
  it('skips when paused', () => {
    const plan = planDueCalls(planInput({ prefs: prefs({ paused: true }) }))
    expect(plan.skipped[0]?.reason).toBe('paused')
  })
  it('skips without a phone number', () => {
    const plan = planDueCalls(planInput({ prefs: prefs({ phone_number: null }) }))
    expect(plan.skipped[0]?.reason).toBe('no_phone')
  })
  it('skips during quiet hours', () => {
    // 22:00 IST
    const plan = planDueCalls(planInput({ now: new Date('2026-11-22T16:30:00Z') }))
    expect(plan.skipped[0]?.reason).toBe('quiet_hours')
  })
  it('skips when the medicine opted out of calls', () => {
    const plan = planDueCalls(
      planInput({
        settings: [{ user_id: PATIENT_ID, medication_id: MEDICATION_ID, calls_enabled: false }],
      }),
    )
    expect(plan.skipped[0]?.reason).toBe('medicine_calls_disabled')
  })
  it('calls when the medicine opted in explicitly', () => {
    const plan = planDueCalls(
      planInput({
        settings: [{ user_id: PATIENT_ID, medication_id: MEDICATION_ID, calls_enabled: true }],
      }),
    )
    expect(plan.toCall).toHaveLength(1)
  })
})

describe('planRetries', () => {
  const retryInput = (overrides: {
    attempts?: CallAttemptRow[]
    prefs?: CallPreferences
    confirmed?: Set<string>
  } = {}) => ({
    attempts: overrides.attempts ?? [
      attempt({
        status: 'no_answer',
        next_retry_at: '2026-11-22T03:10:00.000Z',
        retry_count: 0,
      }),
    ],
    preferencesByUser: new Map([[PATIENT_ID, overrides.prefs ?? prefs()]]),
    confirmedDoseEventIds: overrides.confirmed ?? new Set<string>(),
    doseIdentityByEventId: new Map([
      ['44444444-4444-4444-4444-444444444444', { date: '2026-11-22', time: '08:30' }],
    ]),
    nowIso: '2026-11-22T03:20:00.000Z',
  })

  it('plans a retry for an unanswered call whose window arrived', () => {
    const planned = planRetries(retryInput())
    expect(planned).toHaveLength(1)
    expect(planned[0]?.attemptNumber).toBe(2)
    expect(planned[0]?.idempotencyKey).toContain(':a2')
  })
  it('does not retry a completed call', () => {
    const planned = planRetries(
      retryInput({ attempts: [attempt({ status: 'completed', next_retry_at: '2026-11-22T03:10:00.000Z' })] }),
    )
    expect(planned).toHaveLength(0)
  })
  it('does not retry before next_retry_at', () => {
    const planned = planRetries(
      retryInput({ attempts: [attempt({ status: 'busy', next_retry_at: '2026-11-22T03:30:00.000Z' })] }),
    )
    expect(planned).toHaveLength(0)
  })
  it('does not retry at the cap', () => {
    const planned = planRetries(
      retryInput({
        attempts: [attempt({ status: 'failed', next_retry_at: '2026-11-22T03:10:00.000Z', retry_count: 2 })],
      }),
    )
    expect(planned).toHaveLength(0)
  })
  it('does not retry a dose that was confirmed another way', () => {
    const planned = planRetries(
      retryInput({ confirmed: new Set(['44444444-4444-4444-4444-444444444444']) }),
    )
    expect(planned).toHaveLength(0)
  })
  it('does not retry when the patient revoked consent or paused', () => {
    expect(
      planRetries(retryInput({ prefs: prefs({ consent_calls: false }) })),
    ).toHaveLength(0)
    expect(planRetries(retryInput({ prefs: prefs({ paused: true }) }))).toHaveLength(0)
  })
  it('does not plan a retry whose attempt row already exists', () => {
    const first = attempt({
      status: 'no_answer',
      next_retry_at: '2026-11-22T03:10:00.000Z',
      retry_count: 0,
    })
    const second = attempt({
      id: '66666666-6666-6666-6666-666666666666',
      attempt_number: 2,
      status: 'queued',
      idempotency_key: buildIdempotencyKey({
        patientId: PATIENT_ID,
        scheduleId: SCHEDULE_ID,
        scheduledDate: '2026-11-22',
        scheduledTime: '08:30',
        attemptNumber: 2,
      }),
    })
    const planned = planRetries(retryInput({ attempts: [first, second] }))
    expect(planned).toHaveLength(0)
  })
})
