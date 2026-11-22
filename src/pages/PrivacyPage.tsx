import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Download, ShieldCheck, UserX } from 'lucide-react'
import ConfirmDialog from '../components/ConfirmDialog'
import { usePatientData } from '../hooks/useDoses'
import { exportUserData } from '../lib/export'
import { useAppStore } from '../store/appStore'

export default function PrivacyPage() {
  const { t } = useTranslation()
  const profile = useAppStore((s) => s.profile)
  const snapshot = useAppStore((s) => s.snapshot)
  const revokeAllAccess = useAppStore((s) => s.revokeAllAccess)
  const setToast = useAppStore((s) => s.setToast)
  const [revokeOpen, setRevokeOpen] = useState(false)
  const { medications, schedules, doseEvents } = usePatientData(profile?.id ?? null)

  if (!profile || !snapshot) return null

  const activeCaregivers = snapshot.caregiverConnections.filter(
    (c) => c.patient_id === profile.id && c.status === 'active',
  )
  const activeHcp = snapshot.healthcareConnections.filter(
    (c) => c.patient_id === profile.id && c.status === 'active',
  )
  const anyoneHasAccess = activeCaregivers.length + activeHcp.length > 0

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">{t('privacy.title')}</h1>
        <p className="mt-1 text-base text-slate-600">{t('privacy.subtitle')}</p>
      </div>

      <div className="card">
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">
          <ShieldCheck size={24} className="text-brand-700" aria-hidden="true" />
          {t('privacy.consentTitle')}
        </h2>
        <p className="mt-2 text-base text-slate-700">{t('privacy.consentText')}</p>
        <p className="mt-2 text-base text-slate-700">{t('privacy.rlsNote')}</p>
      </div>

      <div className="card">
        <h2 className="text-xl font-bold text-slate-900">{t('privacy.connectionsTitle')}</h2>
        {!anyoneHasAccess ? (
          <p className="mt-2 text-base text-slate-600">{t('privacy.noAccess')}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {activeCaregivers.map((c) => (
              <li key={c.id} className="text-base text-slate-800">
                {c.caregiver_name ?? c.invited_email} — {t('auth.roleCaregiver')}
              </li>
            ))}
            {activeHcp.map((c) => (
              <li key={c.id} className="text-base text-slate-800">
                {c.professional_name ?? c.invited_email} — {t('auth.roleHcp')}
              </li>
            ))}
          </ul>
        )}
        {anyoneHasAccess ? (
          <button
            type="button"
            className="btn-danger mt-4"
            onClick={() => setRevokeOpen(true)}
          >
            <UserX size={20} aria-hidden="true" />
            {t('privacy.revokeAll')}
          </button>
        ) : null}
      </div>

      <div className="card">
        <h2 className="text-xl font-bold text-slate-900">{t('privacy.dataTitle')}</h2>
        <p className="mt-2 text-base text-slate-700">{t('privacy.whatWeStore')}</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              exportUserData({ patient: profile, medications, schedules, events: doseEvents })
              setToast(t('privacy.exportData'))
            }}
          >
            <Download size={20} aria-hidden="true" />
            {t('privacy.exportData')}
          </button>
          <p className="w-full text-sm text-slate-500">{t('privacy.exportDataHint')}</p>
        </div>
      </div>

      <ConfirmDialog
        open={revokeOpen}
        title={t('privacy.revokeAllConfirmTitle')}
        text={t('privacy.revokeAllConfirmText')}
        danger
        confirmLabel={t('privacy.revokeAll')}
        onConfirm={() => {
          setRevokeOpen(false)
          void revokeAllAccess()
        }}
        onCancel={() => setRevokeOpen(false)}
      />
    </div>
  )
}
