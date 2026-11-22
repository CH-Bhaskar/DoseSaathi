/* Consent for voice-call reminders and caregiver escalation calls.
 * Granting and revoking both save immediately — revocation takes effect
 * at once: taking back call consent also switches calls off, and taking
 * back escalation consent also switches escalation off. The timestamp
 * records when call consent last changed. */
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { PhoneOff, ShieldCheck } from 'lucide-react'
import { defaultCallPreferences } from '../lib/callPrefs'
import { useAppStore } from '../store/appStore'
import type { CallPreferences } from '../types'
import AccessibleActionButton from './AccessibleActionButton'
import ConfirmDialog from './ConfirmDialog'

export default function ConsentSettings({
  prefs,
  userId,
  onSave,
}: {
  prefs: CallPreferences | null
  userId: string
  onSave: (prefs: CallPreferences) => Promise<void>
}) {
  const { t } = useTranslation()
  const setToast = useAppStore((s) => s.setToast)
  const profile = useAppStore((s) => s.profile)
  const appLanguage = useAppStore((s) => s.language)
  const [confirmRevoke, setConfirmRevoke] = useState<'calls' | 'escalation' | null>(null)

  const current =
    prefs ??
    defaultCallPreferences(userId, profile?.preferred_language, appLanguage)

  async function grantCalls() {
    await onSave({
      ...current,
      consent_calls: true,
      consent_calls_changed_at: new Date().toISOString(),
    })
    setToast(t('consent.grantedToast'))
  }

  async function revokeCalls() {
    setConfirmRevoke(null)
    await onSave({
      ...current,
      consent_calls: false,
      calls_enabled: false,
      consent_calls_changed_at: new Date().toISOString(),
    })
    setToast(t('consent.revokedToast'))
  }

  async function grantEscalation() {
    await onSave({ ...current, consent_escalation: true })
    setToast(t('consent.grantedToast'))
  }

  async function revokeEscalation() {
    setConfirmRevoke(null)
    await onSave({
      ...current,
      consent_escalation: false,
      escalation_enabled: false,
    })
    setToast(t('consent.revokedEscalationToast'))
  }

  return (
    <div className="flex flex-col gap-4" data-testid="consent-settings">
      <div>
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">
          <ShieldCheck size={22} className="text-brand-700" aria-hidden="true" />
          {t('consent.title')}
        </h2>
        <p className="mt-1 text-base text-slate-600">{t('consent.subtitle')}</p>
      </div>

      <div className="rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">{t('consent.callsTitle')}</h3>
            <p className="mt-1 text-base text-slate-600">{t('consent.callsText')}</p>
            <p className="mt-2 text-base font-semibold text-slate-700" role="status">
              {current.consent_calls ? t('consent.granted') : t('consent.notGranted')}
            </p>
          </div>
          {current.consent_calls ? (
            <AccessibleActionButton
              variant="danger"
              onClick={() => setConfirmRevoke('calls')}
              data-testid="consent-revoke-calls"
            >
              <PhoneOff size={18} aria-hidden="true" />
              {t('consent.revokeCalls')}
            </AccessibleActionButton>
          ) : (
            <AccessibleActionButton
              variant="primary"
              onClick={() => void grantCalls()}
              data-testid="consent-grant-calls"
            >
              {t('consent.grant')}
            </AccessibleActionButton>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-slate-900">{t('consent.escalationTitle')}</h3>
            <p className="mt-1 text-base text-slate-600">{t('consent.escalationText')}</p>
            <p className="mt-2 text-base font-semibold text-slate-700" role="status">
              {current.consent_escalation ? t('consent.granted') : t('consent.notGranted')}
            </p>
          </div>
          {current.consent_escalation ? (
            <AccessibleActionButton
              variant="danger"
              onClick={() => setConfirmRevoke('escalation')}
              data-testid="consent-revoke-escalation"
            >
              <PhoneOff size={18} aria-hidden="true" />
              {t('consent.revokeEscalation')}
            </AccessibleActionButton>
          ) : (
            <AccessibleActionButton
              variant="primary"
              onClick={() => void grantEscalation()}
              data-testid="consent-grant-escalation"
            >
              {t('consent.grant')}
            </AccessibleActionButton>
          )}
        </div>
      </div>

      <p className="text-sm text-slate-500">{t('consent.effectiveNow')}</p>

      <ConfirmDialog
        open={confirmRevoke === 'calls'}
        title={t('consent.revokeConfirmTitle')}
        text={t('consent.revokeConfirmText')}
        danger
        confirmLabel={t('consent.revoke')}
        onConfirm={() => void revokeCalls()}
        onCancel={() => setConfirmRevoke(null)}
      />
      <ConfirmDialog
        open={confirmRevoke === 'escalation'}
        title={t('consent.revokeEscalationConfirmTitle')}
        text={t('consent.revokeEscalationConfirmText')}
        danger
        confirmLabel={t('consent.revoke')}
        onConfirm={() => void revokeEscalation()}
        onCancel={() => setConfirmRevoke(null)}
      />
    </div>
  )
}
