import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../i18n'
import { useAppStore } from '../store/appStore'
import { profileSchema, type ProfileFormValues } from '../validation/medication'

const TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Europe/London',
  'America/New_York',
]

export default function OnboardingPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const profile = useAppStore((s) => s.profile)
  const saveProfile = useAppStore((s) => s.saveProfile)
  const setLanguage = useAppStore((s) => s.setLanguage)
  const language = useAppStore((s) => s.language)

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      full_name: profile?.full_name ?? '',
      phone: profile?.phone ?? '',
      preferred_language: language,
      timezone: profile?.timezone ?? 'Asia/Kolkata',
      caregiver_contact: profile?.caregiver_contact ?? '',
    },
  })

  if (!profile) return null

  async function onSubmit(values: ProfileFormValues) {
    if (!profile) return
    await saveProfile({
      ...profile,
      full_name: values.full_name,
      phone: values.phone || null,
      preferred_language: values.preferred_language,
      timezone: values.timezone,
      caregiver_contact: values.caregiver_contact || null,
      onboarding_completed: true,
    })
    setLanguage(values.preferred_language as SupportedLanguage)
    navigate('/dashboard')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50 px-4 py-8">
      <div className="card w-full max-w-lg">
        <h1 className="text-2xl font-bold text-slate-900">
          {t('onboarding.welcome', { name: profile.full_name })}
        </h1>
        <p className="mt-1 text-base text-slate-600">{t('onboarding.subtitle')}</p>
        <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="mt-6">
          <div>
            <label className="label" htmlFor="ob-name">{t('onboarding.nameLabel')}</label>
            <input id="ob-name" type="text" className="input" {...form.register('full_name')} />
            {form.formState.errors.full_name ? (
              <p className="field-error">{t(form.formState.errors.full_name.message ?? '')}</p>
            ) : null}
          </div>
          <div className="mt-4">
            <label className="label" htmlFor="ob-phone">{t('onboarding.phoneLabel')}</label>
            <input
              id="ob-phone"
              type="tel"
              className="input"
              autoComplete="tel"
              placeholder="+91 98765 43210"
              {...form.register('phone')}
            />
            {form.formState.errors.phone ? (
              <p className="field-error">{t(form.formState.errors.phone.message ?? '')}</p>
            ) : null}
          </div>
          <div className="mt-4">
            <label className="label" htmlFor="ob-lang">{t('onboarding.languageLabel')}</label>
            <select id="ob-lang" className="input" {...form.register('preferred_language')}>
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.nativeLabel} ({l.label})
                </option>
              ))}
            </select>
          </div>
          <div className="mt-4">
            <label className="label" htmlFor="ob-tz">{t('onboarding.timezoneLabel')}</label>
            <select id="ob-tz" className="input" {...form.register('timezone')}>
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-4">
            <label className="label" htmlFor="ob-caregiver">
              {t('onboarding.caregiverContactLabel')}
            </label>
            <input
              id="ob-caregiver"
              type="text"
              className="input"
              placeholder={t('onboarding.caregiverContactHint')}
              {...form.register('caregiver_contact')}
            />
          </div>
          <button type="submit" className="btn-primary mt-6 w-full" disabled={form.formState.isSubmitting}>
            {t('onboarding.finish')}
          </button>
        </form>
      </div>
    </div>
  )
}
