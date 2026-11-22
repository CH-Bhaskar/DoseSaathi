/* doseLogic — pure functions for schedules, dose status, adherence and
 * conflict warnings. No mutation, no I/O, no dates taken from the clock
 * except through an explicit `now` argument, so tests are deterministic.
 *
 * Dose lifecycle:
 *   pending -> (grace window after the scheduled time) -> missed
 *   taken / skipped doses never change. A missed dose stays missed.
 *   A snoozed dose stays pending until its snooze time passes.
 *
 * Safety: conflict detection uses transparent, explainable rules over
 * user-entered data only. It never claims clinical safety.
 */
import type {
  AdherenceDay,
  AdherenceSummary,
  ConflictWarning,
  DayDose,
  DoseEvent,
  DoseStatus,
  Medication,
  MedicationSchedule,
} from '../types'
import {
  addDaysISO,
  formatTime12h,
  formatWeekdayShort,
  hourFloatFromDate,
  hourFloatFromTime,
  isoDayOfWeek,
  minutesBetween,
  todayISO,
} from './time'

export const DEFAULT_GRACE_MINUTES = 60
export const OVERLAP_WINDOW_MINUTES = 15

/** The live status of one dose right now. Stored taken/missed/skipped
 * never change; a pending dose flips to missed once its grace window
 * has passed (snooze extends the window). */
export function liveStatus(args: {
  scheduledHour: number
  status: DoseStatus
  nowHour: number
  graceMinutes?: number
  snoozedUntilHour?: number | null
}): DoseStatus {
  const { scheduledHour, status, nowHour, graceMinutes = DEFAULT_GRACE_MINUTES } = args
  if (status !== 'pending') return status
  const deadlineHour =
    args.snoozedUntilHour != null
      ? args.snoozedUntilHour + graceMinutes / 60
      : scheduledHour + graceMinutes / 60
  return nowHour > deadlineHour ? 'missed' : 'pending'
}

/** Countdown info for a pending dose. */
export function countdownFor(args: {
  scheduledHour: number
  nowHour: number
  graceMinutes?: number
}): { kind: 'due-in' | 'misses-in' | 'overdue'; minutes: number } {
  const { scheduledHour, nowHour, graceMinutes = DEFAULT_GRACE_MINUTES } = args
  const minutesToDue = Math.round((scheduledHour - nowHour) * 60)
  if (minutesToDue > 0) return { kind: 'due-in', minutes: minutesToDue }
  const deadline = scheduledHour + graceMinutes / 60
  const minutesToMiss = Math.round((deadline - nowHour) * 60)
  if (minutesToMiss > 0) return { kind: 'misses-in', minutes: minutesToMiss }
  return { kind: 'overdue', minutes: 0 }
}

/** Is a medication active on a given date? Respects status, start and
 * end dates. */
export function isMedicationActiveOn(med: Medication, dateISO: string): boolean {
  if (med.status !== 'active') return false
  if (dateISO < med.start_date) return false
  if (med.end_date && dateISO > med.end_date) return false
  return true
}

/** Is a schedule row due on a given date? Respects days_of_week. */
export function isScheduleDueOn(schedule: MedicationSchedule, dateISO: string): boolean {
  const days = schedule.days_of_week
  if (!days || days.length === 0 || days.length === 7) return true
  return days.includes(isoDayOfWeek(dateISO))
}

/** Build the list of doses for one day from medications, schedules and
 * recorded dose events. Sorted by time. */
export function dosesForDate(args: {
  medications: Medication[]
  schedules: MedicationSchedule[]
  events: DoseEvent[]
  dateISO: string
  now?: Date
  graceMinutes?: number
  /** When false, return stored statuses without the live grace flip.
   * The escalation job needs this: it must see stored-pending doses
   * whose grace has expired, not doses already flipped to missed. */
  live?: boolean
}): DayDose[] {
  const { medications, schedules, events, dateISO } = args
  const now = args.now ?? new Date()
  const graceMinutes = args.graceMinutes ?? DEFAULT_GRACE_MINUTES
  const live = args.live ?? true
  const isToday = dateISO === todayISO(now)
  const nowHour = hourFloatFromDate(now)
  const medById = new Map(medications.map((m) => [m.id, m]))
  const eventByKey = new Map(
    events
      .filter((e) => e.scheduled_date === dateISO)
      .map((e) => [`${e.schedule_id}|${e.scheduled_time}`, e]),
  )

  const doses: DayDose[] = []
  for (const schedule of schedules) {
    const med = medById.get(schedule.medication_id)
    if (!med) continue
    if (!isMedicationActiveOn(med, dateISO)) continue
    if (!isScheduleDueOn(schedule, dateISO)) continue
    const event = eventByKey.get(`${schedule.id}|${schedule.time_of_day}`)
    const stored: DoseStatus = event?.status ?? 'pending'
    const hour = hourFloatFromTime(schedule.time_of_day)
    // Grace expiry only applies to today; past days resolve through the
    // recorded events (the escalation job marks them missed).
    const snoozedUntilHour =
      event?.snoozed_until != null
        ? hourFloatFromDate(new Date(event.snoozed_until))
        : null
    const status =
      live && isToday && stored === 'pending'
        ? liveStatus({
            scheduledHour: hour,
            status: stored,
            nowHour,
            graceMinutes,
            snoozedUntilHour,
          })
        : stored
    doses.push({
      key: `${schedule.id}|${dateISO}`,
      schedule_id: schedule.id,
      medication_id: med.id,
      medication_name: med.name,
      brand_name: med.brand_name,
      strength: med.strength,
      form: med.form,
      dose_amount: med.dose_amount,
      instructions: med.instructions,
      food_rule: schedule.food_rule,
      scheduled_date: dateISO,
      scheduled_time: schedule.time_of_day,
      hour,
      status,
      event_id: event?.id ?? null,
      action_at: event?.action_at ?? null,
      note: event?.note ?? null,
      snoozed_until: event?.snoozed_until ?? null,
    })
  }
  doses.sort((a, b) => a.hour - b.hour)
  return doses
}

/** The next dose needing attention: the earliest pending dose (not yet
 * due, or inside its grace window). Null when nothing is pending. */
export function nextDose(doses: DayDose[]): DayDose | null {
  const pending = doses
    .filter((d) => d.status === 'pending')
    .sort((a, b) => a.hour - b.hour)
  return pending.length > 0 ? (pending[0] ?? null) : null
}

/** Doses that are due now (scheduled time reached, still pending). */
export function dueNow(doses: DayDose[], now = new Date()): DayDose[] {
  const nowHour = hourFloatFromDate(now)
  return doses.filter(
    (d) =>
      d.status === 'pending' &&
      d.hour <= nowHour &&
      (d.snoozed_until == null || new Date(d.snoozed_until).getTime() <= now.getTime()),
  )
}

/** Pending doses whose grace window has expired — the escalation job
 * should mark these missed and alert the caregiver. */
export function expiredPendingDoses(
  doses: DayDose[],
  now = new Date(),
  graceMinutes: number = DEFAULT_GRACE_MINUTES,
): DayDose[] {
  const nowHour = hourFloatFromDate(now)
  return doses.filter((d) => {
    if (d.status !== 'pending') return false
    const snoozedUntilHour =
      d.snoozed_until != null
        ? hourFloatFromDate(new Date(d.snoozed_until))
        : null
    return (
      liveStatus({
        scheduledHour: d.hour,
        status: 'pending',
        nowHour,
        graceMinutes,
        snoozedUntilHour,
      }) === 'missed'
    )
  })
}

/** Adherence summary for the last `days` days ending today. */
export function adherenceSummary(args: {
  medications: Medication[]
  schedules: MedicationSchedule[]
  events: DoseEvent[]
  days?: number
  now?: Date
  graceMinutes?: number
}): AdherenceSummary {
  const { medications, schedules, events } = args
  const days = args.days ?? 7
  const now = args.now ?? new Date()
  const graceMinutes = args.graceMinutes ?? DEFAULT_GRACE_MINUTES
  const today = todayISO(now)
  const summaryDays: AdherenceDay[] = []
  let totalDoses = 0
  let taken = 0
  let missed = 0
  let skipped = 0

  for (let i = days - 1; i >= 0; i--) {
    const dateISO = addDaysISO(today, -i)
    const doses = dosesForDate({
      medications,
      schedules,
      events,
      dateISO,
      now,
      graceMinutes,
    })
    // For past days, a dose with no recorded event counts as missed —
    // the day is over and it was never confirmed.
    const counts = { taken: 0, missed: 0, skipped: 0, pending: 0 }
    for (const d of doses) {
      if (d.status === 'taken') counts.taken++
      else if (d.status === 'skipped') counts.skipped++
      else if (d.status === 'missed') counts.missed++
      else if (dateISO === today) counts.pending++
      else counts.missed++
    }
    const total = doses.length
    const percent = total === 0 ? 100 : Math.round((counts.taken / total) * 100)
    summaryDays.push({
      date: dateISO,
      label: formatWeekdayShort(dateISO),
      taken: counts.taken,
      missed: counts.missed,
      skipped: counts.skipped,
      pending: counts.pending,
      total,
      percent,
    })
    totalDoses += total
    taken += counts.taken
    missed += counts.missed
    skipped += counts.skipped
  }

  // Current streak: consecutive days (ending today or yesterday) with
  // every scheduled dose taken and at least one dose scheduled.
  let streak = 0
  for (let i = summaryDays.length - 1; i >= 0; i--) {
    const d = summaryDays[i]
    if (!d) break
    if (d.total === 0) continue // no doses scheduled: neither breaks nor extends
    if (d.missed === 0 && d.pending === 0 && d.taken === d.total) streak++
    else break
  }

  const percent =
    totalDoses === 0 ? 100 : Math.round((taken / totalDoses) * 100)
  return {
    days: summaryDays,
    totalDoses,
    taken,
    missed,
    skipped,
    percent,
    currentStreakDays: streak,
  }
}

/** Transparent conflict checks over user-entered data. Returns warnings
 * naming the entries that triggered them. Never a clinical judgement. */
export function detectConflicts(args: {
  candidate: {
    name: string
    strength: string
    times: string[]
    excludeMedicationId?: string | null
  }
  existingMedications: Medication[]
  existingSchedules: MedicationSchedule[]
}): ConflictWarning[] {
  const { candidate, existingMedications, existingSchedules } = args
  const warnings: ConflictWarning[] = []
  const norm = (s: string) => s.trim().toLowerCase()
  const candidateName = norm(candidate.name)
  const candidateStrength = norm(candidate.strength)

  const schedulesByMed = new Map<string, MedicationSchedule[]>()
  for (const s of existingSchedules) {
    const list = schedulesByMed.get(s.medication_id) ?? []
    list.push(s)
    schedulesByMed.set(s.medication_id, list)
  }

  for (const med of existingMedications) {
    if (med.id === candidate.excludeMedicationId) continue
    if (med.status !== 'active') continue
    const sameName = norm(med.name) === candidateName
    const sameStrength = norm(med.strength) === candidateStrength
    if (sameName && sameStrength) {
      warnings.push({
        kind: 'duplicate',
        messageKey: 'meds.conflictDuplicate',
        details: `${med.name} ${med.strength}`,
      })
      continue
    }
    if (!sameName) continue
    // Same medicine name, different strength — flag it, don't decide.
    warnings.push({
      kind: 'duplicate',
      messageKey: 'meds.conflictSameName',
      details: `${med.name} ${med.strength}`,
    })
  }

  // Overlapping scheduled times with other medicines.
  for (const med of existingMedications) {
    if (med.id === candidate.excludeMedicationId) continue
    if (med.status !== 'active') continue
    const times = schedulesByMed.get(med.id) ?? []
    for (const t of candidate.times) {
      for (const s of times) {
        const gap = minutesBetween(t, s.time_of_day)
        if (gap === 0) {
          warnings.push({
            kind: 'same_time',
            messageKey: 'meds.conflictSameTime',
            details: `${med.name} ${med.strength} — ${formatTime12h(s.time_of_day)}`,
          })
        } else if (gap <= OVERLAP_WINDOW_MINUTES) {
          warnings.push({
            kind: 'overlap',
            messageKey: 'meds.conflictOverlap',
            details: `${med.name} ${med.strength} — ${formatTime12h(s.time_of_day)}`,
          })
        }
      }
    }
  }

  // De-duplicate identical warnings.
  const seen = new Set<string>()
  return warnings.filter((w) => {
    const key = `${w.kind}|${w.messageKey}|${w.details}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
