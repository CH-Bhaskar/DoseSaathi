import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { CalendarDays, Pill, Plus, TriangleAlert } from 'lucide-react'
import CaregiverStatusCard from '../components/CaregiverStatusCard'
import DoseStatusBadge from '../components/DoseStatusBadge'
import NextDoseCard from '../components/NextDoseCard'
import ProgressCard from '../components/ProgressCard'
import { usePatientData, useTodayDoses } from '../hooks/useDoses'
import { adherenceSummary, nextDose } from '../lib/doseLogic'
import { formatDateLong, formatTime12h } from '../lib/time'
import { useAppStore } from '../store/appStore'

export default function PatientDashboard() {
  const { t } = useTranslation()
  const profile = useAppStore((s) => s.profile)
  const snapshot = useAppStore((s) => s.snapshot)
  const patientId = profile?.id ?? null
  const { doses, now } = useTodayDoses(patientId)
  const { medications, schedules, doseEvents, graceMinutes } = usePatientData(patientId)

  if (!profile || !snapshot) return null

  const hour = now.getHours()
  const greeting =
    hour < 12
      ? t('dashboard.greetingMorning')
      : hour < 17
        ? t('dashboard.greetingAfternoon')
        : t('dashboard.greetingEvening')

  const taken = doses.filter((d) => d.status === 'taken').length
  const missed = doses.filter((d) => d.status === 'missed')
  const pending = doses.filter((d) => d.status === 'pending')
  const next = nextDose(doses)
  const summary = adherenceSummary({
    medications,
    schedules,
    events: doseEvents,
    days: 7,
    now,
    graceMinutes,
  })
  const connections = snapshot.caregiverConnections.filter(
    (c) => c.patient_id === profile.id,
  )

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">
          {greeting}, {profile.full_name}
        </h1>
        <p className="mt-1 text-lg text-slate-600">
          {formatDateLong(
            `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
          )}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="flex flex-col gap-5 lg:col-span-2">
          <NextDoseCard dose={next} now={now} />
          <ProgressCard taken={taken} total={doses.length} />

          {missed.length > 0 ? (
            <div className="card border-2 border-red-200 bg-red-50/50">
              <h2 className="flex items-center gap-2 text-lg font-bold text-red-900">
                <TriangleAlert size={22} aria-hidden="true" />
                {t('dashboard.missedDoses', { count: missed.length })}
              </h2>
              <ul className="mt-3 space-y-2">
                {missed.map((d) => (
                  <li key={d.key} className="flex items-center justify-between gap-3 text-base text-slate-800">
                    <span>
                      {d.medication_name} {d.strength} — {formatTime12h(d.scheduled_time)}
                    </span>
                    <DoseStatusBadge status="missed" />
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-base text-slate-700">
                {t('dashboard.missedDoseHelp')}
              </p>
            </div>
          ) : null}

          <div className="card">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-slate-900">
                {t('dashboard.remainingDoses', { count: pending.length })}
              </h2>
              <Link to="/schedule" className="btn-ghost !min-h-10 !px-3">
                <CalendarDays size={20} aria-hidden="true" />
                {t('dashboard.viewSchedule')}
              </Link>
            </div>
            {pending.length === 0 ? (
              <p className="mt-2 text-base text-slate-600">
                {t('dashboard.allCaughtUp')}
              </p>
            ) : (
              <ul className="mt-3 space-y-3">
                {pending.slice(0, 4).map((d) => (
                  <li key={d.key} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                    <span className="text-base text-slate-800">
                      <span className="font-semibold">{formatTime12h(d.scheduled_time)}</span>{' '}
                      — {d.medication_name} {d.strength} ({d.dose_amount})
                    </span>
                    <DoseStatusBadge status="pending" />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <div className="card">
            <h2 className="text-lg font-bold text-slate-900">
              {t('dashboard.weeklySummary')}
            </h2>
            <p className="mt-2 text-3xl font-bold text-brand-700">
              {summary.percent}%
            </p>
            <p className="mt-1 text-base text-slate-600">
              {t('dashboard.adherenceThisWeek')} ·{' '}
              {t('dashboard.streak', { count: summary.currentStreakDays })}
            </p>
            <div className="mt-4 flex h-16 items-end gap-1.5" aria-hidden="true">
              {summary.days.map((d) => (
                <div
                  key={d.date}
                  className="flex-1 rounded-t-md bg-brand-200"
                  // Days with no scheduled doses stay short: 100% there
                  // means "nothing was due", not a perfect day.
                  style={{ height: d.total === 0 ? '8%' : `${Math.max(d.percent, 8)}%` }}
                  title={`${d.label}: ${d.total === 0 ? t('schedule.noDoses') : `${d.percent}%`}`}
                />
              ))}
            </div>
            <Link to="/analytics" className="btn-secondary mt-4 w-full">
              {t('common.viewAll')}
            </Link>
          </div>

          <CaregiverStatusCard connections={connections} />

          <div className="card">
            <h2 className="text-lg font-bold text-slate-900">
              {t('nav.medications')}
            </h2>
            <p className="mt-1 text-base text-slate-600">
              {medications.filter((m) => m.status === 'active').length} active
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Link to="/medications/new" className="btn-primary w-full">
                <Plus size={20} aria-hidden="true" />
                {t('dashboard.addMedication')}
              </Link>
              <Link to="/medications" className="btn-secondary w-full">
                <Pill size={20} aria-hidden="true" />
                {t('common.viewAll')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
