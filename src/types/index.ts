/* DoseSaathi domain types. These mirror the Supabase tables in
 * supabase/migrations/ so the provider and the store share one shape. */

export type Role =
  | 'patient'
  | 'caregiver'
  | 'healthcare_professional'
  | 'admin'

export type MedicationForm =
  | 'tablet'
  | 'capsule'
  | 'liquid'
  | 'injection'
  | 'inhaler'
  | 'drops'
  | 'cream'
  | 'other'

export type Frequency =
  | 'once_daily'
  | 'twice_daily'
  | 'three_times_daily'
  | 'four_times_daily'
  | 'as_needed'
  | 'weekly'
  | 'custom'

export type MedicationStatus = 'active' | 'paused' | 'completed'

export type DoseStatus = 'pending' | 'taken' | 'missed' | 'skipped'

/** Where a dose confirmation came from (007 `dose_events.source`).
 * 'call' means the patient confirmed on a voice-call reminder (keypad,
 * speech, or the in-app dialog opened from a call record); 'caregiver'
 * is reserved — caregivers never record doses for the patient today. */
export type DoseSource = 'app' | 'call' | 'caregiver'

export type ConnectionStatus = 'pending' | 'active' | 'revoked'

export type FoodRule = 'none' | 'before' | 'with' | 'after'

export type NotificationChannel = 'in_app' | 'email' | 'sms'
export type NotificationType =
  | 'dose_reminder'
  | 'missed_dose_alert'
  | 'caregiver_invite'
  | 'system'

export interface Profile {
  id: string
  full_name: string
  email: string
  phone: string | null
  role: Role
  preferred_language: string
  timezone: string
  caregiver_contact: string | null
  onboarding_completed: boolean
  created_at: string
  updated_at: string
}

export interface Medication {
  id: string
  patient_id: string
  name: string
  brand_name: string | null
  strength: string
  form: MedicationForm
  instructions: string
  dose_amount: string
  frequency: Frequency
  start_date: string // YYYY-MM-DD
  end_date: string | null
  prescriber_name: string | null
  notes: string | null
  status: MedicationStatus
  created_at: string
  updated_at: string
}

export interface MedicationSchedule {
  id: string
  medication_id: string
  /** HH:MM, 24-hour clock */
  time_of_day: string
  /** ISO day numbers 1=Mon..7=Sun; null/empty means every day */
  days_of_week: number[] | null
  food_rule: FoodRule
  created_at: string
}

export interface DoseEvent {
  id: string
  schedule_id: string
  patient_id: string
  medication_id: string
  scheduled_date: string // YYYY-MM-DD
  scheduled_time: string // HH:MM
  status: DoseStatus
  action_at: string | null
  note: string | null
  snoozed_until: string | null
  /** Confirmation source (007). Defaults to 'app'. */
  source: DoseSource
  /** The call attempt this confirmation came from, when source is 'call'. */
  call_attempt_id: string | null
  created_at: string
  updated_at: string
}

export interface CaregiverConnection {
  id: string
  patient_id: string
  caregiver_id: string | null
  invited_email: string
  caregiver_name: string | null
  status: ConnectionStatus
  created_at: string
  updated_at: string
}

export interface NotificationPreferences {
  id: string
  user_id: string
  grace_period_minutes: number
  browser_notifications: boolean
  in_app_alerts: boolean
  caregiver_alerts_enabled: boolean
  include_med_details: boolean
  reminder_minutes_before: number
  created_at: string
  updated_at: string
}

export interface NotificationLog {
  id: string
  patient_id: string
  recipient_id: string | null
  recipient_email: string | null
  type: NotificationType
  channel: NotificationChannel
  message: string
  status: 'queued' | 'delivered' | 'failed' | 'unavailable'
  created_at: string
}

export interface HealthcareConnection {
  id: string
  patient_id: string
  professional_id: string | null
  invited_email: string
  professional_name: string | null
  status: ConnectionStatus
  created_at: string
  updated_at: string
}

export interface FollowUpNote {
  id: string
  patient_id: string
  author_id: string
  author_name: string | null
  note: string
  created_at: string
}

export interface AuditEvent {
  id: string
  user_id: string | null
  action: string
  entity: string | null
  entity_id: string | null
  /** Extra context (003 `details` jsonb) — never personal health detail
   * beyond what the action itself names. */
  details: Record<string, unknown> | null
  created_at: string
}

export interface SupportRequest {
  id: string
  user_id: string
  subject: string
  message: string
  status: 'open' | 'resolved'
  created_at: string
}

/** Voice-call language. Matches the `language` check in 006. */
export type CallLanguage = 'en' | 'kn'

/** One photo of a medicine, stored in the private `medication-photos`
 * Storage bucket (005). `ocr_text` is a suggestion only — the app never
 * infers a dosage, schedule, or instruction from it. */
export interface MedicationImage {
  id: string
  medication_id: string
  patient_id: string
  /** `<patient_id>/<image_id>.<ext>` inside the private bucket. Never a
   * public URL — clients download through signed URLs. */
  storage_path: string
  file_name: string
  mime_type: string
  file_size: number
  ocr_text: string | null
  ocr_confirmed: boolean
  created_at: string
}

/** Voice-call reminder preferences (006 `call_preferences`). One row per
 * user; read by the server-side call queue before any call is made. */
export interface CallPreferences {
  id: string
  user_id: string
  calls_enabled: boolean
  paused: boolean
  phone_number: string | null
  language: CallLanguage
  voice_name: string | null
  speech_rate: number
  retry_count: number
  retry_delay_minutes: number
  /** HH:MM, 24-hour clock */
  quiet_hours_start: string
  /** HH:MM, 24-hour clock */
  quiet_hours_end: string
  escalation_enabled: boolean
  escalation_delay_minutes: number
  speak_medicine_details: boolean
  consent_calls: boolean
  consent_escalation: boolean
  consent_calls_changed_at: string | null
  created_at: string
  updated_at: string
}

/** Per-medicine voice-call toggle (006 `medicine_call_settings`).
 * Absence of a row means the default: calls on for that medicine. */
export interface MedicineCallSettings {
  id: string
  user_id: string
  medication_id: string
  calls_enabled: boolean
}

/** Patient-private settings (006 `patient_private_settings`). Owner-only:
 * caregivers, health professionals, and admins must NEVER read this
 * table, and its contents must never appear in calls, notifications, or
 * dashboards. The pregnancy fields only help the patient follow
 * clinician-provided instructions. */
export interface PatientPrivateSettings {
  user_id: string
  pregnancy_opt_in: boolean
  pregnancy_clinician_note: string | null
  pregnancy_visible_to_caregiver: boolean
  created_at: string
  updated_at: string
}

/* ---- Derived / UI types ------------------------------------------------- */

/** One dose on one day: a schedule row joined to its medication and the
 * recorded dose event (if any). Built by lib/doseLogic. */
export interface DayDose {
  key: string
  schedule_id: string
  medication_id: string
  medication_name: string
  brand_name: string | null
  strength: string
  form: MedicationForm
  dose_amount: string
  instructions: string
  food_rule: FoodRule
  scheduled_date: string
  scheduled_time: string
  hour: number
  status: DoseStatus
  event_id: string | null
  action_at: string | null
  note: string | null
  snoozed_until: string | null
}

/** A transparent, rule-based warning about a medication entry. The app
 * never claims clinical safety; it only names what the user entered. */
export interface ConflictWarning {
  kind: 'duplicate' | 'overlap' | 'same_time'
  messageKey: string
  details: string
}

export interface AdherenceDay {
  date: string
  label: string
  taken: number
  missed: number
  skipped: number
  pending: number
  total: number
  percent: number
}

export interface AdherenceSummary {
  days: AdherenceDay[]
  totalDoses: number
  taken: number
  missed: number
  skipped: number
  percent: number
  currentStreakDays: number
}

/** A pending mutation waiting for connectivity. Stored in IndexedDB. */
export interface OutboxItem {
  id: string
  kind:
    | 'dose_event'
    | 'medication'
    | 'medication_delete'
    | 'profile'
    | 'preferences'
    | 'call_preferences'
    | 'medicine_call_settings'
    | 'private_settings'
    | 'connection'
  payload: Record<string, unknown>
  created_at: string
  attempts: number
  last_error: string | null
}

export type SyncState = 'synced' | 'pending' | 'syncing' | 'error'

export interface InAppAlert {
  id: string
  patient_id: string
  patient_name: string
  message: string
  created_at: string
  read: boolean
}
