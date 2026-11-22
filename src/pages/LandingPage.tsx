import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { Bell, CalendarDays, HeartHandshake, Pill, ShieldCheck, WifiOff } from 'lucide-react'
import LanguageSelector from '../components/LanguageSelector'

export default function LandingPage() {
  const { t } = useTranslation()
  const features = [
    { icon: CalendarDays, title: t('landing.feature1Title'), text: t('landing.feature1Text') },
    { icon: Bell, title: t('landing.feature2Title'), text: t('landing.feature2Text') },
    { icon: HeartHandshake, title: t('landing.feature3Title'), text: t('landing.feature3Text') },
    { icon: WifiOff, title: t('landing.feature4Title'), text: t('landing.feature4Text') },
  ]
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-700 text-white">
          <Pill size={24} aria-hidden="true" />
        </span>
        <span className="text-xl font-bold text-slate-900">{t('common.appName')}</span>
        <div className="ml-auto flex items-center gap-3">
          <LanguageSelector />
          <Link to="/login" className="btn-ghost !min-h-11">
            {t('common.signIn')}
          </Link>
          <Link to="/signup" className="btn-primary !min-h-11">
            {t('common.signUp')}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16">
        <section className="py-12 text-center sm:py-16">
          <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight text-slate-900 sm:text-5xl">
            {t('landing.heroTitle')}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600 sm:text-xl">
            {t('landing.heroSubtitle')}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/signup" className="btn-primary w-full !py-4 !text-lg sm:w-auto">
              {t('landing.ctaSignup')}
            </Link>
            <Link to="/login" className="btn-secondary w-full !py-4 !text-lg sm:w-auto">
              {t('landing.ctaLogin')}
            </Link>
          </div>
          <p className="mt-4 text-base text-slate-500">
            {t('landing.languagesNote')}
          </p>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="card">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                <f.icon size={26} aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-lg font-bold text-slate-900">{f.title}</h2>
              <p className="mt-1 text-base text-slate-600">{f.text}</p>
            </div>
          ))}
        </section>

        <section className="card mt-8">
          <h2 className="text-2xl font-bold text-slate-900">{t('landing.howTitle')}</h2>
          <ol className="mt-4 list-decimal space-y-3 pl-6 text-lg text-slate-700">
            <li>{t('landing.step1')}</li>
            <li>{t('landing.step2')}</li>
            <li>{t('landing.step3')}</li>
          </ol>
        </section>

        <section className="mt-8 flex gap-4 rounded-2xl border border-brand-200 bg-brand-50 p-5">
          <ShieldCheck size={28} className="shrink-0 text-brand-700" aria-hidden="true" />
          <div>
            <h2 className="text-lg font-bold text-slate-900">{t('landing.safetyTitle')}</h2>
            <p className="mt-1 text-base text-slate-700">{t('landing.safetyText')}</p>
            <p className="mt-2 text-base font-semibold text-slate-800">
              {t('common.emergencyNote')}
            </p>
          </div>
        </section>
      </main>
    </div>
  )
}
