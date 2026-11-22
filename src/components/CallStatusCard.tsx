import { useTranslation } from 'react-i18next'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  PhoneCall,
  PhoneMissed,
  PhoneOff,
  Voicemail,
  XCircle,
} from 'lucide-react'
import type {
  CallAttempt,
  CallAttemptStatus,
  CallResponse,
} from '../types/calls'
import AccessibleActionButton from './AccessibleActionButton'

const STATUS_STYLES: Record<CallAttemptStatus, string> = {
  queued: 'bg-sky-100 text-sky-900',
  calling: 'bg-sky-100 text-sky-900',
  completed: 'bg-green-100 text-green-900',
  no_answer: 'bg-amber-100 text-amber-900',
  busy: 'bg-amber-100 text-amber-900',
  failed: 'bg-red-100 text-red-900',
  voicemail: 'bg-slate-100 text-slate-900',
  cancelled: 'bg-slate-100 text-slate-900',
}

function StatusIcon({ status }: { status: CallAttemptStatus }) {
  switch (status) {
    case 'queued':
      return <Clock size={16} aria-hidden="true" />
    case 'calling':
      return <PhoneCall size={16} aria-hidden="true" />
    case 'completed':
      return <CheckCircle2 size={16} aria-hidden="true" />
    case 'no_answer':
      return <PhoneMissed size={16} aria-hidden="true" />
    case 'busy':
      return <PhoneOff size={16} aria-hidden="true" />
    case 'failed':
      return <AlertTriangle size={16} aria-hidden="true" />
    case 'voicemail':
      return <Voicemail size={16} aria-hidden="true" />
    case 'cancelled':
      return <XCircle size={16} aria-hidden="true" />
  }
}

/** One call attempt: status, time, medicine, delivery state, retry and
 * escalation info. Presentational — the integration agent wires data
 * fetching and the confirm action. */
export default function CallStatusCard({
  attempt,
  medicationName,
  medicationStrength,
  responses,
  onSelect,
}: {
  attempt: CallAttempt
  medicationName: string
  medicationStrength: string | null
  responses?: CallResponse[]
  onSelect?: (attempt: CallAttempt) => void
}) {
  const { t } = useTranslation()
  const confirmed = (responses ?? []).some((r) => r.confirmed)
  const lastResponse = (responses ?? [])[(responses ?? []).length - 1]
  const scheduledAt = new Date(attempt.scheduled_for).toLocaleString()
  const nextRetryAt = attempt.next_retry_at
    ? new Date(attempt.next_retry_at).toLocaleString()
    : null

  return (
    <article
      className="card"
      aria-label={`${medicationName} — ${t(`calls.status.${attempt.status}`)}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold text-slate-900">
            {medicationName}
            {medicationStrength ? ` ${medicationStrength}` : ''}
          </h3>
          <p className="mt-1 text-base text-slate-600">
            {t('calls.scheduledFor', { date: scheduledAt })}
          </p>
        </div>
        <span className={`badge ${STATUS_STYLES[attempt.status]}`}>
          <StatusIcon status={attempt.status} />
          {t(`calls.status.${attempt.status}`)}
        </span>
      </div>

      <dl className="mt-3 space-y-1 text-base text-slate-700">
        {attempt.attempt_number > 1 ? (
          <div className="flex gap-2">
            <dt className="font-semibold">{t('calls.attemptNumber')}:</dt>
            <dd>{attempt.attempt_number}</dd>
          </div>
        ) : null}
        {nextRetryAt ? (
          <div className="flex gap-2">
            <dt className="font-semibold">{t('calls.retryScheduled')}:</dt>
            <dd>{nextRetryAt}</dd>
          </div>
        ) : null}
        {attempt.escalation_status !== 'none' ? (
          <div className="flex gap-2">
            <dt className="font-semibold">{t('calls.escalation')}:</dt>
            <dd>{t(`calls.escalationStatus.${attempt.escalation_status}`)}</dd>
          </div>
        ) : null}
        {lastResponse ? (
          <div className="flex gap-2">
            <dt className="font-semibold">{t('calls.response')}:</dt>
            <dd>
              {t(`calls.responseType.${lastResponse.response_type}`)}
              {lastResponse.key_pressed
                ? ` (${t('calls.keyPressed', { key: lastResponse.key_pressed })})`
                : ''}
              {lastResponse.speech_text ? ` — “${lastResponse.speech_text}”` : ''}
            </dd>
          </div>
        ) : null}
      </dl>

      <p
        className={`mt-3 text-base font-semibold ${confirmed ? 'text-green-800' : 'text-slate-600'}`}
        aria-live="polite"
      >
        {confirmed ? t('calls.confirmed') : t('calls.notConfirmed')}
      </p>

      {onSelect ? (
        <AccessibleActionButton
          variant="secondary"
          className="mt-4"
          onClick={() => onSelect(attempt)}
        >
          {t('calls.viewDetails')}
        </AccessibleActionButton>
      ) : null}
    </article>
  )
}
