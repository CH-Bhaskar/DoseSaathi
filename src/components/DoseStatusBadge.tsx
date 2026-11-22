import { useTranslation } from 'react-i18next'
import { AlertCircle, CheckCircle2, Clock, MinusCircle } from 'lucide-react'
import type { DoseStatus } from '../types'

const STYLES: Record<DoseStatus, string> = {
  taken: 'bg-green-100 text-green-900',
  missed: 'bg-red-100 text-red-900',
  skipped: 'bg-amber-100 text-amber-900',
  pending: 'bg-sky-100 text-sky-900',
}

export default function DoseStatusBadge({ status }: { status: DoseStatus }) {
  const { t } = useTranslation()
  const Icon =
    status === 'taken'
      ? CheckCircle2
      : status === 'missed'
        ? AlertCircle
        : status === 'skipped'
          ? MinusCircle
          : Clock
  return (
    <span className={`badge ${STYLES[status]}`}>
      <Icon size={16} aria-hidden="true" />
      {t(`common.${status}`)}
    </span>
  )
}
