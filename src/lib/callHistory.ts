/* Call-history joining (pure functions, used by the Supabase
 * provider). The provider fetches raw rows; this module joins attempts
 * to their responses, medicines, and dose status so the history
 * entries are built in exactly one place.
 *
 * Dose status resolution, in order:
 *   1. the dose event linked by the attempt's dose_event_id;
 *   2. the dose event for the same schedule on the attempt's local
 *      date/time (the scanner links attempts to doses this way);
 *   3. 'pending' when the attempt is for today and no event exists yet
 *      — the dose is still open, so the app may offer the confirm
 *      dialog from the call record;
 *   4. null otherwise (a past attempt with no dose record says nothing
 *      about the dose — the UI shows "Dose not confirmed", never a
 *      guessed status).
 *
 * All date/time handling is in the user's local timezone: scheduled_for
 * is a UTC instant, and the dose it refers to is the local day/time the
 * patient experiences. */
import type {
  CallAttempt,
  CallHistoryEntry,
  CallResponse,
} from '../types/calls'
import type { DoseEvent, DoseStatus, Medication } from '../types'
import { toISODate, toISOTime } from './time'

/** "HH:MM" in local time for an ISO instant. */
function localTimeHHMM(iso: string): string {
  return toISOTime(new Date(iso))
}

export function resolveDoseStatus(
  attempt: CallAttempt,
  doseEvents: DoseEvent[],
  today: string,
): DoseStatus | null {
  if (attempt.dose_event_id) {
    const linked = doseEvents.find((e) => e.id === attempt.dose_event_id)
    if (linked) return linked.status
  }
  const date = toISODate(new Date(attempt.scheduled_for))
  const time = localTimeHHMM(attempt.scheduled_for)
  const bySchedule = doseEvents.find(
    (e) =>
      e.schedule_id === attempt.schedule_id &&
      e.scheduled_date === date &&
      e.scheduled_time === time,
  )
  if (bySchedule) return bySchedule.status
  if (date === today) return 'pending'
  return null
}

export function buildCallHistoryEntries(input: {
  attempts: CallAttempt[]
  responses: CallResponse[]
  medications: Medication[]
  doseEvents: DoseEvent[]
  today: string
}): CallHistoryEntry[] {
  const { attempts, responses, medications, doseEvents, today } = input
  const entries: CallHistoryEntry[] = []
  const sorted = [...attempts].sort((a, b) =>
    b.scheduled_for.localeCompare(a.scheduled_for),
  )
  for (const attempt of sorted) {
    const med = medications.find((m) => m.id === attempt.medication_id)
    // The database cascades attempt rows when a medicine is deleted, so
    // a missing medicine cannot happen; skip defensively rather than
    // inventing a name — a history row must never show the wrong medicine.
    if (!med) continue
    entries.push({
      attempt,
      responses: responses
        .filter((r) => r.call_attempt_id === attempt.id)
        .sort((a, b) => a.recorded_at.localeCompare(b.recorded_at)),
      medicationName: med.name,
      medicationStrength: med.strength,
      doseAmount: med.dose_amount,
      doseStatus: resolveDoseStatus(attempt, doseEvents, today),
    })
  }
  return entries
}
