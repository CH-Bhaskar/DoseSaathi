import { useTranslation } from 'react-i18next'
import { TriangleAlert } from 'lucide-react'

export default function ErrorState({
  title,
  text,
  onRetry,
}: {
  title?: string
  text?: string
  onRetry?: () => void
}) {
  const { t } = useTranslation()
  return (
    <div
      className="card flex flex-col items-center gap-3 py-10 text-center"
      role="alert"
    >
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-700">
        <TriangleAlert size={32} aria-hidden="true" />
      </span>
      <h2 className="text-xl font-bold text-slate-900">
        {title ?? t('errors.genericTitle')}
      </h2>
      <p className="max-w-md text-base text-slate-600">
        {text ?? t('errors.genericText')}
      </p>
      {onRetry ? (
        <button type="button" className="btn-primary mt-2" onClick={onRetry}>
          {t('common.retry')}
        </button>
      ) : null}
    </div>
  )
}
