/* Full-screen not-configured state. Shown at `/` when Supabase is not
 * configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY missing): no
 * fake login, no sample data — just what is missing and how to fix it.
 * The language selector stays available so the notice can be read in
 * Kannada. */
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Pill, Settings } from 'lucide-react'
import LanguageSelector from '../components/LanguageSelector'

export default function NotConfiguredPage() {
  const { t } = useTranslation()
  return (
    <div className="min-h-screen" data-testid="not-configured-page">
      <header className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-700 text-white">
          <Pill size={24} aria-hidden="true" />
        </span>
        <span className="text-xl font-bold text-slate-900">{t('common.appName')}</span>
        <div className="ml-auto">
          <LanguageSelector />
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 pb-16 pt-8">
        <div className="card">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 text-amber-900">
            <Settings size={30} aria-hidden="true" />
          </span>
          <h1 className="mt-4 text-3xl font-bold text-slate-900">
            {t('notConfigured.title')}
          </h1>
          <p className="mt-2 text-base text-slate-700">
            {t('notConfigured.text')}
          </p>

          <h2 className="mt-6 text-lg font-bold text-slate-900">
            {t('notConfigured.varsTitle')}
          </h2>
          <ul className="mt-2 space-y-2">
            <li>
              <code className="rounded-lg bg-slate-100 px-3 py-1.5 text-base font-semibold text-slate-900">
                VITE_SUPABASE_URL
              </code>
            </li>
            <li>
              <code className="rounded-lg bg-slate-100 px-3 py-1.5 text-base font-semibold text-slate-900">
                VITE_SUPABASE_ANON_KEY
              </code>
            </li>
          </ul>

          <ol className="mt-6 list-decimal space-y-2 pl-6 text-base text-slate-700">
            <li>{t('notConfigured.step1')}</li>
            <li>{t('notConfigured.step2')}</li>
            <li>{t('notConfigured.step3')}</li>
          </ol>

          <p className="mt-6 text-base text-slate-600">
            {t('notConfigured.readmeNote')}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/language" className="btn-secondary">
              {t('language.title')}
            </Link>
            <Link to="/login" className="btn-primary">
              {t('common.signIn')}
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
