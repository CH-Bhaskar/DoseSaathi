/* Export helpers: download a CSV of dose history, a printable adherence
 * summary for a healthcare professional, or the user's full data (JSON).
 * Everything is generated locally in the browser; nothing is uploaded. */
import type {
  AdherenceSummary,
  DoseEvent,
  Medication,
  MedicationSchedule,
  Profile,
} from '../types'
import { formatTime12h } from './time'

function download(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

export function exportDoseHistoryCsv(args: {
  patient: Profile
  medications: Medication[]
  events: DoseEvent[]
}): void {
  const { patient, medications, events } = args
  const medById = new Map(medications.map((m) => [m.id, m]))
  const lines = [
    ['Date', 'Time', 'Medicine', 'Strength', 'Status', 'Note'].map(csvCell).join(','),
  ]
  const sorted = [...events].sort(
    (a, b) =>
      b.scheduled_date.localeCompare(a.scheduled_date) ||
      b.scheduled_time.localeCompare(a.scheduled_time),
  )
  for (const e of sorted) {
    const med = medById.get(e.medication_id)
    lines.push(
      [
        e.scheduled_date,
        e.scheduled_time,
        med?.name ?? '',
        med?.strength ?? '',
        e.status,
        e.note ?? '',
      ]
        .map(csvCell)
        .join(','),
    )
  }
  download(
    `dosesathi-history-${patient.full_name.replace(/\s+/g, '-').toLowerCase()}.csv`,
    lines.join('\n'),
    'text/csv',
  )
}

export function exportAdherenceSummary(args: {
  patient: Profile
  medications: Medication[]
  schedules: MedicationSchedule[]
  summary: AdherenceSummary
}): void {
  const { patient, medications, schedules, summary } = args
  const lines: string[] = []
  lines.push('DoseSaathi — Medication & Adherence Summary')
  lines.push(`Patient: ${patient.full_name}`)
  lines.push(`Generated: ${new Date().toLocaleString()}`)
  lines.push('')
  lines.push('Current medicines:')
  for (const med of medications.filter((m) => m.status === 'active')) {
    const times = schedules
      .filter((s) => s.medication_id === med.id)
      .map((s) => formatTime12h(s.time_of_day))
      .join(', ')
    lines.push(
      `- ${med.name} ${med.strength} — ${med.dose_amount}, ${times}. ${med.instructions}`,
    )
  }
  lines.push('')
  lines.push(
    `Adherence, last 7 days: ${summary.percent}% (${summary.taken} of ${summary.totalDoses} doses taken, ${summary.missed} missed, ${summary.skipped} skipped).`,
  )
  lines.push('Daily breakdown:')
  for (const d of summary.days) {
    lines.push(
      `  ${d.date}: ${d.taken}/${d.total} taken (${d.percent}%)`,
    )
  }
  lines.push('')
  lines.push(
    'This summary was prepared by the patient for discussion with a healthcare professional. DoseSaathi does not provide medical advice.',
  )
  download(
    `dosesathi-summary-${patient.full_name.replace(/\s+/g, '-').toLowerCase()}.txt`,
    lines.join('\n'),
    'text/plain',
  )
}

export function exportUserData(args: {
  patient: Profile
  medications: Medication[]
  schedules: MedicationSchedule[]
  events: DoseEvent[]
}): void {
  const { patient } = args
  download(
    `dosesathi-my-data-${patient.full_name.replace(/\s+/g, '-').toLowerCase()}.json`,
    JSON.stringify(
      {
        exported_at: new Date().toISOString(),
        patient: args.patient,
        medications: args.medications,
        schedules: args.schedules,
        dose_events: args.events,
      },
      null,
      2,
    ),
    'application/json',
  )
}
