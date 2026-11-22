import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { Globe, Pill } from 'lucide-react'
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../i18n'
import { useAppStore } from '../store/appStore'

/** First-open language selection: one dropdown listing the supported
 * languages, plus a Continue button. Changing the dropdown applies the
 * language immediately so the choice can be read in that language;
 * Continue records the choice and moves on (to the landing page, or
 * the dashboard when a session already exists). */
export default function LanguagePage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const language = useAppStore((s) => s.language)
  const setLanguage = useAppStore((s) => s.setLanguage)
  const session = useAppStore((s) => s.session)
  const [selected, setSelected] = useState<SupportedLanguage>(language)

  function onSelect(code: SupportedLanguage) {
    setSelected(code)
    setLanguage(code)
  }

  function continueOn() {
    setLanguage(selected)
    localStorage.setItem('dosesathi-lang-chosen', 'true')
    navigate(session ? '/dashboard' : '/')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4 py-8">
      <div className="card w-full max-w-lg text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-700 text-white">
          <Pill size={34} aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-3xl font-bold text-slate-900">
          {t('common.appName')}
        </h1>
        <p className="mt-1 text-base text-slate-600">
          {t('common.appTagline')}
        </p>
        <div className="mt-8 flex items-center justify-center gap-2 text-slate-700">
          <Globe size={22} aria-hidden="true" />
          <h2 className="text-xl font-bold">{t('language.title')}</h2>
        </div>
        <p className="mt-1 text-base text-slate-600">{t('language.subtitle')}</p>
        <div className="mt-6 text-left">
          <label className="label" htmlFor="language-select">
            {t('language.selectLabel')}
          </label>
          <select
            id="language-select"
            className="input !py-4 !text-xl"
            value={selected}
            onChange={(e) => onSelect(e.target.value as SupportedLanguage)}
            data-testid="language-select"
          >
            {SUPPORTED_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.nativeLabel} ({l.label})
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          className="btn-primary mt-6 w-full !py-4 !text-xl"
          onClick={continueOn}
          data-testid="language-continue"
        >
          {t('language.continue')}
        </button>
      </div>
    </div>
  )
}
