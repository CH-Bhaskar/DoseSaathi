/* Shared types for the DoseSaathi voice-call Edge Functions.
 * These mirror supabase/migrations/006_call_prefs.sql (call_preferences,
 * medicine_call_settings) and 007_call_attempts.sql (call_attempts,
 * call_responses, dose_events.source). Cross-checked against the real
 * 006 file: quiet_hours are NOT NULL time with 21:00/07:00 defaults,
 * speech_rate is numeric, medicine_call_settings has no timestamps.
 *
 * This module is pure TypeScript with no Deno-only imports, so it is
 * unit-testable under Node (vitest). */

export type CallAttemptStatus =
  | 'queued'
  | 'calling'
  | 'completed'
  | 'no_answer'
  | 'busy'
  | 'failed'
  | 'voicemail'
  | 'cancelled'

export type CallResponseType = 'keypad' | 'speech' | 'none'

export type EscalationStatus = 'none' | 'pending' | 'notified' | 'declined'

export type CallLanguage = 'en' | 'kn'

/** Twilio <Gather> language codes, per the patient's preference. */
export const TWILIO_GATHER_LANGUAGE: Record<CallLanguage, string> = {
  en: 'en-IN',
  kn: 'kn-IN',
}

/** Voice-call preferences — mirrors call_preferences (migration 006). */
export interface CallPreferences {
  user_id: string
  calls_enabled: boolean
  paused: boolean
  phone_number: string | null
  language: CallLanguage
  voice_name: string | null
  /** Twilio <Say> rate as a decimal string, e.g. '0.9'. 1.0 = normal. */
  speech_rate: number
  /** Retries after a failed/unanswered call. Hard-capped at 3. */
  retry_count: number
  retry_delay_minutes: number
  quiet_hours_start: string
  quiet_hours_end: string
  escalation_enabled: boolean
  escalation_delay_minutes: number
  speak_medicine_details: boolean
  consent_calls: boolean
  consent_escalation: boolean
  consent_calls_changed_at: string | null
}

/** Per-medicine call opt-in — mirrors medicine_call_settings (006). */
export interface MedicineCallSettings {
  user_id: string
  medication_id: string
  calls_enabled: boolean
}

/** One row of call_attempts (007), as the functions read it. */
export interface CallAttemptRow {
  id: string
  patient_id: string
  medication_id: string
  schedule_id: string
  dose_event_id: string | null
  scheduled_for: string
  attempt_number: number
  status: CallAttemptStatus
  provider: string
  provider_call_sid: string | null
  idempotency_key: string
  retry_count: number
  next_retry_at: string | null
  escalation_status: EscalationStatus
  created_at: string
  updated_at: string
}

/** One row of call_responses (007). */
export interface CallResponseRow {
  id: string
  call_attempt_id: string
  response_type: CallResponseType
  key_pressed: string | null
  speech_text: string | null
  confirmed: boolean
  recorded_at: string
}

/** A dose that is due now, as the scanner reads it (dose_events joined to
 * its medication and schedule). */
export interface DueDose {
  dose_event_id: string | null
  schedule_id: string
  medication_id: string
  patient_id: string
  scheduled_date: string
  scheduled_time: string
  /** UTC instant the dose is due, ISO 8601. */
  scheduled_for: string
  medication_name: string
  dose_amount: string
}

/** The minimum the scanner needs from profiles. */
export interface PatientCallInfo {
  id: string
  full_name: string | null
  timezone: string
  preferred_language: string
}
