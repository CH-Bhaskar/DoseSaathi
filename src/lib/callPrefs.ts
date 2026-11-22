/* Default rows for the call-preference tables (006). Used by the
 * settings UI when the user has no saved row yet — the first save
 * upserts them. Defaults match the database defaults: calls off,
 * consent not given, nothing assumed. */
import { isSupportedLanguage, type SupportedLanguage } from '../i18n'
import type { CallPreferences, PatientPrivateSettings } from '../types'
import { isConfigured } from './supabase'

/** Whether the voice-call service is provisioned. True only when
 * Supabase is configured AND the deployer has set
 * VITE_TWILIO_CONFIGURED=true (see .env.example). The browser cannot
 * detect the server-side Twilio secrets, so this explicit flag is the
 * honest signal — the app never guesses that calls work. */
export function callsConfigured(): boolean {
  return (
    isConfigured && import.meta.env.VITE_TWILIO_CONFIGURED === 'true'
  )
}

/** The call language for a patient who has no saved call preferences
 * yet: their profile's preferred language when it is a supported
 * language, otherwise the app's current language. A Kannada patient
 * who enables calls without touching the language selector must get
 * Kannada calls — defaulting to 'en' here would call them in a
 * language they may not follow. */
export function defaultCallLanguage(
  preferredLanguage?: string | null,
  appLanguage?: SupportedLanguage,
): SupportedLanguage {
  if (preferredLanguage && isSupportedLanguage(preferredLanguage)) {
    return preferredLanguage
  }
  return appLanguage ?? 'en'
}

export function defaultCallPreferences(
  userId: string,
  preferredLanguage?: string | null,
  appLanguage?: SupportedLanguage,
): CallPreferences {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    user_id: userId,
    calls_enabled: false,
    paused: false,
    phone_number: null,
    language: defaultCallLanguage(preferredLanguage, appLanguage),
    voice_name: null,
    speech_rate: 1.0,
    retry_count: 1,
    retry_delay_minutes: 15,
    quiet_hours_start: '21:00',
    quiet_hours_end: '07:00',
    escalation_enabled: false,
    escalation_delay_minutes: 30,
    speak_medicine_details: false,
    consent_calls: false,
    consent_escalation: false,
    consent_calls_changed_at: null,
    created_at: now,
    updated_at: now,
  }
}

export function defaultPatientPrivateSettings(
  userId: string,
): PatientPrivateSettings {
  const now = new Date().toISOString()
  return {
    user_id: userId,
    pregnancy_opt_in: false,
    pregnancy_clinician_note: null,
    pregnancy_visible_to_caregiver: false,
    created_at: now,
    updated_at: now,
  }
}
