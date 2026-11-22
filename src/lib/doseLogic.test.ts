import { describe, expect, it } from 'vitest'
import type {
  DoseEvent,
  Medication,
  MedicationSchedule,
} from '../types'
import {
  adherenceSummary,
  countdownFor,
  detectConflicts,
  dosesForDate,
  dueNow,
  expiredPendingDoses,
  isMedicationActiveOn,
  isScheduleDueOn,
  liveStatus,
  nextDose,
} from './doseLogic'
import { todayISO } from './time'

function med(over: Partial<Medication> = {}): Medication {
  return {
    id: 'med-1',
    patient_id: 'patient-1',
    name: 'Amlodipine',
    brand_name: null,
    strength: '5 mg',
    form: 'tablet',
    instructions: 'Take one tablet in the morning with water.',
    dose_amount: '1 tablet',
    frequency: 'once_daily',
    start_date: '2026-01-01',
    end_date: null,
    prescriber_name: 'Dr. Rao',
    notes: null,
    status: 'active',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

function sched(over: Partial<MedicationSchedule> = {}): MedicationSchedule {
  return {
    id: 'sched-1',
    medication_id: 'med-1',
    time_of_day: '08:00',
    days_of_week: null,
    food_rule: 'none',
    created_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

function event(over: Partial<DoseEvent> = {}): DoseEvent {
  return {
    id: 'event-1',
    schedule_id: 'sched-1',
    patient_id: 'patient-1',
    medication_id: 'med-1',
    scheduled_date: todayISO(),
    scheduled_time: '08:00',
    status: 'taken',
    action_at: null,
    note: null,
    snoozed_until: null,
    source: 'app',
    call_attempt_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...over,
  }
}

describe('liveStatus', () => {
  it('keeps taken doses taken', () => {
    expect(
      liveStatus({ scheduledHour: 8, status: 'taken', nowHour: 20 }),
    ).toBe('taken')
  })
  it('keeps skipped doses skipped', () => {
    expect(
      liveStatus({ scheduledHour: 8, status: 'skipped', nowHour: 20 }),
    ).toBe('skipped')
  })
  it('keeps a pending dose pending before its grace deadline', () => {
    expect(
      liveStatus({ scheduledHour: 8, status: 'pending', nowHour: 8.5 }),
    ).toBe('pending')
  })
  it('flips a pending dose to missed after the grace window', () => {
    expect(
      liveStatus({ scheduledHour: 8, status: 'pending', nowHour: 9.01 }),
    ).toBe('missed')
  })
  it('respects a custom grace period', () => {
    expect(
      liveStatus({
        scheduledHour: 8,
        status: 'pending',
        nowHour: 8.4,
        graceMinutes: 15,
      }),
    ).toBe('missed')
    expect(
      liveStatus({
        scheduledHour: 8,
        status: 'pending',
        nowHour: 8.4,
        graceMinutes: 30,
      }),
    ).toBe('pending')
  })
  it('snooze extends the deadline', () => {
    expect(
      liveStatus({
        scheduledHour: 8,
        status: 'pending',
        nowHour: 10,
        snoozedUntilHour: 9.5,
      }),
    ).toBe('pending')
    expect(
      liveStatus({
        scheduledHour: 8,
        status: 'pending',
        nowHour: 10.6,
        snoozedUntilHour: 9.5,
      }),
    ).toBe('missed')
  })
})

describe('countdownFor', () => {
  it('reports due-in before the scheduled time', () => {
    expect(countdownFor({ scheduledHour: 14, nowHour: 12 })).toEqual({
      kind: 'due-in',
      minutes: 120,
    })
  })
  it('reports misses-in inside the grace window', () => {
    expect(countdownFor({ scheduledHour: 8, nowHour: 8.5 })).toEqual({
      kind: 'misses-in',
      minutes: 30,
    })
  })
  it('reports overdue after the grace window', () => {
    expect(countdownFor({ scheduledHour: 8, nowHour: 10 })).toEqual({
      kind: 'overdue',
      minutes: 0,
    })
  })
})

describe('isMedicationActiveOn / isScheduleDueOn', () => {
  it('excludes paused and completed medicines', () => {
    expect(isMedicationActiveOn(med({ status: 'paused' }), '2026-06-01')).toBe(false)
    expect(isMedicationActiveOn(med({ status: 'completed' }), '2026-06-01')).toBe(false)
    expect(isMedicationActiveOn(med(), '2026-06-01')).toBe(true)
  })
  it('respects start and end dates', () => {
    expect(isMedicationActiveOn(med({ start_date: '2026-06-10' }), '2026-06-01')).toBe(false)
    expect(isMedicationActiveOn(med({ end_date: '2026-06-10' }), '2026-06-11')).toBe(false)
    expect(isMedicationActiveOn(med({ end_date: '2026-06-10' }), '2026-06-10')).toBe(true)
  })
  it('respects days_of_week (2026-11-22 is a Sunday = 7)', () => {
    expect(isScheduleDueOn(sched({ days_of_week: [7] }), '2026-11-22')).toBe(true)
    expect(isScheduleDueOn(sched({ days_of_week: [1] }), '2026-11-22')).toBe(false)
    expect(isScheduleDueOn(sched({ days_of_week: null }), '2026-11-22')).toBe(true)
  })
})

describe('dosesForDate', () => {
  it('builds one dose per due schedule, joined to its event', () => {
    const now = new Date()
    now.setHours(7, 0, 0, 0)
    const doses = dosesForDate({
      medications: [med()],
      schedules: [sched()],
      events: [event()],
      dateISO: todayISO(now),
      now,
    })
    expect(doses).toHaveLength(1)
    expect(doses[0]?.medication_name).toBe('Amlodipine')
    expect(doses[0]?.status).toBe('taken')
    expect(doses[0]?.event_id).toBe('event-1')
  })
  it('sorts doses by time', () => {
    const now = new Date()
    now.setHours(6, 0, 0, 0)
    const doses = dosesForDate({
      medications: [med()],
      schedules: [
        sched({ id: 's2', time_of_day: '20:00' }),
        sched({ id: 's1', time_of_day: '08:00' }),
      ],
      events: [],
      dateISO: todayISO(now),
      now,
    })
    expect(doses.map((d) => d.scheduled_time)).toEqual(['08:00', '20:00'])
  })
  it('shows a pending dose as missed live after grace expiry', () => {
    const now = new Date()
    now.setHours(10, 30, 0, 0)
    const doses = dosesForDate({
      medications: [med()],
      schedules: [sched()],
      events: [],
      dateISO: todayISO(now),
      now,
    })
    expect(doses[0]?.status).toBe('missed')
  })
  it('with live:false returns the stored status (for the escalation job)', () => {
    const now = new Date()
    now.setHours(10, 30, 0, 0)
    const doses = dosesForDate({
      medications: [med()],
      schedules: [sched()],
      events: [],
      dateISO: todayISO(now),
      now,
      live: false,
    })
    expect(doses[0]?.status).toBe('pending')
    // ...and the escalation helper then sees it as expired.
    expect(expiredPendingDoses(doses, now)).toHaveLength(1)
  })
})

describe('nextDose / dueNow / expiredPendingDoses', () => {
  it('nextDose returns the earliest pending dose', () => {
    const now = new Date()
    now.setHours(7, 0, 0, 0)
    const doses = dosesForDate({
      medications: [med()],
      schedules: [
        sched({ id: 's1', time_of_day: '08:00' }),
        sched({ id: 's2', time_of_day: '20:00' }),
      ],
      events: [],
      dateISO: todayISO(now),
      now,
    })
    expect(nextDose(doses)?.scheduled_time).toBe('08:00')
  })
  it('nextDose returns null when nothing is pending', () => {
    const now = new Date()
    now.setHours(7, 0, 0, 0)
    const doses = dosesForDate({
      medications: [med()],
      schedules: [sched()],
      events: [event()],
      dateISO: todayISO(now),
      now,
    })
    expect(nextDose(doses)).toBeNull()
  })
  it('dueNow finds doses whose time has come', () => {
    const now = new Date()
    now.setHours(8, 30, 0, 0)
    const doses = dosesForDate({
      medications: [med()],
      schedules: [
        sched({ id: 's1', time_of_day: '08:00' }),
        sched({ id: 's2', time_of_day: '20:00' }),
      ],
      events: [],
      dateISO: todayISO(now),
      now,
    })
    expect(dueNow(doses, now)).toHaveLength(1)
    expect(dueNow(doses, now)[0]?.scheduled_time).toBe('08:00')
  })
  it('expiredPendingDoses finds doses past their grace window', () => {
    const now = new Date()
    now.setHours(10, 0, 0, 0)
    const doses = dosesForDate({
      medications: [med()],
      schedules: [
        sched({ id: 's1', time_of_day: '08:00' }),
        sched({ id: 's2', time_of_day: '20:00' }),
      ],
      events: [],
      dateISO: todayISO(now),
      now,
    })
    // s1 is already live-missed, so expiredPendingDoses (which looks at
    // stored pending) needs raw pending input: rebuild without live flip.
    const raw = doses.map((d) => ({ ...d, status: 'pending' as const }))
    expect(expiredPendingDoses(raw, now)).toHaveLength(1)
    expect(expiredPendingDoses(raw, now)[0]?.scheduled_time).toBe('08:00')
  })
})

describe('adherenceSummary', () => {
  it('counts taken/missed over the week and computes percent', () => {
    const now = new Date()
    now.setHours(7, 0, 0, 0) // before today's 08:00 dose, so today is pending
    const today = todayISO(now)
    // 7 days of 08:00 doses; take 5, leave 2 unrecorded (past days count
    // as missed). Today has no event yet -> pending, not missed.
    const events: DoseEvent[] = []
    for (let i = 6; i >= 2; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      events.push(
        event({
          id: `e-${i}`,
          scheduled_date: todayISO(d),
          status: 'taken',
          action_at: `${todayISO(d)}T08:05:00Z`,
        }),
      )
    }
    const summary = adherenceSummary({
      medications: [med()],
      schedules: [sched()],
      events,
      days: 7,
      now,
    })
    expect(summary.totalDoses).toBe(7)
    expect(summary.taken).toBe(5)
    expect(summary.missed).toBe(1) // yesterday, unrecorded
    expect(summary.percent).toBe(71)
    expect(summary.days).toHaveLength(7)
    expect(summary.days[6]?.date).toBe(today)
  })
  it('returns 100% with no scheduled doses', () => {
    const summary = adherenceSummary({
      medications: [],
      schedules: [],
      events: [],
      days: 7,
    })
    expect(summary.percent).toBe(100)
    expect(summary.totalDoses).toBe(0)
  })
  it('counts a perfect week as a 7-day streak', () => {
    const now = new Date()
    now.setHours(12, 0, 0, 0)
    const events: DoseEvent[] = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      events.push(
        event({
          id: `e-${i}`,
          scheduled_date: todayISO(d),
          status: 'taken',
          action_at: `${todayISO(d)}T08:05:00Z`,
        }),
      )
    }
    const summary = adherenceSummary({
      medications: [med()],
      schedules: [sched()],
      events,
      days: 7,
      now,
    })
    expect(summary.currentStreakDays).toBe(7)
    expect(summary.percent).toBe(100)
  })
})

describe('detectConflicts', () => {
  it('flags an exact duplicate (same name + strength)', () => {
    const warnings = detectConflicts({
      candidate: { name: 'Amlodipine', strength: '5 mg', times: ['09:00'] },
      existingMedications: [med()],
      existingSchedules: [sched()],
    })
    expect(warnings.some((w) => w.kind === 'duplicate')).toBe(true)
  })
  it('flags the same name with a different strength', () => {
    const warnings = detectConflicts({
      candidate: { name: 'amlodipine', strength: '10 mg', times: ['09:00'] },
      existingMedications: [med()],
      existingSchedules: [sched()],
    })
    expect(warnings.some((w) => w.messageKey === 'meds.conflictSameName')).toBe(true)
  })
  it('flags the exact same scheduled time', () => {
    const warnings = detectConflicts({
      candidate: { name: 'Metformin', strength: '500 mg', times: ['08:00'] },
      existingMedications: [med()],
      existingSchedules: [sched()],
    })
    expect(warnings.some((w) => w.kind === 'same_time')).toBe(true)
  })
  it('flags times within 15 minutes', () => {
    const warnings = detectConflicts({
      candidate: { name: 'Metformin', strength: '500 mg', times: ['08:10'] },
      existingMedications: [med()],
      existingSchedules: [sched()],
    })
    expect(warnings.some((w) => w.kind === 'overlap')).toBe(true)
  })
  it('is silent for a clearly different medicine at a different time', () => {
    const warnings = detectConflicts({
      candidate: { name: 'Metformin', strength: '500 mg', times: ['20:00'] },
      existingMedications: [med()],
      existingSchedules: [sched()],
    })
    expect(warnings).toHaveLength(0)
  })
  it('ignores the medicine being edited', () => {
    const warnings = detectConflicts({
      candidate: {
        name: 'Amlodipine',
        strength: '5 mg',
        times: ['08:00'],
        excludeMedicationId: 'med-1',
      },
      existingMedications: [med()],
      existingSchedules: [sched()],
    })
    expect(warnings).toHaveLength(0)
  })
})
