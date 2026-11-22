import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'

export default function NotFoundPage() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-8">
      <div className="card flex max-w-lg flex-col items-center gap-3 py-10 text-center">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-700">
          <Compass size={32} aria-hidden="true" />
        </span>
        <h1 className="text-2xl font-bold text-slate-900">{t('errors.notFoundTitle')}</h1>
        <p className="text-base text-slate-600">{t('errors.notFoundText')}</p>
        <Link to="/" className="btn-primary mt-2">
          {t('common.goHome')}
        </Link>
      </div>
    </div>
  )
}
