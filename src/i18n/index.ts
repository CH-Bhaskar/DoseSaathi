/* i18next setup. English and Kannada live in separate JSON files;
 * components never hard-code user-facing strings. */
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './en.json'
import kn from './kn.json'

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'kn', label: 'Kannada', nativeLabel: 'ಕನ್ನಡ' },
] as const

export type SupportedLanguage = 'en' | 'kn'

export function isSupportedLanguage(code: string): code is SupportedLanguage {
  return code === 'en' || code === 'kn'
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    kn: { translation: kn },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
})

export default i18n
