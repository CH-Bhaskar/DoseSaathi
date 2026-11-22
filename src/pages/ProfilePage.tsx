import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Contrast, ShieldCheck, Type } from 'lucide-react'
import AccessibleActionButton from '../components/AccessibleActionButton'
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '../i18n'
import { defaultPatientPrivateSettings } from '../lib/callPrefs'
import { formatDateLong } from '../lib/time'
import { useAppStore } from '../store/appStore'
import { profileSchema, type ProfileFormValues } from '../validation/medication'
import {
  patientPrivateSettingsSchema,
  type PatientPrivateSettingsFormValues,
} from '../validation/extension'

const TIMEZONES = [
  'Asia/Kolkata',
  'Asia/Dubai',
  'Asia/Singapore',
  'Europe/London',
  'America/New_York',
]

export default function ProfilePage() {
  const { t } = useTranslation()
  const profile = useAppStore((s) => s.profile)
  const snapshot = useAppStore((s) => s.snapshot)
  const saveProfile = useAppStore((s) => s.saveProfile)
  const savePatientPrivateSettings = useAppStore(
    (s) => s.savePatientPrivateSettings,
  )
  const setToast = useAppStore((s) => s.setToast)
  const setLanguage = useAppStore((s) => s.setLanguage)
  const largeText = useAppStore((s) => s.largeText)
  const setLargeText = useAppStore((s) => s.setLargeText)
  const highContrast = useAppStore((s) => s.highContrast)
  const setHighContrast = useAppStore((s) => s.setHighContrast)

  // Pregnancy is a patient-only, private setting. The row is owner-only
  // in the database (006) and is never read for anyone else — the
  // snapshot only ever carries the signed-in user's own row.
  const privateSettings =
    snapshot?.patientPrivateSettings.find((s) => s.user_id === profile?.id) ??
    (profile ? defaultPatientPrivateSettings(profile.id) : null)

  const pregnancyForm = useForm<PatientPrivateSettingsFormValues>({
    resolver: zodResolver(patientPrivateSettingsSchema),
    values: privateSettings
      ? {
          pregnancy_opt_in: privateSettings.pregnancy_opt_in,
          pregnancy_clinician_note: privateSettings.pregnancy_clinician_note ?? '',
          pregnancy_visible_to_caregiver:
            privateSettings.pregnancy_visible_to_caregiver,
        }
      : {
          pregnancy_opt_in: false,
          pregnancy_clinician_note: '',
          pregnancy_visible_to_caregiver: false,
        },
  })

  const form = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    values: profile
      ? {
          full_name: profile.full_name,
          phone: profile.phone ?? '',
          preferred_language: (profile.preferred_language === 'kn' ? 'kn' : 'en') as 'en' | 'kn',
          timezone: profile.timezone,
          caregiver_contact: profile.caregiver_contact ?? '',
        }
      : undefined,
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
    })
    setLanguage(values.preferred_language as SupportedLanguage)
    setToast(t('profile.savedToast'))
  }

  async function onPregnancySubmit(values: PatientPrivateSettingsFormValues) {
    if (!profile || !privateSettings) return
    // Opting out clears the note and caregiver visibility: an opted-out
    // setting must not keep stale private information.
    await savePatientPrivateSettings({
      ...privateSettings,
      user_id: profile.id,
      pregnancy_opt_in: values.pregnancy_opt_in,
      pregnancy_clinician_note: values.pregnancy_opt_in
        ? values.pregnancy_clinician_note?.trim() || null
        : null,
      pregnancy_visible_to_caregiver: values.pregnancy_opt_in
        ? values.pregnancy_visible_to_caregiver
        : false,
    })
    setToast(t('pregnancy.savedToast'))
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">{t('profile.title')}</h1>
        <p className="mt-1 text-base text-slate-600">{t('profile.subtitle')}</p>
        <p className="mt-2 text-base text-slate-600">
          {t('profile.memberSince', { date: formatDateLong(profile.created_at.slice(0, 10)) })} ·{' '}
          {t('profile.roleLabel')}: {t(`auth.role${profile.role === 'patient' ? 'Patient' : profile.role === 'caregiver' ? 'Caregiver' : profile.role === 'healthcare_professional' ? 'Hcp' : 'Admin'}`)}
        </p>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="card flex flex-col gap-4">
        <div>
          <label className="label" htmlFor="pf-name">{t('profile.name')}</label>
          <input id="pf-name" type="text" className="input" {...form.register('full_name')} />
          {form.formState.errors.full_name ? (
            <p className="field-error">{t(form.formState.errors.full_name.message ?? '')}</p>
          ) : null}
        </div>
        <div>
          <label className="label" htmlFor="pf-email">{t('profile.email')}</label>
          <input id="pf-email" type="email" className="input bg-slate-50" value={profile.email} disabled />
        </div>
        <div>
          <label className="label" htmlFor="pf-phone">{t('profile.phone')}</label>
          <input id="pf-phone" type="tel" className="input" {...form.register('phone')} />
          {form.formState.errors.phone ? (
            <p className="field-error">{t(form.formState.errors.phone.message ?? '')}</p>
          ) : null}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="pf-lang">{t('profile.language')}</label>
            <select id="pf-lang" className="input" {...form.register('preferred_language')}>
              {SUPPORTED_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.nativeLabel} ({l.label})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="pf-tz">{t('profile.timezone')}</label>
            <select id="pf-tz" className="input" {...form.register('timezone')}>
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label" htmlFor="pf-caregiver">{t('profile.caregiverContact')}</label>
          <input id="pf-caregiver" type="text" className="input" {...form.register('caregiver_contact')} />
        </div>
        <button type="submit" className="btn-primary" disabled={form.formState.isSubmitting}>
          {t('profile.saveProfile')}
        </button>
      </form>

      {profile.role === 'patient' ? (
        <form
          onSubmit={pregnancyForm.handleSubmit(onPregnancySubmit)}
          noValidate
          className="card flex flex-col gap-4"
          data-testid="pregnancy-settings"
        >
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">
              <ShieldCheck size={22} className="text-brand-700" aria-hidden="true" />
              {t('pregnancy.title')}
            </h2>
            <p className="mt-1 text-base text-slate-600">{t('pregnancy.subtitle')}</p>
          </div>

          <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3">
            <span>
              <span className="block text-base font-semibold text-slate-900">{t('pregnancy.optIn')}</span>
              <span className="block text-sm text-slate-500">{t('pregnancy.optInHint')}</span>
            </span>
            <input
              type="checkbox"
              className="mt-1 h-6 w-6 shrink-0 accent-brand-700"
              checked={pregnancyForm.watch('pregnancy_opt_in')}
              onChange={(e) =>
                pregnancyForm.setValue('pregnancy_opt_in', e.target.checked)
              }
              data-testid="pregnancy-opt-in"
            />
          </label>

          <div>
            <label className="label" htmlFor="pregnancy-note">
              {t('pregnancy.clinicianNote')}
            </label>
            <textarea
              id="pregnancy-note"
              className="input min-h-20"
              placeholder={t('pregnancy.clinicianNotePlaceholder')}
              disabled={!pregnancyForm.watch('pregnancy_opt_in')}
              {...pregnancyForm.register('pregnancy_clinician_note')}
              data-testid="pregnancy-note"
            />
            <p className="mt-1 text-sm text-slate-500">{t('pregnancy.clinicianNoteHint')}</p>
            {pregnancyForm.formState.errors.pregnancy_clinician_note ? (
              <p className="field-error">
                {t(pregnancyForm.formState.errors.pregnancy_clinician_note.message ?? '')}
              </p>
            ) : null}
          </div>

          <label
            className={`flex items-start justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3 ${
              pregnancyForm.watch('pregnancy_opt_in')
                ? 'cursor-pointer'
                : 'cursor-not-allowed opacity-60'
            }`}
          >
            <span>
              <span className="block text-base font-semibold text-slate-900">{t('pregnancy.visibleToCaregiver')}</span>
              <span className="block text-sm text-slate-500">{t('pregnancy.visibleToCaregiverHint')}</span>
            </span>
            <input
              type="checkbox"
              className="mt-1 h-6 w-6 shrink-0 accent-brand-700"
              checked={pregnancyForm.watch('pregnancy_visible_to_caregiver')}
              disabled={!pregnancyForm.watch('pregnancy_opt_in')}
              onChange={(e) =>
                pregnancyForm.setValue(
                  'pregnancy_visible_to_caregiver',
                  e.target.checked,
                )
              }
              data-testid="pregnancy-visible-caregiver"
            />
          </label>

          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3">
            <p className="text-base text-amber-900">{t('pregnancy.safetyMessage')}</p>
          </div>
          <p className="text-sm text-slate-500">{t('pregnancy.privateNote')}</p>

          <AccessibleActionButton
            type="submit"
            variant="primary"
            disabled={pregnancyForm.formState.isSubmitting}
            data-testid="pregnancy-save"
          >
            {t('pregnancy.saveSettings')}
          </AccessibleActionButton>
        </form>
      ) : null}

      <div className="card">
        <h2 className="text-xl font-bold text-slate-900">{t('profile.accessibilityTitle')}</h2>
        <div className="mt-4 flex flex-col gap-3">
          <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3">
            <span className="flex items-start gap-3">
              <Type size={22} className="mt-0.5 text-brand-700" aria-hidden="true" />
              <span>
                <span className="block text-base font-semibold text-slate-900">{t('profile.largeText')}</span>
                <span className="block text-sm text-slate-500">{t('profile.largeTextHint')}</span>
              </span>
            </span>
            <input
              type="checkbox"
              className="mt-1 h-6 w-6 shrink-0 accent-brand-700"
              checked={largeText}
              onChange={(e) => setLargeText(e.target.checked)}
              data-testid="large-text-toggle"
            />
          </label>
          <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3">
            <span className="flex items-start gap-3">
              <Contrast size={22} className="mt-0.5 text-brand-700" aria-hidden="true" />
              <span>
                <span className="block text-base font-semibold text-slate-900">{t('profile.highContrast')}</span>
                <span className="block text-sm text-slate-500">{t('profile.highContrastHint')}</span>
              </span>
            </span>
            <input
              type="checkbox"
              className="mt-1 h-6 w-6 shrink-0 accent-brand-700"
              checked={highContrast}
              onChange={(e) => setHighContrast(e.target.checked)}
              data-testid="high-contrast-toggle"
            />
          </label>
        </div>
      </div>
    </div>
  )
}
