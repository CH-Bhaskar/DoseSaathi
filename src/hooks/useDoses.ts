/* Shared dose hooks: a ticking clock, today's doses for a patient, and
 * the due-dose reminder trigger. */
import { useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_GRACE_MINUTES,
  dosesForDate,
  dueNow,
} from '../lib/doseLogic'
import { todayISO } from '../lib/time'
import { useAppStore } from '../store/appStore'
import type { DayDose, Medication, MedicationSchedule, DoseEvent } from '../types'

/** A Date that re-renders every `intervalMs` (default 30s). */
export function useNow(intervalMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
  return now
}

export interface PatientData {
  medications: Medication[]
  schedules: MedicationSchedule[]
  doseEvents: DoseEvent[]
  graceMinutes: number
}

/** All data belonging to one patient, from the snapshot. */
export function usePatientData(patientId: string | null): PatientData {
  const snapshot = useAppStore((s) => s.snapshot)
  return useMemo(() => {
    if (!snapshot || !patientId) {
      return {
        medications: [],
        schedules: [],
        doseEvents: [],
        graceMinutes: DEFAULT_GRACE_MINUTES,
      }
    }
    const medications = snapshot.medications.filter(
      (m) => m.patient_id === patientId,
    )
    const medIds = new Set(medications.map((m) => m.id))
    const schedules = snapshot.schedules.filter((s) =>
      medIds.has(s.medication_id),
    )
    const doseEvents = snapshot.doseEvents.filter(
      (e) => e.patient_id === patientId,
    )
    const prefs = snapshot.preferences.find((p) => p.user_id === patientId)
    return {
      medications,
      schedules,
      doseEvents,
      graceMinutes: prefs?.grace_period_minutes ?? DEFAULT_GRACE_MINUTES,
    }
  }, [snapshot, patientId])
}

/** Today's doses for a patient, recomputed as time passes. */
export function useTodayDoses(patientId: string | null): {
  doses: DayDose[]
  now: Date
} {
  const now = useNow()
  const { medications, schedules, doseEvents, graceMinutes } =
    usePatientData(patientId)
  const doses = useMemo(() => {
    if (!patientId) return []
    return dosesForDate({
      medications,
      schedules,
      events: doseEvents,
      dateISO: todayISO(now),
      now,
      graceMinutes,
    })
  }, [patientId, medications, schedules, doseEvents, now, graceMinutes])
  return { doses, now }
}

/** The dose to show in the reminder dialog: the earliest due dose the
 * user has not dismissed this session. Patient role only. */
export function useDueReminder(patientId: string | null): DayDose | null {
  const { doses, now } = useTodayDoses(patientId)
  const reminderDismissed = useAppStore((s) => s.reminderDismissed)
  return useMemo(() => {
    if (!patientId) return null
    const due = dueNow(doses, now)
    const notDismissed = due.filter((d) => !reminderDismissed[d.key])
    return notDismissed.length > 0 ? (notDismissed[0] ?? null) : null
  }, [doses, now, reminderDismissed, patientId])
}
