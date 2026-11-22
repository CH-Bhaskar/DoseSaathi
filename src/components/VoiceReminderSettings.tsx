/* Voice-call reminder settings: enable/pause, phone number, retry and
 * quiet hours, escalation, speak-details flag, and per-medicine call
 * toggles. Call days/times are DERIVED ONLY from the saved prescription
 * schedule — this form never invents a call time.
 *
 * Consent lives in ConsentSettings: calls cannot be switched on until
 * call consent is granted there. Language/voice/speed live in
 * LanguageVoiceSelector, embedded here so the whole voice setup is one
 * save. */
import { useEffect, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { Phone } from 'lucide-react'
import { defaultCallPreferences } from '../lib/callPrefs'
import { formatTime12h } from '../lib/time'
import { useAppStore } from '../store/appStore'
import type {
  CallPreferences,
  Medication,
  MedicationSchedule,
  MedicineCallSettings,
} from '../types'
import {
  callPreferencesSchema,
  type CallPreferencesFormValues,
} from '../validation/extension'
import AccessibleActionButton from './AccessibleActionButton'
import LanguageVoiceSelector, { type VoiceChoice } from './LanguageVoiceSelector'

const RETRY_DELAY_OPTIONS = [5, 10, 15, 30]
const ESCALATION_DELAY_OPTIONS = [15, 30, 60, 120]
const DAY_KEYS = ['dayMon', 'dayTue', 'dayWed', 'dayThu', 'dayFri', 'daySat', 'daySun']

export default function VoiceReminderSettings({
  prefs,
  userId,
  medications,
  schedules,
  medicineSettings,
  onSave,
}: {
  prefs: CallPreferences | null
  userId: string
  medications: Medication[]
  schedules: MedicationSchedule[]
  medicineSettings: MedicineCallSettings[]
  onSave: (
    prefs: CallPreferences,
    settings: MedicineCallSettings[],
  ) => Promise<void>
}) {
  const { t } = useTranslation()
  const setToast = useAppStore((s) => s.setToast)
  const profile = useAppStore((s) => s.profile)
  const appLanguage = useAppStore((s) => s.language)

  const current =
    prefs ??
    defaultCallPreferences(userId, profile?.preferred_language, appLanguage)
  const consentGiven = current.consent_calls

  const form = useForm<CallPreferencesFormValues>({
    resolver: zodResolver(callPreferencesSchema),
    values: {
      calls_enabled: current.calls_enabled,
      paused: current.paused,
      phone_number: current.phone_number ?? '',
      language: current.language,
      voice_name: current.voice_name ?? '',
      speech_rate: current.speech_rate,
      retry_count: current.retry_count,
      retry_delay_minutes: current.retry_delay_minutes,
      quiet_hours_start: current.quiet_hours_start,
      quiet_hours_end: current.quiet_hours_end,
      escalation_enabled: current.escalation_enabled,
      escalation_delay_minutes: current.escalation_delay_minutes,
      speak_medicine_details: current.speak_medicine_details,
      consent_calls: current.consent_calls,
      consent_escalation: current.consent_escalation,
    },
  })

  // Per-medicine toggles: a row with calls_enabled=false opts a medicine
  // out; no row means the default (calls on).
  const activeMedications = medications.filter((m) => m.status === 'active')
  const [perMedicine, setPerMedicine] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      activeMedications.map((m) => [
        m.id,
        medicineSettings.find((s) => s.medication_id === m.id)?.calls_enabled ?? true,
      ]),
    ),
  )
  // Re-sync when the snapshot refreshes (e.g. after a consent change).
  useEffect(() => {
    setPerMedicine(
      Object.fromEntries(
        activeMedications.map((m) => [
          m.id,
          medicineSettings.find((s) => s.medication_id === m.id)?.calls_enabled ?? true,
        ]),
      ),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medicineSettings, medications])

  async function onSubmit(values: CallPreferencesFormValues) {
    const saved: CallPreferences = {
      ...current,
      calls_enabled: values.calls_enabled,
      paused: values.paused,
      phone_number: values.phone_number?.trim() || null,
      language: values.language,
      voice_name: values.voice_name?.trim() || null,
      speech_rate: values.speech_rate,
      retry_count: values.retry_count,
      retry_delay_minutes: values.retry_delay_minutes,
      quiet_hours_start: values.quiet_hours_start,
      quiet_hours_end: values.quiet_hours_end,
      escalation_enabled: values.escalation_enabled,
      escalation_delay_minutes: values.escalation_delay_minutes,
      speak_medicine_details: values.speak_medicine_details,
    }
    const settings: MedicineCallSettings[] = activeMedications.map((m) => {
      const existing = medicineSettings.find((s) => s.medication_id === m.id)
      return {
        id: existing?.id ?? crypto.randomUUID(),
        user_id: userId,
        medication_id: m.id,
        calls_enabled: perMedicine[m.id] ?? true,
      }
    })
    await onSave(saved, settings)
    setToast(t('voiceCalls.savedToast'))
  }

  const voiceChoice: VoiceChoice = {
    language: form.watch('language'),
    voiceName: form.watch('voice_name') || null,
    speechRate: form.watch('speech_rate'),
  }
  function onVoiceChange(v: VoiceChoice) {
    form.setValue('language', v.language, { shouldValidate: true })
    form.setValue('voice_name', v.voiceName ?? '', { shouldValidate: true })
    form.setValue('speech_rate', v.speechRate, { shouldValidate: true })
  }

  const err = (key: keyof CallPreferencesFormValues) => {
    const message = form.formState.errors[key]?.message
    return message ? <p className="field-error">{t(message as string)}</p> : null
  }

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      noValidate
      className="flex flex-col gap-5"
      data-testid="voice-reminder-settings"
    >
      <div>
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">
          <Phone size={22} className="text-brand-700" aria-hidden="true" />
          {t('voiceCalls.title')}
        </h2>
        <p className="mt-1 text-base text-slate-600">{t('voiceCalls.subtitle')}</p>
        {/* The not-configured / offline notice lives in the parent page
          (ReminderSettingsPage renders ProviderUnavailableNotice above
          this form), so it is not duplicated here. */}
      </div>

      {current.paused && current.calls_enabled ? (
        <p className="text-base font-semibold text-amber-800" role="status">
          {t('voiceCalls.callsPausedNote')}
        </p>
      ) : null}

      <Toggle
        label={t('voiceCalls.enableCalls')}
        hint={t('voiceCalls.enableCallsHint')}
        checked={form.watch('calls_enabled')}
        disabled={!consentGiven}
        onChange={(v) => form.setValue('calls_enabled', v)}
        testId="voice-enable-calls"
      />
      {!consentGiven ? (
        <p className="text-base text-slate-600">{t('voiceCalls.consentRequiredHint')}</p>
      ) : null}

      <div>
        <label className="label" htmlFor="voice-phone">
          {t('voiceCalls.phoneNumber')}
        </label>
        <input
          id="voice-phone"
          type="tel"
          className="input"
          placeholder="+91 98765 43210"
          {...form.register('phone_number')}
          data-testid="voice-phone"
        />
        {err('phone_number')}
      </div>

      <Toggle
        label={t('voiceCalls.paused')}
        hint={t('voiceCalls.pauseHint')}
        checked={form.watch('paused')}
        onChange={(v) => form.setValue('paused', v)}
        testId="voice-paused"
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="voice-retry">
            {t('voiceCalls.retryCount')}
          </label>
          <select
            id="voice-retry"
            className="input"
            {...form.register('retry_count', { valueAsNumber: true })}
            data-testid="voice-retry-count"
          >
            {[0, 1, 2, 3].map((n) => (
              <option key={n} value={n}>
                {t(`voiceCalls.retry${n}`)}
              </option>
            ))}
          </select>
          {err('retry_count')}
        </div>
        <div>
          <label className="label" htmlFor="voice-retry-delay">
            {t('voiceCalls.retryDelay')}
          </label>
          <select
            id="voice-retry-delay"
            className="input"
            {...form.register('retry_delay_minutes', { valueAsNumber: true })}
          >
            {RETRY_DELAY_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} {t('common.minutes')}
              </option>
            ))}
          </select>
        </div>
      </div>

      <fieldset>
        <legend className="label">{t('voiceCalls.quietHours')}</legend>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="voice-quiet-start">
              {t('voiceCalls.quietHoursStart')}
            </label>
            <input
              id="voice-quiet-start"
              type="time"
              className="input"
              {...form.register('quiet_hours_start')}
              data-testid="voice-quiet-start"
            />
            {err('quiet_hours_start')}
          </div>
          <div>
            <label className="label" htmlFor="voice-quiet-end">
              {t('voiceCalls.quietHoursEnd')}
            </label>
            <input
              id="voice-quiet-end"
              type="time"
              className="input"
              {...form.register('quiet_hours_end')}
              data-testid="voice-quiet-end"
            />
            {err('quiet_hours_end')}
          </div>
        </div>
      </fieldset>

      <Toggle
        label={t('voiceCalls.escalation')}
        hint={t('voiceCalls.escalationHint')}
        checked={form.watch('escalation_enabled')}
        onChange={(v) => form.setValue('escalation_enabled', v)}
        testId="voice-escalation"
      />
      {err('escalation_enabled')}
      {form.watch('escalation_enabled') ? (
        <div>
          <label className="label" htmlFor="voice-escalation-delay">
            {t('voiceCalls.escalationDelay')}
          </label>
          <select
            id="voice-escalation-delay"
            className="input"
            {...form.register('escalation_delay_minutes', { valueAsNumber: true })}
          >
            {ESCALATION_DELAY_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n} {t('common.minutes')}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <Toggle
        label={t('voiceCalls.speakDetails')}
        hint={t('voiceCalls.speakDetailsHint')}
        checked={form.watch('speak_medicine_details')}
        onChange={(v) => form.setValue('speak_medicine_details', v)}
        testId="voice-speak-details"
      />

      <LanguageVoiceSelector value={voiceChoice} onChange={onVoiceChange} />
      {err('speech_rate')}

      <fieldset>
        <legend className="text-lg font-bold text-slate-900">{t('voiceCalls.perMedicine')}</legend>
        <p className="mt-1 text-base text-slate-600">{t('voiceCalls.perMedicineHint')}</p>
        <div className="mt-3 flex flex-col gap-3">
          {activeMedications.length === 0 ? (
            <p className="text-base text-slate-600">{t('meds.noMeds')}</p>
          ) : (
            activeMedications.map((m) => {
              const medSchedules = schedules
                .filter((s) => s.medication_id === m.id)
                .slice()
                .sort((a, b) => a.time_of_day.localeCompare(b.time_of_day))
              const days = medSchedules[0]?.days_of_week
              const dayLabel =
                !days || days.length === 0 || days.length === 7
                  ? t('meds.everyDay')
                  : days.map((d) => t(`meds.${DAY_KEYS[d - 1]}`)).join(', ')
              const on = perMedicine[m.id] ?? true
              return (
                <label
                  key={m.id}
                  className="flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3"
                >
                  <span>
                    <span className="block text-base font-semibold text-slate-900">
                      {m.name} {m.strength}
                    </span>
                    <span className="block text-sm text-slate-500">
                      {medSchedules.map((s) => formatTime12h(s.time_of_day)).join(' · ')}
                      {` · ${dayLabel}`}
                    </span>
                    <span className="block text-sm font-medium text-slate-600">
                      {on ? t('voiceCalls.callsOn') : t('voiceCalls.callsOff')}
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    className="mt-1 h-6 w-6 shrink-0 accent-brand-700"
                    checked={on}
                    onChange={(e) =>
                      setPerMedicine((prev) => ({ ...prev, [m.id]: e.target.checked }))
                    }
                    data-testid={`voice-medicine-${m.id}`}
                  />
                </label>
              )
            })
          )}
        </div>
      </fieldset>

      <AccessibleActionButton
        type="submit"
        variant="primary"
        disabled={form.formState.isSubmitting}
        data-testid="voice-save"
      >
        {t('voiceCalls.saveSettings')}
      </AccessibleActionButton>
    </form>
  )
}

function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
  testId,
}: {
  label: string
  hint?: string
  checked: boolean
  disabled?: boolean
  onChange: (v: boolean) => void
  testId?: string
}) {
  return (
    <label
      className={`flex items-start justify-between gap-4 rounded-xl border border-slate-200 px-4 py-3 ${
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
      }`}
    >
      <span>
        <span className="block text-base font-semibold text-slate-900">{label}</span>
        {hint ? <span className="block text-sm text-slate-500">{hint}</span> : null}
      </span>
      <input
        type="checkbox"
        className="mt-1 h-6 w-6 shrink-0 accent-brand-700"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        data-testid={testId}
      />
    </label>
  )
}
