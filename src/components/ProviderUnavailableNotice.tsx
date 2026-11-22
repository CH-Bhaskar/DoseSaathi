import { useTranslation } from 'react-i18next'
import { PhoneOff, WifiOff } from 'lucide-react'

/** Honest states for voice calls: the provider is not configured, or
 * the device is offline. In-app reminders still work in both cases —
 * the notice says so instead of pretending calls will arrive. */
export default function ProviderUnavailableNotice({
  reason,
}: {
  reason: 'not_configured' | 'offline'
}) {
  const { t } = useTranslation()
  const titleKey =
    reason === 'not_configured'
      ? 'calls.notConfigured.title'
      : 'calls.offline.title'
  const textKey =
    reason === 'not_configured'
      ? 'calls.notConfigured.text'
      : 'calls.offline.text'
  return (
    <div
      className="card flex items-start gap-3 border-amber-200 bg-amber-50"
      role="status"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-amber-700">
        {reason === 'not_configured' ? (
          <PhoneOff size={24} aria-hidden="true" />
        ) : (
          <WifiOff size={24} aria-hidden="true" />
        )}
      </span>
      <div>
        <h2 className="text-lg font-bold text-slate-900">{t(titleKey)}</h2>
        <p className="mt-1 text-base text-slate-700">{t(textKey)}</p>
        <p className="mt-1 text-base text-slate-700">
          {t('calls.inAppStillAvailable')}
        </p>
      </div>
    </div>
  )
}
