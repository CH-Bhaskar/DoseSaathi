import { useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Bell, Info } from 'lucide-react'
import ConsentSettings from '../components/ConsentSettings'
import ProviderUnavailableNotice from '../components/ProviderUnavailableNotice'
import VoiceReminderSettings from '../components/VoiceReminderSettings'
import { callsConfigured } from '../lib/callPrefs'
import {
  notificationPermission,
  notificationsSupported,
  requestNotificationPermission,
} from '../lib/notifications'
import { useAppStore } from '../store/appStore'
import type {
  CallPreferences,
  MedicineCallSettings,
} from '../types'
import {
  preferencesSchema,
  type PreferencesFormValues,
} from '../validation/medication'

export default function ReminderSettingsPage() {
  const { t } = useTranslation()
  const profile = useAppStore((s) => s.profile)
  const snapshot = useAppStore((s) => s.snapshot)
  const online = useAppStore((s) => s.online)
  const savePreferences = useAppStore((s) => s.savePreferences)
  const saveCallPreferences = useAppStore((s) => s.saveCallPreferences)
  const saveMedicineCallSettings = useAppStore((s) => s.saveMedicineCallSettings)
  const setToast = useAppStore((s) => s.setToast)
  const [permission, setPermission] = useState(notificationPermission())

  const prefs =
    snapshot?.preferences.find((p) => p.user_id === profile?.id) ?? null
  const callPrefs =
    snapshot?.callPreferences.find((p) => p.user_id === profile?.id) ?? null
  const medicineCallSettings = snapshot?.medicineCallSettings ?? []
  const myMedications =
    snapshot?.medications.filter((m) => m.patient_id === profile?.id) ?? []
  const myMedicationIds = new Set(myMedications.map((m) => m.id))
  const mySchedules =
    snapshot?.schedules.filter((s) => myMedicationIds.has(s.medication_id)) ?? []

  const form = useForm<PreferencesFormValues>({
    resolver: zodResolver(preferencesSchema),
    values: prefs
      ? {
          grace_period_minutes: prefs.grace_period_minutes,
          browser_notifications: prefs.browser_notifications,
          in_app_alerts: prefs.in_app_alerts,
          caregiver_alerts_enabled: prefs.caregiver_alerts_enabled,
          include_med_details: prefs.include_med_details,
          reminder_minutes_before: prefs.reminder_minutes_before,
        }
      : {
          grace_period_minutes: 60,
          browser_notifications: false,
          in_app_alerts: true,
          caregiver_alerts_enabled: true,
          include_med_details: false,
          reminder_minutes_before: 0,
        },
  })

  if (!profile || !prefs) return null

  async function onSubmit(values: PreferencesFormValues) {
    if (!prefs) return
    await savePreferences({ ...prefs, ...values })
    setToast(t('reminders.savedToast'))
  }

  async function saveVoice(
    nextPrefs: CallPreferences,
    settings: MedicineCallSettings[],
  ) {
    await saveCallPreferences(nextPrefs)
    for (const s of settings) {
      await saveMedicineCallSettings(s)
    }
  }

  async function enableBrowserNotifications() {
    const result = await requestNotificationPermission()
    setPermission(result)
    if (result === 'granted') {
      form.setValue('browser_notifications', true)
      setToast(t('reminders.browserEnabled'))
    }
  }

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">{t('reminders.title')}</h1>
        <p className="mt-1 text-base text-slate-600">{t('reminders.subtitle')}</p>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} noValidate className="card flex flex-col gap-5">
        <div>
          <label className="label" htmlFor="grace">
            {t('reminders.gracePeriod')} — {form.watch('grace_period_minutes')} {t('common.minutes')}
          </label>
          <input
            id="grace"
            type="range"
            min={5}
            max={240}
            step={5}
            className="w-full accent-brand-700"
            {...form.register('grace_period_minutes', { valueAsNumber: true })}
          />
          <p className="mt-1 text-sm text-slate-500">{t('reminders.graceHint')}</p>
        </div>

        <div>
          <label className="label" htmlFor="before">
            {t('reminders.reminderBefore')} — {form.watch('reminder_minutes_before')} {t('common.minutes')}
          </label>
          <input
            id="before"
            type="range"
            min={0}
            max={120}
            step={5}
            className="w-full accent-brand-700"
            {...form.register('reminder_minutes_before', { valueAsNumber: true })}
          />
        </div>

        <Toggle
          label={t('reminders.inAppAlerts')}
          checked={form.watch('in_app_alerts')}
          onChange={(v) => form.setValue('in_app_alerts', v)}
        />
        <Toggle
          label={t('reminders.caregiverAlerts')}
          checked={form.watch('caregiver_alerts_enabled')}
          onChange={(v) => form.setValue('caregiver_alerts_enabled', v)}
        />
        <Toggle
          label={t('reminders.includeDetails')}
          hint={t('reminders.includeDetailsHint')}
          checked={form.watch('include_med_details')}
          onChange={(v) => form.setValue('include_med_details', v)}
        />

        <div className="rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2">
            <Bell size={20} className="text-brand-700" aria-hidden="true" />
            <h2 className="text-lg font-bold text-slate-900">
              {t('reminders.browserNotifications')}
            </h2>
          </div>
          <p className="mt-1 text-base text-slate-600">{t('reminders.browserHint')}</p>
          {!notificationsSupported() ? (
            <p className="mt-2 text-base font-medium text-amber-800">
              {t('reminders.browserUnsupported')}
            </p>
          ) : permission === 'denied' ? (
            <p className="mt-2 text-base font-medium text-red-800">
              {t('reminders.browserDenied')}
            </p>
          ) : permission === 'granted' ? (
            <p className="mt-2 text-base font-medium text-green-800">
              {t('reminders.browserEnabled')}
            </p>
          ) : (
            <button
              type="button"
              className="btn-secondary mt-3"
              onClick={() => void enableBrowserNotifications()}
            >
              {t('reminders.browserEnable')}
            </button>
          )}
        </div>

        <button type="submit" className="btn-primary" disabled={form.formState.isSubmitting}>
          {t('reminders.savePrefs')}
        </button>
      </form>

      <div className="card flex gap-3 border-brand-200 bg-brand-50">
        <Info size={22} className="mt-0.5 shrink-0 text-brand-700" aria-hidden="true" />
        <div>
          <h2 className="text-lg font-bold text-slate-900">{t('reminders.limitationsTitle')}</h2>
          <p className="mt-1 text-base text-slate-700">{t('reminders.limitationsText')}</p>
        </div>
      </div>

      <div className="card flex flex-col gap-5">
        {!callsConfigured() ? (
          <ProviderUnavailableNotice reason="not_configured" />
        ) : !online ? (
          <ProviderUnavailableNotice reason="offline" />
        ) : null}
        <VoiceReminderSettings
          prefs={callPrefs}
          userId={profile.id}
          medications={myMedications}
          schedules={mySchedules}
          medicineSettings={medicineCallSettings}
          onSave={saveVoice}
        />
      </div>

      <div className="card">
        <ConsentSettings
          prefs={callPrefs}
          userId={profile.id}
          onSave={(next) => saveCallPreferences(next)}
        />
      </div>
    </div>
  )
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3">
      <span>
        <span className="block text-base font-semibold text-slate-900">{label}</span>
        {hint ? <span className="block text-sm text-slate-500">{hint}</span> : null}
      </span>
      <input
        type="checkbox"
        className="mt-1 h-6 w-6 shrink-0 accent-brand-700"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  )
}
