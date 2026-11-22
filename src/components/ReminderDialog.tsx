import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { BellRing, Check } from 'lucide-react'
import { formatTime12h } from '../lib/time'
import { useAppStore } from '../store/appStore'
import type { DayDose } from '../types'

/** Modal shown when a dose is due. Dismissing only hides it for this
 * session — the dose stays pending on the dashboard and schedule. */
export default function ReminderDialog({ dose }: { dose: DayDose | null }) {
  const { t } = useTranslation()
  const recordDose = useAppStore((s) => s.recordDose)
  const snoozeDose = useAppStore((s) => s.snoozeDose)
  const dismissReminder = useAppStore((s) => s.dismissReminder)
  const profile = useAppStore((s) => s.profile)
  const takeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (dose) takeRef.current?.focus()
  }, [dose])

  if (!dose || !profile) return null

  const base = {
    schedule_id: dose.schedule_id,
    patient_id: profile.id,
    medication_id: dose.medication_id,
    scheduled_date: dose.scheduled_date,
    scheduled_time: dose.scheduled_time,
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      role="alertdialog"
      aria-modal="true"
      aria-label={t('reminder.title')}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-brand-700">
            <BellRing size={26} aria-hidden="true" />
          </span>
          <h2 className="text-xl font-bold text-slate-900">
            {t('reminder.title')}
          </h2>
        </div>
        <p className="mt-3 text-lg text-slate-800">
          {t('reminder.dueText', {
            medicine: dose.medication_name,
            strength: dose.strength,
            dose: dose.dose_amount,
          })}
        </p>
        <p className="mt-1 text-base text-slate-600">
          {formatTime12h(dose.scheduled_time)} — {dose.instructions}
        </p>
        <div className="mt-6 flex flex-col gap-3">
          <button
            type="button"
            ref={takeRef}
            className="btn-primary w-full !py-4 !text-lg"
            onClick={() => {
              void recordDose({ ...base, status: 'taken' })
              dismissReminder(dose.key)
            }}
          >
            <Check size={22} aria-hidden="true" />
            {t('reminder.takeNow')}
          </button>
          <button
            type="button"
            className="btn-secondary w-full"
            onClick={() => {
              void snoozeDose({ ...base, status: 'pending' }, 15)
              dismissReminder(dose.key)
            }}
          >
            {t('reminder.snooze')}
          </button>
          <button
            type="button"
            className="btn-ghost w-full"
            onClick={() => dismissReminder(dose.key)}
          >
            {t('reminder.dismiss')}
          </button>
        </div>
      </div>
    </div>
  )
}
