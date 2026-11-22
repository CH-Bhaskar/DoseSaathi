import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw } from 'lucide-react'
import AccessibleActionButton from '../components/AccessibleActionButton'
import CallStatusCard from '../components/CallStatusCard'
import DoseConfirmationDialog from '../components/DoseConfirmationDialog'
import EmptyState from '../components/EmptyState'
import ErrorState from '../components/ErrorState'
import ProviderUnavailableNotice from '../components/ProviderUnavailableNotice'
import type { CallAttempt, CallAttemptStatus, CallHistoryEntry } from '../types/calls'

const FILTERS: ('all' | CallAttemptStatus)[] = [
  'all',
  'completed',
  'no_answer',
  'voicemail',
  'failed',
  'cancelled',
]

/** Call history page. Data comes from CallHistoryContainer, which
 * loads it through the provider (fetchCallHistory) and maps the
 * dialog actions onto recordDose / flagCallHelp. This page renders
 * exactly what it is given and never fakes a call record. */
export default function CallHistoryPage({
  entries,
  loading,
  error,
  callsConfigured,
  isOffline,
  onRefresh,
  onConfirmDose,
  onRemindLater,
  onNeedHelp,
}: {
  entries: CallHistoryEntry[]
  loading: boolean
  error: string | null
  /** False while Twilio is not configured — shows the honest notice. */
  callsConfigured: boolean
  isOffline: boolean
  onRefresh: () => void
  /** Async: the dialog waits for the action before showing its result,
   * so a failed save is never reported as a success. */
  onConfirmDose?: (attempt: CallAttempt) => void | Promise<void>
  onRemindLater?: (attempt: CallAttempt) => void | Promise<void>
  onNeedHelp?: (attempt: CallAttempt) => void | Promise<void>
}) {
  const { t } = useTranslation()
  const [filter, setFilter] = useState<'all' | CallAttemptStatus>('all')
  const [selected, setSelected] = useState<CallHistoryEntry | null>(null)

  const filtered = useMemo(() => {
    const list =
      filter === 'all'
        ? entries
        : entries.filter((e) => e.attempt.status === filter)
    return [...list].sort((a, b) =>
      b.attempt.scheduled_for.localeCompare(a.attempt.scheduled_for),
    )
  }, [entries, filter])

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            {t('calls.historyTitle')}
          </h1>
          <p className="mt-1 text-base text-slate-600">
            {t('calls.historySubtitle')}
          </p>
        </div>
        <AccessibleActionButton variant="secondary" onClick={onRefresh}>
          <RefreshCw size={20} aria-hidden="true" />
          {t('calls.refresh')}
        </AccessibleActionButton>
      </div>

      {!callsConfigured ? (
        <ProviderUnavailableNotice reason="not_configured" />
      ) : isOffline ? (
        <ProviderUnavailableNotice reason="offline" />
      ) : null}

      <div
        className="flex flex-wrap gap-2"
        role="group"
        aria-label={t('calls.historyTitle')}
      >
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className={`min-h-11 rounded-full border-2 px-4 py-2 text-base font-semibold ${
              filter === f
                ? 'border-brand-700 bg-brand-700 text-white'
                : 'border-slate-300 bg-white text-slate-700 hover:border-brand-600'
            }`}
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
          >
            {f === 'all' ? t('calls.filterAll') : t(`calls.status.${f}`)}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-base text-slate-600" role="status" aria-busy="true">
          {t('calls.loading')}
        </p>
      ) : error !== null ? (
        <ErrorState title={t('calls.loadError')} text={error} onRetry={onRefresh} />
      ) : filtered.length === 0 ? (
        <EmptyState title={t('calls.noCalls')} text={t('calls.noCallsText')} />
      ) : (
        <ul className="flex flex-col gap-4">
          {filtered.map((entry) => (
            <li key={entry.attempt.id}>
              <CallStatusCard
                attempt={entry.attempt}
                medicationName={entry.medicationName}
                medicationStrength={entry.medicationStrength}
                responses={entry.responses}
                onSelect={
                  entry.doseStatus === 'pending'
                    ? () => setSelected(entry)
                    : undefined
                }
              />
            </li>
          ))}
        </ul>
      )}

      <DoseConfirmationDialog
        open={selected !== null}
        attempt={selected?.attempt ?? null}
        medicationName={selected?.medicationName ?? ''}
        onConfirm={(attempt) => onConfirmDose?.(attempt)}
        onRemindLater={(attempt) => onRemindLater?.(attempt)}
        onNeedHelp={(attempt) => onNeedHelp?.(attempt)}
        onClose={() => setSelected(null)}
      />
    </div>
  )
}
