/* Admin: configuration notes and support requests only. Admins do NOT
 * see private medication records — the snapshot for an admin contains
 * profiles and support requests, and nothing else. */
import { useTranslation } from 'react-i18next'
import { CheckCircle2, LifeBuoy, Settings } from 'lucide-react'
import EmptyState from '../components/EmptyState'
import { useAppStore } from '../store/appStore'

export default function AdminPage() {
  const { t } = useTranslation()
  const snapshot = useAppStore((s) => s.snapshot)
  const updateSupportRequest = useAppStore((s) => s.updateSupportRequest)

  if (!snapshot) return null
  const openRequests = snapshot.supportRequests.filter((r) => r.status === 'open')
  const resolvedRequests = snapshot.supportRequests.filter((r) => r.status === 'resolved')

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">{t('admin.title')}</h1>
        <p className="mt-1 max-w-2xl text-base text-slate-600">{t('admin.subtitle')}</p>
        <p className="mt-2 max-w-2xl rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-base text-slate-700">
          {t('admin.note')}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card">
          <p className="text-base text-slate-600">{t('admin.statsTitle')}</p>
          <p className="mt-1 text-3xl font-bold text-brand-700">{snapshot.profiles.length}</p>
          <p className="text-base text-slate-600">{t('admin.accounts')}</p>
        </div>
        <div className="card">
          <p className="text-base text-slate-600">{t('admin.supportTitle')}</p>
          <p className="mt-1 text-3xl font-bold text-brand-700">{openRequests.length}</p>
          <p className="text-base text-slate-600">{t('admin.open')}</p>
        </div>
        <div className="card">
          <p className="text-base text-slate-600">{t('admin.supportTitle')}</p>
          <p className="mt-1 text-3xl font-bold text-brand-700">{resolvedRequests.length}</p>
          <p className="text-base text-slate-600">{t('admin.resolved')}</p>
        </div>
      </div>

      <div className="card">
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">
          <Settings size={22} className="text-brand-700" aria-hidden="true" />
          {t('admin.configTitle')}
        </h2>
        <p className="mt-2 text-base text-slate-700">
          {t('admin.configText')}
        </p>
      </div>

      <div className="card">
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">
          <LifeBuoy size={22} className="text-brand-700" aria-hidden="true" />
          {t('admin.supportTitle')}
        </h2>
        {snapshot.supportRequests.length === 0 ? (
          <div className="mt-3">
            <EmptyState title={t('admin.noSupport')} />
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {snapshot.supportRequests.map((r) => (
              <li key={r.id} className="py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-base font-bold text-slate-900">{r.subject}</p>
                    <p className="mt-1 text-base text-slate-700">{r.message}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {new Date(r.created_at).toLocaleString()} ·{' '}
                      {r.status === 'open' ? t('admin.open') : t('admin.resolved')}
                    </p>
                  </div>
                  {r.status === 'open' ? (
                    <button
                      type="button"
                      className="btn-primary !min-h-10 !py-2"
                      onClick={() => void updateSupportRequest(r.id, 'resolved')}
                    >
                      <CheckCircle2 size={18} aria-hidden="true" />
                      {t('admin.resolve')}
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
