import { describe, expect, it } from 'vitest'
import { buildCallHistoryEntries, resolveDoseStatus } from './callHistory'
import type { CallAttempt, CallResponse } from '../types/calls'
import type { DoseEvent, Medication } from '../types'

const TODAY = '2026-11-22'

/** ISO instant for a local date/time — the join logic works in local
 * time, so the fixtures must too (no assumed timezone). */
function localIso(day: number, hour: number, minute = 0): string {
  return new Date(2026, 10, day, hour, minute).toISOString()
}

function attempt(over: Partial<CallAttempt> = {}): CallAttempt {
  return {
    id: 'att-1',
    patient_id: 'patient-1',
    medication_id: 'med-1',
    schedule_id: 'sched-1',
    dose_event_id: null,
    scheduled_for: localIso(22, 8),
    attempt_number: 1,
    status: 'completed',
    provider: 'twilio',
    provider_call_sid: null,
    idempotency_key: 'k1',
    retry_count: 0,
    next_retry_at: null,
    escalation_status: 'none',
    created_at: localIso(22, 8),
    updated_at: localIso(22, 8),
    ...over,
  }
}

function event(over: Partial<DoseEvent> = {}): DoseEvent {
  return {
    id: 'ev-1',
    schedule_id: 'sched-1',
    patient_id: 'patient-1',
    medication_id: 'med-1',
    scheduled_date: '2026-11-22',
    scheduled_time: '08:00',
    status: 'taken',
    action_at: localIso(22, 8, 5),
    note: null,
    snoozed_until: null,
    source: 'app',
    call_attempt_id: null,
    created_at: localIso(22, 8, 5),
    updated_at: localIso(22, 8, 5),
    ...over,
  }
}

function med(over: Partial<Medication> = {}): Medication {
  return {
    id: 'med-1',
    patient_id: 'patient-1',
    name: 'Amlodipine',
    brand_name: null,
    strength: '5 mg',
    form: 'tablet',
    instructions: 'Take one tablet.',
    dose_amount: '1 tablet',
    frequency: 'once_daily',
    start_date: '2026-11-01',
    end_date: null,
    prescriber_name: null,
    notes: null,
    status: 'active',
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    ...over,
  }
}

function response(over: Partial<CallResponse> = {}): CallResponse {
  return {
    id: 'resp-1',
    call_attempt_id: 'att-1',
    response_type: 'keypad',
    key_pressed: '1',
    speech_text: null,
    confirmed: true,
    recorded_at: localIso(22, 8, 1),
    ...over,
  }
}

describe('resolveDoseStatus', () => {
  it('prefers the dose event linked by dose_event_id', () => {
    const a = attempt({ dose_event_id: 'ev-9' })
    const ev = event({ id: 'ev-9', status: 'missed' })
    expect(resolveDoseStatus(a, [ev], TODAY)).toBe('missed')
  })

  it('falls back to the event for the same schedule/date/time', () => {
    const a = attempt()
    expect(resolveDoseStatus(a, [event()], TODAY)).toBe('taken')
  })

  it('returns pending for a today attempt with no dose event', () => {
    expect(resolveDoseStatus(attempt(), [], TODAY)).toBe('pending')
  })

  it('returns null for a past attempt with no dose event', () => {
    const a = attempt({ scheduled_for: localIso(20, 8) })
    expect(resolveDoseStatus(a, [], TODAY)).toBeNull()
  })

  it('does not match an event for a different schedule', () => {
    const a = attempt()
    const other = event({ schedule_id: 'sched-other' })
    expect(resolveDoseStatus(a, [other], TODAY)).toBe('pending')
  })

  it('ignores a dangling dose_event_id and falls through to the schedule match', () => {
    const a = attempt({ dose_event_id: 'ev-gone' })
    expect(resolveDoseStatus(a, [event()], TODAY)).toBe('taken')
  })
})

describe('buildCallHistoryEntries', () => {
  it('sorts newest first and joins medicine + responses + dose status', () => {
    const old = attempt({
      id: 'att-old',
      scheduled_for: localIso(21, 8),
      dose_event_id: 'ev-old',
    })
    const entries = buildCallHistoryEntries({
      attempts: [old, attempt()],
      responses: [response()],
      medications: [med()],
      doseEvents: [
        event({ id: 'ev-old', scheduled_date: '2026-11-21', status: 'missed' }),
      ],
      today: TODAY,
    })
    expect(entries).toHaveLength(2)
    expect(entries[0]?.attempt.id).toBe('att-1')
    expect(entries[0]?.medicationName).toBe('Amlodipine')
    expect(entries[0]?.doseStatus).toBe('pending')
    expect(entries[0]?.responses).toHaveLength(1)
    expect(entries[1]?.doseStatus).toBe('missed')
    expect(entries[1]?.responses).toHaveLength(0)
  })

  it('orders responses oldest first', () => {
    const entries = buildCallHistoryEntries({
      attempts: [attempt()],
      responses: [
        response({ id: 'r2', recorded_at: localIso(22, 8, 3) }),
        response({ id: 'r1', recorded_at: localIso(22, 8, 1) }),
      ],
      medications: [med()],
      doseEvents: [],
      today: TODAY,
    })
    expect(entries[0]?.responses.map((r) => r.id)).toEqual(['r1', 'r2'])
  })

  it('skips attempts whose medicine is gone rather than inventing a name', () => {
    const entries = buildCallHistoryEntries({
      attempts: [attempt({ medication_id: 'med-gone' })],
      responses: [],
      medications: [med()],
      doseEvents: [],
      today: TODAY,
    })
    expect(entries).toHaveLength(0)
  })

  it('returns an empty list when there are no attempts', () => {
    expect(
      buildCallHistoryEntries({
        attempts: [],
        responses: [],
        medications: [med()],
        doseEvents: [],
        today: TODAY,
      }),
    ).toEqual([])
  })
})
