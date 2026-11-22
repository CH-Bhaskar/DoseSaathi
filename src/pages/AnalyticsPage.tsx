import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { FileText, Flame } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useNow, usePatientData } from '../hooks/useDoses'
import { adherenceSummary } from '../lib/doseLogic'
import { exportAdherenceSummary } from '../lib/export'
import { useAppStore } from '../store/appStore'

export default function AnalyticsPage() {
  const { t } = useTranslation()
  const profile = useAppStore((s) => s.profile)
  const now = useNow()
  const { medications, schedules, doseEvents, graceMinutes } = usePatientData(
    profile?.id ?? null,
  )

  const summary = useMemo(
    () =>
      adherenceSummary({
        medications,
        schedules,
        events: doseEvents,
        days: 7,
        now,
        graceMinutes,
      }),
    [medications, schedules, doseEvents, now, graceMinutes],
  )

  if (!profile) return null

  const insight =
    summary.totalDoses === 0
      ? t('analytics.insightNoData')
      : summary.percent >= 85
        ? t('analytics.insightGood')
        : t('analytics.insightAttention')

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">{t('analytics.title')}</h1>
          <p className="mt-1 text-base text-slate-600">{t('analytics.subtitle')}</p>
        </div>
        <button
          type="button"
          className="btn-secondary"
          onClick={() =>
            exportAdherenceSummary({ patient: profile, medications, schedules, summary })
          }
        >
          <FileText size={20} aria-hidden="true" />
          {t('analytics.exportSummary')}
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t('analytics.weekAdherence')} value={`${summary.percent}%`} />
        <StatCard label={t('analytics.totalDoses')} value={String(summary.totalDoses)} />
        <StatCard label={t('analytics.takenCount')} value={String(summary.taken)} accent="green" />
        <StatCard label={t('analytics.missedCount')} value={String(summary.missed)} accent="red" />
      </div>

      <div className="card">
        <div className="flex items-center gap-2">
          <Flame size={22} className="text-amber-600" aria-hidden="true" />
          <h2 className="text-lg font-bold text-slate-900">
            {summary.currentStreakDays} {t('analytics.streakDays')}
          </h2>
        </div>
        <p className="mt-2 text-base text-slate-700">{insight}</p>
      </div>

      <div className="card">
        <h2 className="text-lg font-bold text-slate-900">{t('analytics.weekAdherence')}</h2>
        <div className="mt-4 h-72 w-full" data-testid="adherence-chart">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={summary.days} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 14 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 14 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="taken" name={t('analytics.chartTaken')} stackId="doses" fill="#0d9488" />
              <Bar dataKey="missed" name={t('analytics.chartMissed')} stackId="doses" fill="#dc2626" />
              <Bar dataKey="skipped" name={t('analytics.chartSkipped')} stackId="doses" fill="#d97706" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-3 text-sm text-slate-500">{t('analytics.shareNote')}</p>
      </div>

      <div className="card">
        <h2 className="text-lg font-bold text-slate-900">{t('analytics.weekAdherence')}</h2>
        <ul className="mt-3 divide-y divide-slate-100">
          {summary.days.map((d) => (
            <li key={d.date} className="flex items-center justify-between gap-3 py-2 text-base">
              <span className="text-slate-800">
                {d.label} · {d.date}
              </span>
              <span className="font-semibold text-slate-900">
                {d.taken}/{d.total} {t('common.taken')} ({d.percent}%)
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string
  value: string
  accent?: 'green' | 'red'
}) {
  const color =
    accent === 'green'
      ? 'text-green-700'
      : accent === 'red'
        ? 'text-red-700'
        : 'text-brand-700'
  return (
    <div className="card">
      <p className="text-base text-slate-600">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${color}`}>{value}</p>
    </div>
  )
}
