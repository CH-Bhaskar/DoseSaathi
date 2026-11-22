import { useTranslation } from 'react-i18next'
import { CloudOff, RefreshCw, WifiOff } from 'lucide-react'
import { useAppStore } from '../store/appStore'

/** Offline indicator + sync status. Always visible when offline or when
 * changes are waiting to sync; otherwise quiet. */
export default function OfflineBanner() {
  const { t } = useTranslation()
  const online = useAppStore((s) => s.online)
  const syncState = useAppStore((s) => s.syncState)
  const outboxPending = useAppStore((s) => s.outboxPending)
  const conflicts = useAppStore((s) => s.conflicts)
  const syncNow = useAppStore((s) => s.syncNow)

  if (online && syncState === 'synced' && outboxPending === 0) return null

  return (
    <div
      role="status"
      className={`flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 text-base font-medium ${
        !online
          ? 'border-amber-300 bg-amber-50 text-amber-900'
          : syncState === 'error'
            ? 'border-red-300 bg-red-50 text-red-900'
            : 'border-sky-300 bg-sky-50 text-sky-900'
      }`}
    >
      {!online ? (
        <WifiOff size={20} aria-hidden="true" />
      ) : (
        <CloudOff size={20} aria-hidden="true" />
      )}
      <span className="flex-1">
        {!online
          ? t('errors.offlineText')
          : syncState === 'error'
            ? t('common.syncError')
            : syncState === 'syncing'
              ? t('common.syncing')
              : t('common.pendingSync', { count: outboxPending })}
      </span>
      {conflicts.length > 0 ? (
        <span className="text-sm">
          {conflicts.map((c) => (
            <span key={c} className="mr-2">
              {c}
            </span>
          ))}
        </span>
      ) : null}
      {online && outboxPending > 0 && syncState !== 'syncing' ? (
        <button
          type="button"
          className="btn-secondary !min-h-10 !py-2 !px-4"
          onClick={() => void syncNow()}
        >
          <RefreshCw size={18} aria-hidden="true" />
          {t('common.retry')}
        </button>
      ) : null}
    </div>
  )
}
