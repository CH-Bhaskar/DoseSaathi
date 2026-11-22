import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { CalendarClock, Volume2 } from 'lucide-react'
import { countdownFor } from '../lib/doseLogic'
import { speak, speechSupported } from '../lib/speech'
import { formatTime12h, hourFloatFromDate, hourFloatFromTime } from '../lib/time'
import { useAppStore } from '../store/appStore'
import type { DayDose } from '../types'
import DoseActions from './DoseActions'

export default function NextDoseCard({
  dose,
  now,
}: {
  dose: DayDose | null
  now: Date
}) {
  const { t } = useTranslation()
  const language = useAppStore((s) => s.language)

  if (!dose) {
    return (
      <div className="card">
        <h2 className="text-lg font-bold text-slate-900">
          {t('dashboard.nextDose')}
        </h2>
        <p className="mt-2 text-base text-slate-600">
          {t('dashboard.allCaughtUp')}
        </p>
        <Link to="/schedule" className="btn-secondary mt-4">
          <CalendarClock size={20} aria-hidden="true" />
          {t('dashboard.viewSchedule')}
        </Link>
      </div>
    )
  }

  const countdown = countdownFor({
    scheduledHour: hourFloatFromTime(dose.scheduled_time),
    nowHour: hourFloatFromDate(now),
  })
  const countdownText =
    countdown.kind === 'due-in'
      ? t('common.dueIn', { minutes: countdown.minutes })
      : countdown.kind === 'misses-in'
        ? t('common.missesIn', { minutes: countdown.minutes })
        : t('common.overdue')

  return (
    <div className="card border-2 border-brand-200 bg-brand-50/50">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-brand-800">
            {t('dashboard.nextDose')} · {formatTime12h(dose.scheduled_time)}
          </p>
          <h2 className="mt-1 text-2xl font-bold text-slate-900">
            {dose.medication_name} {dose.strength}
          </h2>
          <p className="mt-1 text-base text-slate-700">
            {dose.dose_amount} — {dose.instructions}
          </p>
          <p className="mt-2 text-base font-semibold text-brand-800">
            {countdownText}
          </p>
        </div>
        {speechSupported() ? (
          <button
            type="button"
            className="btn-ghost !min-h-11 !px-3"
            aria-label={t('dashboard.listenToNext')}
            onClick={() =>
              speak(
                `${dose.medication_name} ${dose.strength}, ${dose.dose_amount}, ${formatTime12h(dose.scheduled_time)}. ${dose.instructions}`,
                language,
              )
            }
          >
            <Volume2 size={22} aria-hidden="true" />
          </button>
        ) : null}
      </div>
      <div className="mt-4">
        <DoseActions dose={dose} large />
      </div>
    </div>
  )
}
