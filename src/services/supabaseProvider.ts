/* Supabase provider: Supabase Auth + PostgreSQL. All access control is
 * enforced by Row Level Security in the database (see
 * supabase/migrations/004_rls.sql); these queries never filter by user
 * beyond what RLS already guarantees, except where the UI needs it.
 *
 * When VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not set, the
 * client is null and every method throws 'supabase.notConfigured'
 * through the central client() guard below — never a crash, never
 * fake data. */
import { supabase } from '../lib/supabase'
import { buildCallHistoryEntries } from '../lib/callHistory'
import { extensionForMime } from '../lib/photo'
import { todayISO } from '../lib/time'
import type {
  AuditEvent,
  CallPreferences,
  CaregiverConnection,
  ConnectionStatus,
  DoseEvent,
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
  SupportRequest,
} from '../types'
import type { CallAttempt, CallResponse } from '../types/calls'
import type {
  DataProvider,
  DoseRecordInput,
  MedicationInput,
  SessionUser,
  Snapshot,
} from './provider'

function client() {
  if (!supabase) throw new Error('supabase.notConfigured')
  return supabase
}

function toSession(profile: Profile, email: string): SessionUser {
  return { id: profile.id, email, role: profile.role, full_name: profile.full_name }
}

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await client()
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data as Profile | null
}

export const supabaseProvider: DataProvider = {
  async getSession(): Promise<SessionUser | null> {
    const { data } = await client().auth.getSession()
    const user = data.session?.user
    if (!user) return null
    const profile = await fetchProfile(user.id)
    if (!profile) return null
    return toSession(profile, user.email ?? profile.email)
  },

  async signIn(email: string, password: string): Promise<SessionUser> {
    const { data, error } = await client().auth.signInWithPassword({
      email,
      password,
    })
    if (error) throw new Error('auth.invalid')
    const user = data.user
    if (!user) throw new Error('auth.invalid')
    const profile = await fetchProfile(user.id)
    if (!profile) throw new Error('profile.missing')
    return toSession(profile, user.email ?? email)
  },

  async signUp(input): Promise<SessionUser> {
    const { data, error } = await client().auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: { full_name: input.full_name, role: input.role },
      },
    })
    if (error) throw error
    const user = data.user
    if (!user) throw new Error('auth.signupFailed')
    // handle_new_user() creates the profile row; poll briefly for it.
    for (let i = 0; i < 10; i++) {
      const profile = await fetchProfile(user.id)
      if (profile) return toSession(profile, user.email ?? input.email)
      await new Promise((r) => setTimeout(r, 300))
    }
    throw new Error('profile.missing')
  },

  async signOut(): Promise<void> {
    await client().auth.signOut()
  },

  async fetchSnapshot(userId: string): Promise<Snapshot> {
    const sb = client()
    const [
      profiles,
      medications,
      schedules,
      doseEvents,
      caregiverConnections,
      healthcareConnections,
      preferences,
      notificationLogs,
      followUpNotes,
      supportRequests,
      medicationImages,
      callPreferences,
      medicineCallSettings,
      patientPrivateSettings,
    ] = await Promise.all([
      sb.from('profiles').select('*'),
      sb.from('medications').select('*').order('name'),
      sb.from('medication_schedules').select('*'),
      sb
        .from('dose_events')
        .select('*')
        .order('scheduled_date', { ascending: false })
        .limit(500),
      sb.from('caregiver_connections').select('*'),
      sb.from('healthcare_connections').select('*'),
      sb.from('notification_preferences').select('*'),
      sb
        .from('notification_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100),
      sb
        .from('follow_up_notes')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100),
      sb.from('support_requests').select('*'),
      sb.from('medication_images').select('*'),
      sb.from('call_preferences').select('*'),
      sb.from('medicine_call_settings').select('*'),
      sb.from('patient_private_settings').select('*'),
    ])
    for (const res of [
      profiles,
      medications,
      schedules,
      doseEvents,
      caregiverConnections,
      healthcareConnections,
      preferences,
      notificationLogs,
      followUpNotes,
      supportRequests,
      medicationImages,
      callPreferences,
      medicineCallSettings,
      patientPrivateSettings,
    ]) {
      if (res.error) throw res.error
    }
    void userId
    return {
      profiles: (profiles.data ?? []) as Profile[],
      medications: (medications.data ?? []) as Medication[],
      schedules: (schedules.data ?? []) as MedicationSchedule[],
      doseEvents: (doseEvents.data ?? []) as DoseEvent[],
      caregiverConnections: (caregiverConnections.data ?? []) as CaregiverConnection[],
      healthcareConnections: (healthcareConnections.data ?? []) as HealthcareConnection[],
      preferences: (preferences.data ?? []) as NotificationPreferences[],
      notificationLogs: (notificationLogs.data ?? []) as NotificationLog[],
      followUpNotes: (followUpNotes.data ?? []) as FollowUpNote[],
      supportRequests: (supportRequests.data ?? []) as SupportRequest[],
      medicationImages: (medicationImages.data ?? []) as MedicationImage[],
      // Postgres `time` columns come back as "21:00:00"; the app uses
      // HH:MM everywhere, so trim the seconds.
      callPreferences: ((callPreferences.data ?? []) as CallPreferences[]).map(
        (p) => ({
          ...p,
          quiet_hours_start: p.quiet_hours_start.slice(0, 5),
          quiet_hours_end: p.quiet_hours_end.slice(0, 5),
        }),
      ),
      medicineCallSettings: (medicineCallSettings.data ?? []) as MedicineCallSettings[],
      patientPrivateSettings: (patientPrivateSettings.data ?? []) as PatientPrivateSettings[],
    }
  },

  async upsertProfile(profile: Profile): Promise<void> {
    const { error } = await client()
      .from('profiles')
      .upsert(profile, { onConflict: 'id' })
    if (error) throw error
  },

  async saveMedication(
    patientId: string,
    input: MedicationInput,
    existingId?: string,
  ): Promise<Medication> {
    const sb = client()
    const { times, ...medFields } = input
    let medId = existingId
    if (existingId) {
      const { error } = await sb
        .from('medications')
        .update({ ...medFields, updated_at: new Date().toISOString() })
        .eq('id', existingId)
      if (error) throw error
      const { error: delError } = await sb
        .from('medication_schedules')
        .delete()
        .eq('medication_id', existingId)
      if (delError) throw delError
    } else {
      // Upsert on the client-generated id: replaying a queued create is safe.
      const insertPayload: Record<string, unknown> = {
        ...medFields,
        patient_id: patientId,
        status: 'active',
      }
      if (!insertPayload['id']) delete insertPayload['id']
      const { data, error } = await sb
        .from('medications')
        .upsert(insertPayload, { onConflict: 'id' })
        .select()
        .single()
      if (error) throw error
      medId = (data as Medication).id
    }
    const { error: schedError } = await sb
      .from('medication_schedules')
      .insert(
        times.map((t) => ({
          medication_id: medId as string,
          time_of_day: t.time_of_day,
          days_of_week: t.days_of_week,
          food_rule: t.food_rule,
        })),
      )
    if (schedError) throw schedError
    const { data, error } = await sb
      .from('medications')
      .select('*')
      .eq('id', medId as string)
      .single()
    if (error) throw error
    return data as Medication
  },

  async deleteMedication(id: string): Promise<void> {
    const { error } = await client().from('medications').delete().eq('id', id)
    if (error) throw error
  },

  async setMedicationStatus(id: string, status: MedicationStatus): Promise<void> {
    const { error } = await client()
      .from('medications')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
  },

  async recordDose(input: DoseRecordInput): Promise<DoseEvent> {
    const payload: Record<string, unknown> = {
      schedule_id: input.schedule_id,
      patient_id: input.patient_id,
      medication_id: input.medication_id,
      scheduled_date: input.scheduled_date,
      scheduled_time: input.scheduled_time,
      status: input.status,
      note: input.note ?? null,
      snoozed_until: input.snoozed_until ?? null,
      action_at:
        input.status === 'pending' ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    // Only include source / call_attempt_id when the caller set them:
    // omitting them keeps the existing row's values on upsert (and the
    // 'app' default on insert).
    if (input.source !== undefined) payload['source'] = input.source
    if (input.call_attempt_id !== undefined) {
      payload['call_attempt_id'] = input.call_attempt_id
    }
    // Idempotent: the unique index on (schedule_id, scheduled_date,
    // scheduled_time) makes replays safe.
    const { data, error } = await client()
      .from('dose_events')
      .upsert(payload, {
        onConflict: 'schedule_id,scheduled_date,scheduled_time',
      })
      .select()
      .single()
    if (error) throw error
    return data as DoseEvent
  },

  async savePreferences(prefs: NotificationPreferences): Promise<void> {
    const { error } = await client()
      .from('notification_preferences')
      .upsert(
        { ...prefs, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      )
    if (error) throw error
  },

  async uploadMedicationPhoto(
    medicationId: string,
    blob: Blob,
    fileName: string,
    ocrText?: string | null,
    ocrConfirmed?: boolean,
  ): Promise<MedicationImage> {
    const sb = client()
    const { data: med, error: medError } = await sb
      .from('medications')
      .select('patient_id')
      .eq('id', medicationId)
      .single()
    if (medError) throw medError
    const patientId = (med as { patient_id: string }).patient_id
    const imageId = crypto.randomUUID()
    const storagePath = `${patientId}/${imageId}.${extensionForMime(blob.type)}`
    const { error: uploadError } = await sb.storage
      .from('medication-photos')
      .upload(storagePath, blob, {
        contentType: blob.type,
        upsert: false,
      })
    if (uploadError) throw uploadError
    const { data, error } = await sb
      .from('medication_images')
      .insert({
        id: imageId,
        medication_id: medicationId,
        patient_id: patientId,
        storage_path: storagePath,
        file_name: fileName,
        mime_type: blob.type,
        file_size: blob.size,
        ocr_text: ocrText ?? null,
        ocr_confirmed: ocrConfirmed ?? false,
      })
      .select()
      .single()
    if (error) {
      // The metadata row failed: remove the orphaned object so the
      // bucket does not keep a photo with no record.
      await sb.storage.from('medication-photos').remove([storagePath])
      throw error
    }
    return data as MedicationImage
  },

  async getMedicationPhotoUrl(image: MedicationImage): Promise<string> {
    // Private bucket: a short-lived signed URL, never a public one.
    const { data, error } = await client().storage
      .from('medication-photos')
      .createSignedUrl(image.storage_path, 3600)
    if (error) throw error
    return data.signedUrl
  },

  async deleteMedicationPhoto(imageId: string): Promise<void> {
    const sb = client()
    const { data, error: fetchError } = await sb
      .from('medication_images')
      .select('storage_path')
      .eq('id', imageId)
      .maybeSingle()
    if (fetchError) throw fetchError
    const storagePath = (data as { storage_path: string } | null)?.storage_path
    const { error } = await sb
      .from('medication_images')
      .delete()
      .eq('id', imageId)
    if (error) throw error
    if (storagePath) {
      await sb.storage.from('medication-photos').remove([storagePath])
    }
  },

  async updateMedicationPhotoOcr(
    imageId: string,
    ocrText: string | null,
    confirmed: boolean,
  ): Promise<void> {
    const { error } = await client()
      .from('medication_images')
      .update({ ocr_text: ocrText, ocr_confirmed: confirmed })
      .eq('id', imageId)
    if (error) throw error
  },

  async saveCallPreferences(prefs: CallPreferences): Promise<void> {
    const { error } = await client()
      .from('call_preferences')
      .upsert(
        { ...prefs, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      )
    if (error) throw error
  },

  async saveMedicineCallSettings(settings: MedicineCallSettings): Promise<void> {
    const { error } = await client()
      .from('medicine_call_settings')
      .upsert(settings, { onConflict: 'user_id,medication_id' })
    if (error) throw error
  },

  async savePatientPrivateSettings(settings: PatientPrivateSettings): Promise<void> {
    const { error } = await client()
      .from('patient_private_settings')
      .upsert(
        { ...settings, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' },
      )
    if (error) throw error
  },

  async fetchCallHistory(patientId: string) {
    const sb = client()
    const [attempts, responses, medications, doseEvents] = await Promise.all([
      sb
        .from('call_attempts')
        .select('*')
        .eq('patient_id', patientId)
        .order('scheduled_for', { ascending: false })
        .limit(100),
      // Responses for the fetched attempts only — the RLS policies on
      // call_responses already limit reads to the patient + active
      // caregivers, but scoping by attempt keeps the query small.
      sb.from('call_responses').select('*').limit(500),
      sb.from('medications').select('*').eq('patient_id', patientId),
      sb
        .from('dose_events')
        .select('*')
        .eq('patient_id', patientId)
        .order('scheduled_date', { ascending: false })
        .limit(500),
    ])
    for (const res of [attempts, responses, medications, doseEvents]) {
      if (res.error) throw res.error
    }
    const attemptIds = new Set(
      ((attempts.data ?? []) as CallAttempt[]).map((a) => a.id),
    )
    return buildCallHistoryEntries({
      attempts: (attempts.data ?? []) as CallAttempt[],
      responses: ((responses.data ?? []) as CallResponse[]).filter((r) =>
        attemptIds.has(r.call_attempt_id),
      ),
      medications: (medications.data ?? []) as Medication[],
      doseEvents: (doseEvents.data ?? []) as DoseEvent[],
      today: todayISO(),
    })
  },

  async fetchCallAttempt(id: string): Promise<{
    attempt: CallAttempt
    responses: CallResponse[]
  } | null> {
    const sb = client()
    const { data, error } = await sb
      .from('call_attempts')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    if (!data) return null
    const { data: responses, error: respError } = await sb
      .from('call_responses')
      .select('*')
      .eq('call_attempt_id', id)
      .order('recorded_at', { ascending: true })
    if (respError) throw respError
    return {
      attempt: data as CallAttempt,
      responses: (responses ?? []) as CallResponse[],
    }
  },

  async flagCallHelp(attemptId: string): Promise<void> {
    // The browser cannot UPDATE call_attempts (007 deliberately has no
    // client update policy — writes are server-side only). The
    // flag_call_help RPC (008) runs SECURITY DEFINER, checks the caller
    // is the attempt's patient, sets escalation_status='pending', and
    // logs the audit event. The caregiver alert itself is still written
    // by scan-due-calls only after the consent gate passes.
    const { data, error } = await client().rpc('flag_call_help', {
      p_attempt_id: attemptId,
    })
    if (error) throw error
    if (data !== true) throw new Error('call.helpFailed')
  },

  async addAuditEvent(
    event: Omit<AuditEvent, 'id' | 'created_at'>,
  ): Promise<void> {
    const { error } = await client().from('audit_events').insert(event)
    if (error) throw error
  },

  async inviteCaregiver(
    patientId: string,
    email: string,
    name: string | null,
  ): Promise<CaregiverConnection> {
    const { data, error } = await client()
      .from('caregiver_connections')
      .insert({
        patient_id: patientId,
        invited_email: email.trim().toLowerCase(),
        caregiver_name: name,
        status: 'pending',
      })
      .select()
      .single()
    if (error) throw error
    return data as CaregiverConnection
  },

  async updateCaregiverConnection(id: string, status: ConnectionStatus): Promise<void> {
    const { error } = await client()
      .from('caregiver_connections')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
  },

  async inviteHealthcare(
    patientId: string,
    email: string,
    name: string | null,
  ): Promise<HealthcareConnection> {
    const { data, error } = await client()
      .from('healthcare_connections')
      .insert({
        patient_id: patientId,
        invited_email: email.trim().toLowerCase(),
        professional_name: name,
        status: 'pending',
      })
      .select()
      .single()
    if (error) throw error
    return data as HealthcareConnection
  },

  async updateHealthcareConnection(id: string, status: ConnectionStatus): Promise<void> {
    const { error } = await client()
      .from('healthcare_connections')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
  },

  async addNotificationLog(
    log: Omit<NotificationLog, 'id' | 'created_at'>,
  ): Promise<void> {
    const { error } = await client().from('notification_logs').insert(log)
    if (error) throw error
  },

  async addFollowUpNote(
    note: Omit<FollowUpNote, 'id' | 'created_at'>,
  ): Promise<void> {
    const { error } = await client().from('follow_up_notes').insert(note)
    if (error) throw error
  },

  async addSupportRequest(
    req: Omit<SupportRequest, 'id' | 'created_at'>,
  ): Promise<void> {
    const { error } = await client().from('support_requests').insert(req)
    if (error) throw error
  },

  async updateSupportRequest(id: string, status: SupportRequest['status']): Promise<void> {
    const { error } = await client()
      .from('support_requests')
      .update({ status })
      .eq('id', id)
    if (error) throw error
  },
}
