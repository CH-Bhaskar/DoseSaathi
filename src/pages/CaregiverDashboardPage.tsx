/* Caregiver dashboard: the patients who granted access, their doses
 * today (due / taken / missed / unconfirmed), adherence summaries, and
 * missed-dose alerts. Read-only: caregivers never edit a schedule. */
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { AlertTriangle, Bell, CheckCircle2, Eye } from 'lucide-react'
import EmptyState from '../components/EmptyState'
import { useNow, usePatientData } from '../hooks/useDoses'
import { adherenceSummary, dosesForDate } from '../lib/doseLogic'
import { todayISO } from '../lib/time'
import { useAppStore } from '../store/appStore'

function PatientCard({ patientId }: { patientId: string }) {
  const { t } = useTranslation()
  const now = useNow()
  const profile = useAppStore((s) =>
    s.snapshot?.profiles.find((p) => p.id === patientId),
  )
  const { medications, schedules, doseEvents, graceMinutes } =
    usePatientData(patientId)
  const doses = dosesForDate({
    medications,
    schedules,
    events: doseEvents,
    dateISO: todayISO(now),
    now,
    graceMinutes,
  })
  const summary = adherenceSummary({
    medications,
    schedules,
    events: doseEvents,
    days: 7,
    now,
    graceMinutes,
  })
  const taken = doses.filter((d) => d.status === 'taken').length
  const missed = doses.filter((d) => d.status === 'missed').length
  const pending = doses.filter((d) => d.status === 'pending').length
  const dueNowCount = doses.filter(
    (d) => d.status === 'pending' && d.hour <= now.getHours() + now.getMinutes() / 60,
  ).length

  if (!profile) return null
  return (
    <article className="card" data-testid={`caregiver-patient-${patientId}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{profile.full_name}</h2>
          <p className="text-base text-slate-600">
            {t('caregiver.patientAdherence')}: <span className="font-bold text-brand-700">{summary.percent}%</span>
          </p>
        </div>
        <Link to={`/patients/${patientId}`} className="btn-secondary !min-h-10 !py-2">
          <Eye size={18} aria-hidden="true" />
          {t('caregiver.viewPatient')}
        </Link>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label={t('caregiver.dueDoses')} value={dueNowCount} />
        <MiniStat label={t('caregiver.takenDoses')} value={taken} tone="green" />
        <MiniStat label={t('caregiver.missedDoses')} value={missed} tone="red" />
        <MiniStat label={t('caregiver.unconfirmedDoses')} value={pending} tone="amber" />
      </div>
    </article>
  )
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'green' | 'red' | 'amber'
}) {
  const color =
    tone === 'green'
      ? 'text-green-700'
      : tone === 'red'
        ? 'text-red-700'
        : tone === 'amber'
          ? 'text-amber-700'
          : 'text-slate-900'
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2 text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-sm text-slate-600">{label}</p>
    </div>
  )
}

export default function CaregiverDashboardPage() {
  const { t } = useTranslation()
  const profile = useAppStore((s) => s.profile)
  const snapshot = useAppStore((s) => s.snapshot)
  const alertsForMe = useAppStore((s) => s.alertsForMe)
  const markAlertRead = useAppStore((s) => s.markAlertRead)
  const updateCaregiverConnection = useAppStore((s) => s.updateCaregiverConnection)

  if (!profile || !snapshot) return null

  const activeConnections = snapshot.caregiverConnections.filter(
    (c) => c.caregiver_id === profile.id && c.status === 'active',
  )
  const pendingInvites = snapshot.caregiverConnections.filter(
    (c) =>
      c.status === 'pending' &&
      (c.caregiver_id === profile.id ||
        c.invited_email.toLowerCase() === profile.email.toLowerCase()),
  )
  const alerts = alertsForMe()
  const unread = alerts.filter((a) => !a.read)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">{t('caregiver.dashboardTitle')}</h1>
        <p className="mt-1 text-base text-slate-600">{t('caregiver.dashboardSubtitle')}</p>
        <p className="mt-2 text-base text-slate-600">{t('caregiver.cannotEditNote')}</p>
      </div>

      {pendingInvites.length > 0 ? (
        <div className="card border-2 border-amber-300 bg-amber-50">
          <h2 className="text-lg font-bold text-amber-900">{t('caregiver.invitePendingNote')}</h2>
          <ul className="mt-3 space-y-3">
            {pendingInvites.map((c) => {
              const patient = snapshot.profiles.find((p) => p.id === c.patient_id)
              return (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3">
                  <span className="text-base font-semibold text-slate-900">
                    {patient?.full_name ?? c.patient_id}
                  </span>
                  <span className="flex gap-2">
                    <button
                      type="button"
                      className="btn-primary !min-h-10 !py-2"
                      onClick={() => void updateCaregiverConnection(c.id, 'active')}
                    >
                      <CheckCircle2 size={18} aria-hidden="true" />
                      {t('caregiver.accept')}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary !min-h-10 !py-2"
                      onClick={() => void updateCaregiverConnection(c.id, 'revoked')}
                    >
                      {t('caregiver.decline')}
                    </button>
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}

      <div className="card">
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">
          <Bell size={22} className="text-brand-700" aria-hidden="true" />
          {t('caregiver.alertsTitle')}
          {unread.length > 0 ? (
            <span className="badge bg-red-100 text-red-900">{unread.length}</span>
          ) : null}
        </h2>
        {alerts.length === 0 ? (
          <p className="mt-3 text-base text-slate-600">{t('caregiver.noAlerts')}</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {alerts.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-3 py-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle size={20} className="mt-0.5 shrink-0 text-red-700" aria-hidden="true" />
                  <div>
                    <p className="text-base font-semibold text-slate-900">{a.patient_name}</p>
                    <p className="text-base text-slate-700">{a.message}</p>
                    <p className="text-sm text-slate-500">
                      {new Date(a.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                {!a.read ? (
                  <button
                    type="button"
                    className="btn-ghost !min-h-10 !px-3"
                    onClick={() => markAlertRead(a.id)}
                    data-testid={`alert-read-${a.id}`}
                  >
                    {t('common.confirm')}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h2 className="mb-3 text-xl font-bold text-slate-900">{t('caregiver.patients')}</h2>
        {activeConnections.length === 0 ? (
          <EmptyState title={t('caregiver.noPatients')} text={t('caregiver.noPatientsText')} />
        ) : (
          <div className="flex flex-col gap-4">
            {activeConnections.map((c) => (
              <PatientCard key={c.id} patientId={c.patient_id} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
