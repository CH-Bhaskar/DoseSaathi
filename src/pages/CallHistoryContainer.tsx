/* Call-history wiring: loads the patient's call records from the
 * provider and maps the confirm dialog's three actions onto dose
 * records.
 *   - Confirm taken  -> recordDose taken, source 'call', linked to
 *     the attempt — the same source the keypad handler writes.
 *   - Remind later   -> snooze 15 minutes (the same delay the call
 *     webhook uses for a Press-2 remind-later).
 *   - Need help      -> flagCallHelp: escalation_status 'pending'
 *     (via the 008 RPC). The caregiver alert itself is still
 *     consent-gated server-side.
 *
 * callsConfigured (lib/callPrefs) is false until Supabase is
 * configured and the deployer sets VITE_TWILIO_CONFIGURED=true (see
 * .env.example). The browser cannot detect the server-side Twilio
 * secrets, so this explicit flag is the honest signal — the app never
 * guesses that calls work. */
import { useCallback, useEffect, useState } from 'react'
import { callsConfigured } from '../lib/callPrefs'
import { toISODate, toISOTime } from '../lib/time'
import type { DoseRecordInput } from '../services/provider'
import { useAppStore } from '../store/appStore'
import type { CallAttempt, CallHistoryEntry } from '../types/calls'
import CallHistoryPage from './CallHistoryPage'

/** Minutes to wait before reminding again after "Remind me later". */
const REMIND_LATER_MINUTES = 15

export default function CallHistoryContainer() {
  const profile = useAppStore((s) => s.profile)
  const online = useAppStore((s) => s.online)
  const fetchCallHistory = useAppStore((s) => s.fetchCallHistory)
  const recordDose = useAppStore((s) => s.recordDose)
  const snoozeDose = useAppStore((s) => s.snoozeDose)
  const flagCallHelp = useAppStore((s) => s.flagCallHelp)
  const [entries, setEntries] = useState<CallHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!profile) return
    setLoading(true)
    setError(null)
    try {
      setEntries(await fetchCallHistory(profile.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'error.generic')
    } finally {
      setLoading(false)
    }
  }, [profile, fetchCallHistory])

  useEffect(() => {
    void load()
  }, [load])

  function doseInputFor(attempt: CallAttempt): DoseRecordInput {
    const at = new Date(attempt.scheduled_for)
    return {
      schedule_id: attempt.schedule_id,
      patient_id: attempt.patient_id,
      medication_id: attempt.medication_id,
      scheduled_date: toISODate(at),
      scheduled_time: toISOTime(at),
      status: 'taken',
    }
  }

  async function handleConfirm(attempt: CallAttempt) {
    await recordDose({
      ...doseInputFor(attempt),
      status: 'taken',
      source: 'call',
      call_attempt_id: attempt.id,
    })
    await load()
  }

  async function handleRemindLater(attempt: CallAttempt) {
    await snoozeDose(
      { ...doseInputFor(attempt), status: 'pending' },
      REMIND_LATER_MINUTES,
    )
    await load()
  }

  async function handleNeedHelp(attempt: CallAttempt) {
    await flagCallHelp(attempt.id)
    await load()
  }

  if (!profile) return null
  return (
    <CallHistoryPage
      entries={entries}
      loading={loading}
      error={error}
      callsConfigured={callsConfigured()}
      isOffline={!online}
      onRefresh={() => void load()}
      onConfirmDose={handleConfirm}
      onRemindLater={handleRemindLater}
      onNeedHelp={handleNeedHelp}
    />
  )
}
