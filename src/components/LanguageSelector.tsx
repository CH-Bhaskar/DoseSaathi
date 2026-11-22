import { useTranslation } from 'react-i18next'
import { Languages } from 'lucide-react'
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../i18n'
import { useAppStore } from '../store/appStore'

export default function LanguageSelector() {
  const { t } = useTranslation()
  const language = useAppStore((s) => s.language)
  const setLanguage = useAppStore((s) => s.setLanguage)
  return (
    <label className="flex items-center gap-2 text-base font-semibold text-slate-700">
      {/* Icon hidden on small phones so the header fits 375px. */}
      <Languages size={20} aria-hidden="true" className="hidden sm:block" />
      <span className="sr-only">{t('common.language')}</span>
      <select
        value={language}
        onChange={(e) => setLanguage(e.target.value as SupportedLanguage)}
        className="rounded-xl border-2 border-slate-300 bg-white px-2 py-2 text-sm font-semibold text-slate-800 sm:px-3 sm:text-base"
        aria-label={t('common.language')}
        data-testid="language-select"
      >
        {SUPPORTED_LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.nativeLabel}
          </option>
        ))}
      </select>
    </label>
  )
}
