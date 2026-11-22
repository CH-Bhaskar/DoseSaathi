import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, FileText } from 'lucide-react'
import DoseStatusBadge from '../components/DoseStatusBadge'
import EmptyState from '../components/EmptyState'
import { usePatientData } from '../hooks/useDoses'
import { adherenceSummary } from '../lib/doseLogic'
import { exportAdherenceSummary, exportDoseHistoryCsv } from '../lib/export'
import { formatDateLong, formatTime12h, todayISO } from '../lib/time'
import { useAppStore } from '../store/appStore'
import type { DoseStatus } from '../types'

const FILTERS: ('all' | DoseStatus)[] = ['all', 'taken', 'missed', 'skipped', 'pending']

export default function HistoryPage() {
  const { t } = useTranslation()
  const profile = useAppStore((s) => s.profile)
  const [filter, setFilter] = useState<'all' | DoseStatus>('all')
  const { medications, schedules, doseEvents, graceMinutes } = usePatientData(
    profile?.id ?? null,
  )

  const grouped = useMemo(() => {
    const filtered =
      filter === 'all'
        ? doseEvents
        : doseEvents.filter((e) => e.status === filter)
    const sorted = [...filtered].sort(
      (a, b) =>
        b.scheduled_date.localeCompare(a.scheduled_date) ||
        b.scheduled_time.localeCompare(a.scheduled_time),
    )
    const map = new Map<string, typeof sorted>()
    for (const e of sorted) {
      const list = map.get(e.scheduled_date) ?? []
      list.push(e)
      map.set(e.scheduled_date, list)
    }
    return [...map.entries()]
  }, [doseEvents, filter])

  if (!profile) return null
  const medById = new Map(medications.map((m) => [m.id, m]))
  const today = todayISO()

  function exportSummary() {
    const summary = adherenceSummary({
      medications,
      schedules,
      events: doseEvents,
      days: 7,
      graceMinutes,
    })
    exportAdherenceSummary({ patient: profile!, medications, schedules, summary })
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{t('history.title')}</h1>
          <p className="mt-1 text-base text-slate-600">{t('history.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-secondary"
            onClick={() =>
              exportDoseHistoryCsv({ patient: profile, medications, events: doseEvents })
            }
          >
            <Download size={20} aria-hidden="true" />
            {t('history.exportCsv')}
          </button>
          <button type="button" className="btn-secondary" onClick={exportSummary}>
            <FileText size={20} aria-hidden="true" />
            {t('history.exportSummary')}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label={t('history.title')}>
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className={`min-h-11 rounded-full border-2 px-4 py-2 text-base font-semibold ${
              filter === f
                ? 'border-brand-700 bg-brand-700 text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:border-brand-600'
            }`}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
          >
            {f === 'all' ? t('history.filterAll') : t(`common.${f}`)}
          </button>
        ))}
      </div>

      {grouped.length === 0 ? (
        <EmptyState title={t('history.noHistory')} text={t('history.noHistoryText')} />
      ) : (
        grouped.map(([date, events]) => (
          <section key={date} aria-label={formatDateLong(date)}>
            <h2 className="mb-3 text-xl font-bold text-slate-900">
              {date === today ? t('history.groupToday') : formatDateLong(date)}
            </h2>
            <ul className="card divide-y divide-slate-100 !p-0">
              {events.map((e) => {
                const med = medById.get(e.medication_id)
                return (
                  <li key={e.id} className="flex items-center justify-between gap-3 px-5 py-4">
                    <div>
                      <p className="text-base font-semibold text-slate-900">
                        {formatTime12h(e.scheduled_time)} — {med?.name ?? ''}{' '}
                        {med?.strength ?? ''}
                      </p>
                      <p className="text-sm text-slate-500">
                        {med?.dose_amount ?? ''}
                        {e.action_at
                          ? ` · ${t('history.recordedAt', { date: new Date(e.action_at).toLocaleString() })}`
                          : ''}
                      </p>
                      {e.note ? (
                        <p className="mt-1 text-base italic text-slate-600">
                          {t('history.noteLabel')}: {e.note}
                        </p>
                      ) : null}
                    </div>
                    <DoseStatusBadge status={e.status} />
                  </li>
                )
              })}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
