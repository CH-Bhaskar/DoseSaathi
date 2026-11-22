/* Shared dose actions: mark taken / missed / skipped (with an optional
 * note for missed or skipped), and snooze. Used by the dashboard, the
 * schedule, and medication details. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BellRing, Check, Minus, X } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import type { DayDose, DoseStatus } from '../types'

export default function DoseActions({
  dose,
  large,
}: {
  dose: DayDose
  large?: boolean
}) {
  const { t } = useTranslation()
  const recordDose = useAppStore((s) => s.recordDose)
  const snoozeDose = useAppStore((s) => s.snoozeDose)
  const [noteFor, setNoteFor] = useState<DoseStatus | null>(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  if (dose.status !== 'pending') return null

  const base = {
    schedule_id: dose.schedule_id,
    patient_id: '',
    medication_id: dose.medication_id,
    scheduled_date: dose.scheduled_date,
    scheduled_time: dose.scheduled_time,
  }

  async function mark(status: DoseStatus, withNote?: string) {
    setBusy(true)
    try {
      const profile = useAppStore.getState().profile
      await recordDose({
        ...base,
        patient_id: profile?.id ?? '',
        status,
        note: withNote ?? null,
      })
      setNoteFor(null)
      setNote('')
    } finally {
      setBusy(false)
    }
  }

  async function snooze() {
    setBusy(true)
    try {
      const profile = useAppStore.getState().profile
      await snoozeDose(
        {
          ...base,
          patient_id: profile?.id ?? '',
          status: 'pending',
        },
        15,
      )
    } finally {
      setBusy(false)
    }
  }

  const btn = large ? 'btn-primary w-full !py-4 !text-lg' : 'btn-primary'
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={btn}
          disabled={busy}
          onClick={() => void mark('taken')}
          data-testid={`mark-taken-${dose.key}`}
        >
          <Check size={20} aria-hidden="true" />
          {t('common.markTaken')}
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={busy}
          onClick={() => setNoteFor(noteFor === 'missed' ? null : 'missed')}
          data-testid={`mark-missed-${dose.key}`}
        >
          <X size={20} aria-hidden="true" />
          {t('common.markMissed')}
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={busy}
          onClick={() => setNoteFor(noteFor === 'skipped' ? null : 'skipped')}
          data-testid={`mark-skipped-${dose.key}`}
        >
          <Minus size={20} aria-hidden="true" />
          {t('common.markSkipped')}
        </button>
        <button
          type="button"
          className="btn-ghost"
          disabled={busy}
          onClick={() => void snooze()}
          data-testid={`snooze-${dose.key}`}
        >
          <BellRing size={20} aria-hidden="true" />
          {t('common.snooze15')}
        </button>
      </div>
      {noteFor ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
          <label className="label" htmlFor={`note-${dose.key}`}>
            {t('common.noteOptional')}
          </label>
          <input
            id={`note-${dose.key}`}
            type="text"
            className="input"
            value={note}
            maxLength={300}
            onChange={(e) => setNote(e.target.value)}
            placeholder={
              noteFor === 'missed'
                ? t('dashboard.missedDoseHelp')
                : t('common.noteOptional')
            }
          />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="btn-primary"
              disabled={busy}
              onClick={() => void mark(noteFor, note.trim() || undefined)}
            >
              {t('common.confirm')}
            </button>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setNoteFor(null)}
            >
              {t('common.cancel')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
