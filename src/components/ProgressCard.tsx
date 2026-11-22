import { useTranslation } from 'react-i18next'
import { CheckCircle2 } from 'lucide-react'

export default function ProgressCard({
  taken,
  total,
  title,
}: {
  taken: number
  total: number
  title?: string
}) {
  const { t } = useTranslation()
  const percent = total === 0 ? 100 : Math.round((taken / total) * 100)
  return (
    <div className="card">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-slate-900">
          {title ?? t('dashboard.todayProgress')}
        </h2>
        <span className="text-2xl font-bold text-brand-700">{percent}%</span>
      </div>
      <p className="mt-1 text-base text-slate-600">
        {t('dashboard.dosesDone', { taken, total })}
      </p>
      <div
        className="mt-4 h-4 overflow-hidden rounded-full bg-slate-200"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('dashboard.todayProgress')}
      >
        <div
          className="h-full rounded-full bg-brand-600 transition-all"
          style={{ width: `${percent}%` }}
        />
      </div>
      {total > 0 && taken === total ? (
        <p className="mt-3 flex items-center gap-2 text-base font-semibold text-green-800">
          <CheckCircle2 size={20} aria-hidden="true" />
          {t('dashboard.allCaughtUp')}
        </p>
      ) : null}
    </div>
  )
}
