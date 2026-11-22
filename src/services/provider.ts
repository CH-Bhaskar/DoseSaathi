/* DataProvider — the single interface the store talks to. Backed by
 * Supabase (supabaseProvider); when Supabase is not configured the
 * provider throws 'supabase.notConfigured' instead of returning data. */
import type {
  AuditEvent,
  CallPreferences,
  CaregiverConnection,
  ConnectionStatus,
  DoseEvent,
  DoseSource,
  DoseStatus,
  FollowUpNote,
  HealthcareConnection,
  Medication,
  MedicationImage,
  MedicationSchedule,
  MedicationStatus,
  MedicineCallSettings,
  NotificationLog,
  NotificationPreferences,
  PatientPrivateSettings,
  Profile,
  Role,
  SupportRequest,
} from '../types'
import type {
  CallAttempt,
  CallHistoryEntry,
  CallResponse,
} from '../types/calls'

export interface SessionUser {
  id: string
  email: string
  role: Role
  full_name: string
}

export interface Snapshot {
  profiles: Profile[]
  medications: Medication[]
  schedules: MedicationSchedule[]
  doseEvents: DoseEvent[]
  caregiverConnections: CaregiverConnection[]
  healthcareConnections: HealthcareConnection[]
  preferences: NotificationPreferences[]
  notificationLogs: NotificationLog[]
  followUpNotes: FollowUpNote[]
  supportRequests: SupportRequest[]
  /** Photo metadata the user may see (owner + active caregivers). The
   * photo bytes themselves are fetched on demand, never in a snapshot. */
  medicationImages: MedicationImage[]
  /** Voice-call preferences — owner-only rows. */
  callPreferences: CallPreferences[]
  /** Per-medicine call toggles — owner-only rows. */
  medicineCallSettings: MedicineCallSettings[]
  /** Patient-private settings — owner-only rows, never shared. */
  patientPrivateSettings: PatientPrivateSettings[]
}

export interface MedicationInput {
  /** Client-generated id, so offline-queue replays are idempotent. */
  id?: string
  name: string
  brand_name: string | null
  strength: string
  form: Medication['form']
  instructions: string
  dose_amount: string
  frequency: Medication['frequency']
  start_date: string
  end_date: string | null
  prescriber_name: string | null
  notes: string | null
  times: { time_of_day: string; food_rule: MedicationSchedule['food_rule']; days_of_week: number[] }[]
}

export interface DoseRecordInput {
  schedule_id: string
  patient_id: string
  medication_id: string
  scheduled_date: string
  scheduled_time: string
  status: DoseStatus
  note?: string | null
  snoozed_until?: string | null
  /** Where the confirmation came from (007 `dose_events.source`).
   * Defaults to 'app'; the call-history dialog passes 'call'. */
  source?: DoseSource
  /** The call attempt this confirmation came from, when source is 'call'. */
  call_attempt_id?: string | null
}

export interface DataProvider {
  getSession(): Promise<SessionUser | null>
  signIn(email: string, password: string): Promise<SessionUser>
  signUp(input: {
    full_name: string
    email: string
    password: string
    role: Role
  }): Promise<SessionUser>
  signOut(): Promise<void>

  /** Everything the signed-in user is allowed to see. */
  fetchSnapshot(userId: string): Promise<Snapshot>

  upsertProfile(profile: Profile): Promise<void>
  saveMedication(
    patientId: string,
    input: MedicationInput,
    existingId?: string,
  ): Promise<Medication>
  deleteMedication(id: string): Promise<void>
  setMedicationStatus(id: string, status: MedicationStatus): Promise<void>

  /** Upsert by (schedule_id, scheduled_date, scheduled_time) — idempotent. */
  recordDose(input: DoseRecordInput): Promise<DoseEvent>

  savePreferences(prefs: NotificationPreferences): Promise<void>

  /** Upload a medicine photo. The blob is already edited (rotated /
   * cropped) by the caller. `ocrText` is suggestion-only text the user
   * read from the photo; `ocrConfirmed` records that they checked it
   * against their prescription. */
  uploadMedicationPhoto(
    medicationId: string,
    blob: Blob,
    fileName: string,
    ocrText?: string | null,
    ocrConfirmed?: boolean,
  ): Promise<MedicationImage>
  /** A URL an <img> can use: a short-lived signed URL. Never a public
   * URL. Callers revoke object URLs when done. */
  getMedicationPhotoUrl(image: MedicationImage): Promise<string>
  deleteMedicationPhoto(imageId: string): Promise<void>
  updateMedicationPhotoOcr(
    imageId: string,
    ocrText: string | null,
    confirmed: boolean,
  ): Promise<void>

  /** Upsert by user_id. */
  saveCallPreferences(prefs: CallPreferences): Promise<void>
  /** Upsert by (user_id, medication_id). */
  saveMedicineCallSettings(settings: MedicineCallSettings): Promise<void>
  /** Upsert by user_id. Owner-only: providers must never return another
   * user's private settings. */
  savePatientPrivateSettings(settings: PatientPrivateSettings): Promise<void>

  /** Call history for one patient: attempts + responses + medicine
   * names, newest first. RLS (007) limits reads to the patient and
   * their active caregivers. */
  fetchCallHistory(patientId: string): Promise<CallHistoryEntry[]>
  /** One attempt with its responses, or null when it does not exist
   * (or the caller may not see it). */
  fetchCallAttempt(id: string): Promise<{
    attempt: CallAttempt
    responses: CallResponse[]
  } | null>
  /** The patient asked for help from a call record. The
   * `flag_call_help` RPC (008) sets escalation_status='pending' — the
   * browser cannot write call_attempts directly (007 has no client
   * update policy). The caregiver alert itself is still consent-gated
   * server-side; this only flags the request. */
  flagCallHelp(attemptId: string): Promise<void>

  /** Append one audit event (003 `audit_events`). Clients may only log
   * their own actions (004 RLS). Audit writes are best-effort: callers
   * must never fail a user action because logging failed. */
  addAuditEvent(event: Omit<AuditEvent, 'id' | 'created_at'>): Promise<void>

  inviteCaregiver(patientId: string, email: string, name: string | null): Promise<CaregiverConnection>
  updateCaregiverConnection(id: string, status: ConnectionStatus): Promise<void>
  inviteHealthcare(patientId: string, email: string, name: string | null): Promise<HealthcareConnection>
  updateHealthcareConnection(id: string, status: ConnectionStatus): Promise<void>

  addNotificationLog(log: Omit<NotificationLog, 'id' | 'created_at'>): Promise<void>
  addFollowUpNote(note: Omit<FollowUpNote, 'id' | 'created_at'>): Promise<void>
  addSupportRequest(req: Omit<SupportRequest, 'id' | 'created_at'>): Promise<void>
  updateSupportRequest(id: string, status: SupportRequest['status']): Promise<void>
}
