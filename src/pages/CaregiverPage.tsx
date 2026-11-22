/* Patient-side caregiver management: invite a caregiver, see connection
 * status, revoke access, and review the notification log. */
import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Bell, HeartHandshake, Send, UserX } from 'lucide-react'
import ConfirmDialog from '../components/ConfirmDialog'
import EmptyState from '../components/EmptyState'
import { useAppStore } from '../store/appStore'
import { inviteSchema } from '../validation/medication'
import { z } from 'zod'

type InviteValues = z.infer<typeof inviteSchema>

export default function CaregiverPage() {
  const { t } = useTranslation()
  const profile = useAppStore((s) => s.profile)
  const snapshot = useAppStore((s) => s.snapshot)
  const inviteCaregiver = useAppStore((s) => s.inviteCaregiver)
  const updateCaregiverConnection = useAppStore((s) => s.updateCaregiverConnection)
  const setToast = useAppStore((s) => s.setToast)
  const [revokeId, setRevokeId] = useState<string | null>(null)

  const form = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { email: '', name: '' },
  })

  if (!profile || !snapshot) return null

  const connections = snapshot.caregiverConnections.filter(
    (c) => c.patient_id === profile.id,
  )
  const logs = snapshot.notificationLogs
    .filter((l) => l.patient_id === profile.id)
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 20)

  async function onInvite(values: InviteValues) {
    await inviteCaregiver(values.email, values.name || null)
    form.reset()
    setToast(t('caregiver.inviteSent'))
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">{t('caregiver.title')}</h1>
        <p className="mt-1 max-w-2xl text-base text-slate-600">{t('caregiver.subtitle')}</p>
        <p className="mt-2 max-w-2xl text-base text-slate-600">{t('caregiver.consentNote')}</p>
      </div>

      <div className="card">
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">
          <HeartHandshake size={24} className="text-brand-700" aria-hidden="true" />
          {t('caregiver.inviteTitle')}
        </h2>
        <p className="mt-1 text-base text-slate-600">{t('caregiver.inviteHint')}</p>
        <form onSubmit={form.handleSubmit(onInvite)} noValidate className="mt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="invite-email">{t('caregiver.inviteEmail')}</label>
              <input id="invite-email" type="email" className="input" {...form.register('email')} />
              {form.formState.errors.email ? (
                <p className="field-error">{t(form.formState.errors.email.message ?? '')}</p>
              ) : null}
            </div>
            <div>
              <label className="label" htmlFor="invite-name">
                {t('caregiver.inviteName')} ({t('common.optional')})
              </label>
              <input id="invite-name" type="text" className="input" {...form.register('name')} />
            </div>
          </div>
          <button
            type="submit"
            className="btn-primary mt-4"
            disabled={form.formState.isSubmitting}
            data-testid="send-caregiver-invite"
          >
            <Send size={20} aria-hidden="true" />
            {t('caregiver.sendInvite')}
          </button>
        </form>
      </div>

      <div className="card">
        <h2 className="text-xl font-bold text-slate-900">{t('caregiver.connections')}</h2>
        {connections.length === 0 ? (
          <div className="mt-3">
            <EmptyState title={t('caregiver.noConnections')} />
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {connections.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-base font-semibold text-slate-900">
                    {c.caregiver_name ?? c.invited_email}
                  </p>
                  <p className="text-sm text-slate-500">{c.invited_email}</p>
                  <span
                    className={`badge mt-1 ${
                      c.status === 'active'
                        ? 'bg-green-100 text-green-900'
                        : c.status === 'pending'
                          ? 'bg-amber-100 text-amber-900'
                          : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {t(`caregiver.status${c.status === 'active' ? 'Active' : c.status === 'pending' ? 'Pending' : 'Revoked'}`)}
                  </span>
                </div>
                {c.status !== 'revoked' ? (
                  <button
                    type="button"
                    className="btn-secondary !min-h-10 !py-2"
                    onClick={() => setRevokeId(c.id)}
                  >
                    <UserX size={18} aria-hidden="true" />
                    {t('caregiver.revoke')}
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">
          <Bell size={22} className="text-brand-700" aria-hidden="true" />
          {t('caregiver.alertsTitle')}
        </h2>
        {logs.length === 0 ? (
          <p className="mt-3 text-base text-slate-600">{t('caregiver.noAlerts')}</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {logs.map((l) => (
              <li key={l.id} className="py-3">
                <p className="text-base text-slate-800">{l.message}</p>
                <p className="mt-1 text-sm text-slate-500">
                  {l.channel} · {l.status} · {new Date(l.created_at).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={revokeId !== null}
        title={t('caregiver.revokeConfirmTitle')}
        text={t('caregiver.revokeConfirmText')}
        danger
        confirmLabel={t('caregiver.revoke')}
        onConfirm={() => {
          if (revokeId) void updateCaregiverConnection(revokeId, 'revoked')
          setRevokeId(null)
        }}
        onCancel={() => setRevokeId(null)}
      />
    </div>
  )
}
