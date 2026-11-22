import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { HeartHandshake, UserPlus } from 'lucide-react'
import type { CaregiverConnection } from '../types'

export default function CaregiverStatusCard({
  connections,
}: {
  connections: CaregiverConnection[]
}) {
  const { t } = useTranslation()
  const active = connections.filter((c) => c.status === 'active')
  const pending = connections.filter((c) => c.status === 'pending')
  return (
    <div className="card">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <HeartHandshake size={24} aria-hidden="true" />
        </span>
        <h2 className="text-lg font-bold text-slate-900">
          {t('dashboard.caregiverStatus')}
        </h2>
      </div>
      {active.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {active.map((c) => (
            <li key={c.id} className="text-base text-slate-700">
              <span className="font-semibold">
                {c.caregiver_name ?? c.invited_email}
              </span>{' '}
              — {t('caregiver.statusActive')}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-base text-slate-600">
          {t('caregiver.noConnections')}
        </p>
      )}
      {pending.length > 0 ? (
        <p className="mt-2 text-base text-amber-800">
          {pending.length} {t('caregiver.statusPending').toLowerCase()}
        </p>
      ) : null}
      <Link to="/caregiver" className="btn-secondary mt-4 w-full">
        <UserPlus size={20} aria-hidden="true" />
        {t('caregiver.inviteTitle')}
      </Link>
    </div>
  )
}
