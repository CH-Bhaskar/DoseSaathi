import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { CheckCircle2, Eye, Stethoscope } from 'lucide-react'
import EmptyState from '../components/EmptyState'
import { useAppStore } from '../store/appStore'

export default function HealthcarePage() {
  const { t } = useTranslation()
  const profile = useAppStore((s) => s.profile)
  const snapshot = useAppStore((s) => s.snapshot)
  const updateHealthcareConnection = useAppStore((s) => s.updateHealthcareConnection)

  if (!profile || !snapshot) return null

  const active = snapshot.healthcareConnections.filter(
    (c) => c.professional_id === profile.id && c.status === 'active',
  )
  const pending = snapshot.healthcareConnections.filter(
    (c) =>
      c.status === 'pending' &&
      (c.professional_id === profile.id ||
        c.invited_email.toLowerCase() === profile.email.toLowerCase()),
  )

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">{t('hcp.title')}</h1>
        <p className="mt-1 max-w-2xl text-base text-slate-600">{t('hcp.subtitle')}</p>
        <p className="mt-2 max-w-2xl text-base text-slate-600">{t('hcp.grantNote')}</p>
      </div>

      {pending.length > 0 ? (
        <div className="card border-2 border-amber-300 bg-amber-50">
          <h2 className="text-lg font-bold text-amber-900">{t('caregiver.invitePendingNote')}</h2>
          <ul className="mt-3 space-y-3">
            {pending.map((c) => {
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
                      onClick={() => void updateHealthcareConnection(c.id, 'active')}
                    >
                      <CheckCircle2 size={18} aria-hidden="true" />
                      {t('caregiver.accept')}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary !min-h-10 !py-2"
                      onClick={() => void updateHealthcareConnection(c.id, 'revoked')}
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

      <div>
        <h2 className="mb-3 text-xl font-bold text-slate-900">{t('hcp.patients')}</h2>
        {active.length === 0 ? (
          <EmptyState title={t('hcp.noPatients')} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {active.map((c) => {
              const patient = snapshot.profiles.find((p) => p.id === c.patient_id)
              if (!patient) return null
              return (
                <article key={c.id} className="card">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                      <Stethoscope size={24} aria-hidden="true" />
                    </span>
                    <div>
                      <h3 className="text-xl font-bold text-slate-900">{patient.full_name}</h3>
                      <p className="text-base text-slate-600">{patient.email}</p>
                    </div>
                  </div>
                  <Link to={`/patients/${patient.id}`} className="btn-primary mt-4 w-full">
                    <Eye size={20} aria-hidden="true" />
                    {t('hcp.viewRecords')}
                  </Link>
                </article>
              )
            })}
          </div>
        )}
      </div>

      <p className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-base text-slate-700">
        {t('hcp.cannotModifyNote')}
      </p>
    </div>
  )
}
