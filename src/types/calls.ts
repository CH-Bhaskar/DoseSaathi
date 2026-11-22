/* Voice-call types. These mirror the Supabase tables so the provider
 * and the store share one interface:
 *   - call_preferences + medicine_call_settings: 006_call_prefs.sql
 *     (created by the stages 1–2 pass)
 *   - call_attempts + call_responses + dose_events.source:
 *     007_call_attempts.sql
 *
 * The preference types live in ./index (the canonical home, written by
 * the stages 1–2 pass) and are re-exported here so call code can import
 * everything voice-related from one module. They are NOT redefined
 * here — an earlier draft duplicated them, and duplicated definitions
 * drift. */

import type { DoseStatus } from './index'

export type {
  CallLanguage,
  CallPreferences,
  MedicineCallSettings,
} from './index'

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

/** One row of call_attempts (007). */
export interface CallAttempt {
  id: string
  patient_id: string
  medication_id: string
  schedule_id: string
  dose_event_id: string | null
  /** UTC instant the dose was due, ISO 8601. */
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

/** One row of call_responses (007). A dose is recorded as taken only
 * when a response row has confirmed === true. */
export interface CallResponse {
  id: string
  call_attempt_id: string
  response_type: CallResponseType
  key_pressed: string | null
  speech_text: string | null
  confirmed: boolean
  recorded_at: string
}

/** One row of the call-history list: an attempt, its responses, and
 * the medicine it was about. Built by the provider method
 * fetchCallHistory (lib/callHistory.ts joins the rows). */
export interface CallHistoryEntry {
  attempt: CallAttempt
  responses: CallResponse[]
  medicationName: string
  medicationStrength: string | null
  doseAmount: string
  /** Status of the linked dose event, when one exists. */
  doseStatus: DoseStatus | null
}
