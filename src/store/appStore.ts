/* App store (Zustand). Holds the session, the snapshot of everything the
 * signed-in user may see, connectivity/sync state, and all mutations.
 *
 * Mutation rule: every write goes through `writeOp`, which
 *   1. applies the change optimistically to the in-memory snapshot,
 *   2. writes to the provider when online,
 *   3. queues the change in the IndexedDB outbox when offline or when
 *      the write fails, and surfaces sync status + conflicts.
 *
 * Escalation: every 30 seconds (and on refresh) the store checks the
 * signed-in patient's pending doses. A dose past its grace period is
 * marked missed and an in-app alert is logged for each active caregiver.
 * Email/SMS are never faked: when no channel is configured, the log
 * records them as `unavailable` and the alert is in-app only.
 */
import { create } from 'zustand'
import i18n, { isSupportedLanguage, type SupportedLanguage } from '../i18n'
import { DEFAULT_GRACE_MINUTES, dosesForDate, expiredPendingDoses } from '../lib/doseLogic'
import { todayISO } from '../lib/time'
import { provider } from '../services'
import {
  enqueueOutbox,
  listOutbox,
  markOutboxFailed,
  outboxCount,
  removeOutbox,
} from '../services/outbox'
import type {
  DataProvider,
  DoseRecordInput,
  MedicationInput,
  SessionUser,
  Snapshot,
} from '../services/provider'
import type {
  CallPreferences,
  ConnectionStatus,
  DoseEvent,
  InAppAlert,
  Medication,
  MedicationImage,
  MedicationSchedule,
  MedicationStatus,
  MedicineCallSettings,
  NotificationLog,
  NotificationPreferences,
  OutboxItem,
  PatientPrivateSettings,
  Profile,
  Role,
  SyncState,
} from '../types'
import type { CallHistoryEntry } from '../types/calls'

const LANG_KEY = 'dosesathi-lang'
const LARGE_TEXT_KEY = 'dosesathi-large-text'
const HIGH_CONTRAST_KEY = 'dosesathi-high-contrast'
const ALERTS_READ_KEY = 'dosesathi-alerts-read'
const REMINDERS_DISMISSED_KEY = 'dosesathi-reminders-dismissed'

function loadAlertsRead(): Record<string, true> {
  try {
    return JSON.parse(localStorage.getItem(ALERTS_READ_KEY) ?? '{}') as Record<
      string,
      true
    >
  } catch {
    return {}
  }
}

/** Dismissed reminder dialogs, kept in sessionStorage so a page reload
 * does not immediately re-show a dialog the user just dismissed — but a
 * new tab session starts fresh. Stale entries (other dates) are dropped:
 * dose keys embed the date as `scheduleId|YYYY-MM-DD`. */
function loadRemindersDismissed(): Record<string, true> {
  try {
    const raw = JSON.parse(
      sessionStorage.getItem(REMINDERS_DISMISSED_KEY) ?? '{}',
    ) as Record<string, true>
    const today = todayISO()
    const kept: Record<string, true> = {}
    for (const key of Object.keys(raw)) {
      if (key.endsWith(`|${today}`)) kept[key] = true
    }
    return kept
  } catch {
    return {}
  }
}

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}

interface AppState {
  initialized: boolean
  loading: boolean
  error: string | null
  session: SessionUser | null
  profile: Profile | null
  snapshot: Snapshot | null
  language: SupportedLanguage
  largeText: boolean
  highContrast: boolean
  online: boolean
  syncState: SyncState
  outboxPending: number
  conflicts: string[]
  lastSyncAt: string | null
  alertsRead: Record<string, true>
  reminderDismissed: Record<string, true>
  toast: string | null

  init: () => Promise<void>
  refresh: () => Promise<void>
  setLanguage: (lang: SupportedLanguage) => void
  setLargeText: (on: boolean) => void
  setHighContrast: (on: boolean) => void
  setToast: (message: string | null) => void
  signIn: (email: string, password: string) => Promise<void>
  signUp: (input: {
    full_name: string
    email: string
    password: string
    role: Role
  }) => Promise<void>
  signOut: () => Promise<void>

  saveProfile: (profile: Profile) => Promise<void>
  saveMedication: (
    input: MedicationInput,
    existingId?: string,
  ) => Promise<Medication>
  deleteMedication: (id: string) => Promise<void>
  setMedicationStatus: (id: string, status: MedicationStatus) => Promise<void>
  recordDose: (
    input: DoseRecordInput,
  ) => Promise<void>
  snoozeDose: (input: DoseRecordInput, minutes: number) => Promise<void>
  savePreferences: (prefs: NotificationPreferences) => Promise<void>
  uploadMedicationPhoto: (
    medicationId: string,
    blob: Blob,
    fileName: string,
    ocrText?: string | null,
    ocrConfirmed?: boolean,
  ) => Promise<MedicationImage>
  deleteMedicationPhoto: (imageId: string) => Promise<void>
  getMedicationPhotoUrl: (image: MedicationImage) => Promise<string>
  updateMedicationPhotoOcr: (
    imageId: string,
    ocrText: string | null,
    confirmed: boolean,
  ) => Promise<void>
  saveCallPreferences: (prefs: CallPreferences) => Promise<void>
  saveMedicineCallSettings: (settings: MedicineCallSettings) => Promise<void>
  savePatientPrivateSettings: (settings: PatientPrivateSettings) => Promise<void>
  fetchCallHistory: (patientId: string) => Promise<CallHistoryEntry[]>
  flagCallHelp: (attemptId: string) => Promise<void>
  inviteCaregiver: (email: string, name: string | null) => Promise<void>
  updateCaregiverConnection: (id: string, status: ConnectionStatus) => Promise<void>
  inviteHealthcare: (email: string, name: string | null) => Promise<void>
  updateHealthcareConnection: (id: string, status: ConnectionStatus) => Promise<void>
  addFollowUpNote: (patientId: string, note: string) => Promise<void>
  addSupportRequest: (subject: string, message: string) => Promise<void>
  updateSupportRequest: (id: string, status: 'open' | 'resolved') => Promise<void>
  revokeAllAccess: () => Promise<void>

  syncNow: () => Promise<void>
  runEscalationCheck: () => Promise<void>
  markAlertRead: (id: string) => void
  dismissReminder: (doseKey: string) => void
  alertsForMe: () => InAppAlert[]
}

function applyA11y(largeText: boolean, highContrast: boolean): void {
  document.documentElement.dataset.largeText = String(largeText)
  document.documentElement.dataset.highContrast = String(highContrast)
}

export const useAppStore = create<AppState>()((set, get) => {
  let escalationTimer: ReturnType<typeof setInterval> | null = null

  /** Apply an optimistic change to the in-memory snapshot. */
  function applyOptimistic(kind: OutboxItem['kind'], payload: Record<string, unknown>): void {
    const snap = get().snapshot
    if (!snap) return
    const next: Snapshot = { ...snap }
    if (kind === 'dose_event') {
      const input = payload as unknown as DoseRecordInput
      const existing = next.doseEvents.findIndex(
        (e) =>
          e.schedule_id === input.schedule_id &&
          e.scheduled_date === input.scheduled_date &&
          e.scheduled_time === input.scheduled_time,
      )
      const now = new Date().toISOString()
      if (existing >= 0) {
        const prev = next.doseEvents[existing] as DoseEvent
        next.doseEvents = [...next.doseEvents]
        next.doseEvents[existing] = {
          ...prev,
          status: input.status,
          note: input.note ?? prev.note,
          snoozed_until: input.snoozed_until ?? null,
          source: input.source ?? prev.source ?? 'app',
          call_attempt_id:
            input.call_attempt_id ?? prev.call_attempt_id ?? null,
          action_at: input.status === 'pending' ? prev.action_at : now,
          updated_at: now,
        }
      } else {
        next.doseEvents = [
          ...next.doseEvents,
          {
            id: newId('dose'),
            schedule_id: input.schedule_id,
            patient_id: input.patient_id,
            medication_id: input.medication_id,
            scheduled_date: input.scheduled_date,
            scheduled_time: input.scheduled_time,
            status: input.status,
            action_at: input.status === 'pending' ? null : now,
            note: input.note ?? null,
            snoozed_until: input.snoozed_until ?? null,
            source: input.source ?? 'app',
            call_attempt_id: input.call_attempt_id ?? null,
            created_at: now,
            updated_at: now,
          },
        ]
      }
    } else if (kind === 'medication') {
      const { input, existingId } = payload as unknown as {
        input: MedicationInput
        existingId?: string
      }
      const medId = existingId ?? input.id ?? newId('med')
      const now = new Date().toISOString()
      const prev = next.medications.find((m) => m.id === medId)
      const med: Medication = {
        id: medId,
        patient_id: get().profile?.id ?? '',
        name: input.name,
        brand_name: input.brand_name,
        strength: input.strength,
        form: input.form,
        instructions: input.instructions,
        dose_amount: input.dose_amount,
        frequency: input.frequency,
        start_date: input.start_date,
        end_date: input.end_date,
        prescriber_name: input.prescriber_name,
        notes: input.notes,
        status: prev?.status ?? 'active',
        created_at: prev?.created_at ?? now,
        updated_at: now,
      }
      next.medications = prev
        ? next.medications.map((m) => (m.id === medId ? med : m))
        : [...next.medications, med]
      const schedules: MedicationSchedule[] = input.times.map((t) => ({
        id: newId('sched'),
        medication_id: medId,
        time_of_day: t.time_of_day,
        days_of_week: t.days_of_week,
        food_rule: t.food_rule,
        created_at: now,
      }))
      next.schedules = [
        ...next.schedules.filter((s) => s.medication_id !== medId),
        ...schedules,
      ]
    } else if (kind === 'medication_delete') {
      const { id } = payload as unknown as { id: string }
      next.medications = next.medications.filter((m) => m.id !== id)
      next.schedules = next.schedules.filter((s) => s.medication_id !== id)
    } else if (kind === 'preferences') {
      const prefs = payload as unknown as NotificationPreferences
      next.preferences = next.preferences.some((p) => p.id === prefs.id)
        ? next.preferences.map((p) => (p.id === prefs.id ? prefs : p))
        : [...next.preferences, prefs]
    } else if (kind === 'call_preferences') {
      const prefs = payload as unknown as CallPreferences
      next.callPreferences = next.callPreferences.some(
        (p) => p.user_id === prefs.user_id,
      )
        ? next.callPreferences.map((p) =>
            p.user_id === prefs.user_id ? prefs : p,
          )
        : [...next.callPreferences, prefs]
    } else if (kind === 'medicine_call_settings') {
      const settings = payload as unknown as MedicineCallSettings
      next.medicineCallSettings = next.medicineCallSettings.some(
        (s) =>
          s.user_id === settings.user_id &&
          s.medication_id === settings.medication_id,
      )
        ? next.medicineCallSettings.map((s) =>
            s.user_id === settings.user_id &&
            s.medication_id === settings.medication_id
              ? settings
              : s,
          )
        : [...next.medicineCallSettings, settings]
    } else if (kind === 'private_settings') {
      const settings = payload as unknown as PatientPrivateSettings
      next.patientPrivateSettings = next.patientPrivateSettings.some(
        (s) => s.user_id === settings.user_id,
      )
        ? next.patientPrivateSettings.map((s) =>
            s.user_id === settings.user_id ? settings : s,
          )
        : [...next.patientPrivateSettings, settings]
    } else if (kind === 'profile') {
      const profile = payload as unknown as Profile
      set({ profile })
      next.profiles = next.profiles.map((p) => (p.id === profile.id ? profile : p))
    } else if (kind === 'connection') {
      const { table, id, status } = payload as unknown as {
        table: 'caregiver' | 'healthcare'
        id: string
        status: ConnectionStatus
      }
      if (table === 'caregiver') {
        next.caregiverConnections = next.caregiverConnections.map((c) =>
          c.id === id ? { ...c, status } : c,
        )
      } else {
        next.healthcareConnections = next.healthcareConnections.map((c) =>
          c.id === id ? { ...c, status } : c,
        )
      }
    }
    set({ snapshot: next })
  }

  /** Run a write through the provider, queueing on failure/offline. */
  async function writeOp(
    kind: OutboxItem['kind'],
    payload: Record<string, unknown>,
    providerCall: (p: DataProvider) => Promise<unknown>,
  ): Promise<void> {
    applyOptimistic(kind, payload)
    const { online } = get()
    if (!online) {
      await enqueueOutbox({ kind, payload })
      set({ outboxPending: await outboxCount(), syncState: 'pending' })
      return
    }
    try {
      await providerCall(provider)
      set({ syncState: 'synced', lastSyncAt: new Date().toISOString() })
      await get().refresh()
    } catch (e) {
      await enqueueOutbox({ kind, payload })
      set({
        outboxPending: await outboxCount(),
        syncState: 'error',
        error: e instanceof Error ? e.message : 'error.generic',
      })
    }
  }

  async function loadSnapshot(): Promise<void> {
    const { session } = get()
    if (!session) return
    const snapshot = await provider.fetchSnapshot(session.id)
    const profile =
      snapshot.profiles.find((p) => p.id === session.id) ?? null
    set({ snapshot, profile })
  }

  /** Best-effort audit logging (003 `audit_events`). A failed audit
   * write must never fail the user action it describes — the consent
   * or setting change itself already landed. */
  async function logAudit(
    action: string,
    entity: string | null,
    entityId: string | null,
  ): Promise<void> {
    const userId = get().session?.id
    if (!userId) return
    try {
      await provider.addAuditEvent({
        user_id: userId,
        action,
        entity,
        entity_id: entityId,
        details: null,
      })
    } catch {
      /* audit logging is best-effort */
    }
  }

  return {
    initialized: false,
    loading: true,
    error: null,
    session: null,
    profile: null,
    snapshot: null,
    language: 'en',
    largeText: false,
    highContrast: false,
    online: typeof navigator !== 'undefined' ? navigator.onLine : true,
    syncState: 'synced',
    outboxPending: 0,
    conflicts: [],
    lastSyncAt: null,
    alertsRead: loadAlertsRead(),
    reminderDismissed: loadRemindersDismissed(),
    toast: null,

    async init() {
      if (get().initialized) return
      const savedLang = localStorage.getItem(LANG_KEY)
      const language: SupportedLanguage =
        savedLang && isSupportedLanguage(savedLang) ? savedLang : 'en'
      const largeText = localStorage.getItem(LARGE_TEXT_KEY) === 'true'
      const highContrast = localStorage.getItem(HIGH_CONTRAST_KEY) === 'true'
      applyA11y(largeText, highContrast)
      await i18n.changeLanguage(language)
      set({ language, largeText, highContrast })

      window.addEventListener('online', () => {
        set({ online: true })
        void get().syncNow()
      })
      window.addEventListener('offline', () => set({ online: false }))

      // Register the service worker in production builds only.
      if ('serviceWorker' in navigator && import.meta.env.PROD) {
        void navigator.serviceWorker
          .register('/sw.js')
          .catch(() => undefined)
      }

      try {
        const session = await provider.getSession()
        set({ session })
        if (session) {
          await loadSnapshot()
          const profile = get().profile
          if (profile && isSupportedLanguage(profile.preferred_language)) {
            await i18n.changeLanguage(profile.preferred_language)
            set({ language: profile.preferred_language })
          }
          await get().runEscalationCheck()
        }
        set({ outboxPending: await outboxCount() })
      } catch (e) {
        // Not-configured is an expected state, not an error to surface:
        // the not-configured page explains it. Anything else is a real
        // failure and is recorded.
        if (!(e instanceof Error && e.message === 'supabase.notConfigured')) {
          set({ error: e instanceof Error ? e.message : 'error.generic' })
        }
      } finally {
        set({ initialized: true, loading: false })
      }

      if (escalationTimer) clearInterval(escalationTimer)
      escalationTimer = setInterval(() => {
        void get().runEscalationCheck()
      }, 30_000)
    },

    async refresh() {
      try {
        await loadSnapshot()
        await get().runEscalationCheck()
        set({ outboxPending: await outboxCount() })
      } catch (e) {
        set({ error: e instanceof Error ? e.message : 'error.generic' })
      }
    },

    setLanguage(lang: SupportedLanguage) {
      localStorage.setItem(LANG_KEY, lang)
      void i18n.changeLanguage(lang)
      set({ language: lang })
      const { profile } = get()
      if (profile && profile.preferred_language !== lang) {
        void get().saveProfile({ ...profile, preferred_language: lang })
      }
    },

    setLargeText(on: boolean) {
      localStorage.setItem(LARGE_TEXT_KEY, String(on))
      applyA11y(on, get().highContrast)
      set({ largeText: on })
    },

    setHighContrast(on: boolean) {
      localStorage.setItem(HIGH_CONTRAST_KEY, String(on))
      applyA11y(get().largeText, on)
      set({ highContrast: on })
    },

    setToast(message: string | null) {
      set({ toast: message })
      if (message) {
        window.setTimeout(() => {
          if (get().toast === message) set({ toast: null })
        }, 5000)
      }
    },

    async signIn(email: string, password: string) {
      set({ loading: true, error: null })
      try {
        const session = await provider.signIn(email, password)
        set({ session })
        await loadSnapshot()
        const profile = get().profile
        if (profile && isSupportedLanguage(profile.preferred_language)) {
          await i18n.changeLanguage(profile.preferred_language)
          set({ language: profile.preferred_language })
        }
        await get().runEscalationCheck()
      } finally {
        set({ loading: false })
      }
    },

    async signUp(input) {
      set({ loading: true, error: null })
      try {
        const session = await provider.signUp(input)
        set({ session })
        await loadSnapshot()
      } finally {
        set({ loading: false })
      }
    },

    async signOut() {
      await provider.signOut()
      set({
        session: null,
        profile: null,
        snapshot: null,
        reminderDismissed: {},
      })
    },

    async saveProfile(profile: Profile) {
      await writeOp('profile', profile as unknown as Record<string, unknown>, (p) =>
        p.upsertProfile(profile),
      )
    },

    async saveMedication(input: MedicationInput, existingId?: string) {
      const withId: MedicationInput = existingId
        ? input
        : { ...input, id: input.id ?? crypto.randomUUID() }
      let saved: Medication | null = null
      await writeOp(
        'medication',
        { input: withId, existingId } as unknown as Record<string, unknown>,
        async (p) => {
          saved = await p.saveMedication(
            get().profile?.id ?? '',
            withId,
            existingId,
          )
        },
      )
      if (!get().online) {
        // Offline: return the optimistic copy so the UI can navigate.
        const snap = get().snapshot
        const medId = existingId ?? withId.id ?? ''
        saved =
          (snap?.medications.find((m) => m.id === medId) as Medication) ?? null
      } else {
        await get().refresh()
        const medId = existingId ?? withId.id ?? ''
        saved =
          (get().snapshot?.medications.find((m) => m.id === medId) as Medication) ??
          saved
      }
      if (!saved) throw new Error('medication.saveFailed')
      return saved
    },

    async deleteMedication(id: string) {
      await writeOp('medication_delete', { id }, (p) => p.deleteMedication(id))
      if (get().online) await get().refresh()
    },

    async setMedicationStatus(id: string, status: MedicationStatus) {
      const snap = get().snapshot
      if (snap) {
        set({
          snapshot: {
            ...snap,
            medications: snap.medications.map((m) =>
              m.id === id ? { ...m, status } : m,
            ),
          },
        })
      }
      try {
        await provider.setMedicationStatus(id, status)
        set({ syncState: 'synced', lastSyncAt: new Date().toISOString() })
      } catch (e) {
        set({ error: e instanceof Error ? e.message : 'error.generic' })
      }
    },

    async recordDose(input: DoseRecordInput) {
      await writeOp(
        'dose_event',
        input as unknown as Record<string, unknown>,
        (p) => p.recordDose(input),
      )
      if (get().online) await get().refresh()
    },

    async snoozeDose(input: DoseRecordInput, minutes: number) {
      const snoozedUntil = new Date(Date.now() + minutes * 60_000).toISOString()
      await get().recordDose({
        ...input,
        status: 'pending',
        snoozed_until: snoozedUntil,
      })
    },

    async savePreferences(prefs: NotificationPreferences) {
      await writeOp(
        'preferences',
        prefs as unknown as Record<string, unknown>,
        (p) => p.savePreferences(prefs),
      )
      if (get().online) await get().refresh()
      await logAudit(
        'reminder_settings_updated',
        'notification_preferences',
        prefs.id,
      )
    },

    async uploadMedicationPhoto(
      medicationId: string,
      blob: Blob,
      fileName: string,
      ocrText?: string | null,
      ocrConfirmed?: boolean,
    ) {
      // Photos upload directly (they are too large for the outbox, and a
      // failed upload must surface a clear error so the user can retry).
      // The caller keeps the edited image on failure.
      const image = await provider.uploadMedicationPhoto(
        medicationId,
        blob,
        fileName,
        ocrText,
        ocrConfirmed,
      )
      await get().refresh()
      return image
    },

    async deleteMedicationPhoto(imageId: string) {
      await provider.deleteMedicationPhoto(imageId)
      await get().refresh()
    },

    async getMedicationPhotoUrl(image: MedicationImage) {
      return provider.getMedicationPhotoUrl(image)
    },

    async updateMedicationPhotoOcr(
      imageId: string,
      ocrText: string | null,
      confirmed: boolean,
    ) {
      await provider.updateMedicationPhotoOcr(imageId, ocrText, confirmed)
      await get().refresh()
    },

    async saveCallPreferences(prefs: CallPreferences) {
      // Capture the previous consent state BEFORE the optimistic
      // update, so consent flips can be audited precisely.
      const prev =
        get().snapshot?.callPreferences.find(
          (p) => p.user_id === prefs.user_id,
        ) ?? null
      await writeOp(
        'call_preferences',
        prefs as unknown as Record<string, unknown>,
        (p) => p.saveCallPreferences(prefs),
      )
      if (get().online) await get().refresh()
      // Consent changes get their own audit entries; any other voice
      // settings change gets one generic entry.
      let consentLogged = false
      if ((prev?.consent_calls ?? false) !== prefs.consent_calls) {
        consentLogged = true
        await logAudit(
          prefs.consent_calls
            ? 'consent_calls_granted'
            : 'consent_calls_revoked',
          'call_preferences',
          prefs.id,
        )
      }
      if (
        (prev?.consent_escalation ?? false) !== prefs.consent_escalation
      ) {
        consentLogged = true
        await logAudit(
          prefs.consent_escalation
            ? 'consent_escalation_granted'
            : 'consent_escalation_revoked',
          'call_preferences',
          prefs.id,
        )
      }
      if (!consentLogged) {
        await logAudit(
          'call_preferences_updated',
          'call_preferences',
          prefs.id,
        )
      }
    },

    async fetchCallHistory(patientId: string): Promise<CallHistoryEntry[]> {
      return provider.fetchCallHistory(patientId)
    },

    async flagCallHelp(attemptId: string): Promise<void> {
      await provider.flagCallHelp(attemptId)
      await get().refresh()
    },

    async saveMedicineCallSettings(settings: MedicineCallSettings) {
      await writeOp(
        'medicine_call_settings',
        settings as unknown as Record<string, unknown>,
        (p) => p.saveMedicineCallSettings(settings),
      )
      if (get().online) await get().refresh()
    },

    async savePatientPrivateSettings(settings: PatientPrivateSettings) {
      await writeOp(
        'private_settings',
        settings as unknown as Record<string, unknown>,
        (p) => p.savePatientPrivateSettings(settings),
      )
      if (get().online) await get().refresh()
    },

    async inviteCaregiver(email: string, name: string | null) {
      const patientId = get().profile?.id
      if (!patientId) throw new Error('profile.missing')
      await provider.inviteCaregiver(patientId, email, name)
      // An in-app log records the invitation; no email is faked.
      await provider.addNotificationLog({
        patient_id: patientId,
        recipient_id: null,
        recipient_email: email.trim().toLowerCase(),
        type: 'caregiver_invite',
        channel: 'in_app',
        message: `Caregiver invitation sent to ${email.trim().toLowerCase()}.`,
        status: 'delivered',
      })
      await get().refresh()
    },

    async updateCaregiverConnection(id: string, status: ConnectionStatus) {
      await writeOp(
        'connection',
        { table: 'caregiver', id, status },
        (p) => p.updateCaregiverConnection(id, status),
      )
      if (get().online) await get().refresh()
    },

    async inviteHealthcare(email: string, name: string | null) {
      const patientId = get().profile?.id
      if (!patientId) throw new Error('profile.missing')
      await provider.inviteHealthcare(patientId, email, name)
      await provider.addNotificationLog({
        patient_id: patientId,
        recipient_id: null,
        recipient_email: email.trim().toLowerCase(),
        type: 'caregiver_invite',
        channel: 'in_app',
        message: `Health professional invitation sent to ${email.trim().toLowerCase()}.`,
        status: 'delivered',
      })
      await get().refresh()
    },

    async updateHealthcareConnection(id: string, status: ConnectionStatus) {
      await writeOp(
        'connection',
        { table: 'healthcare', id, status },
        (p) => p.updateHealthcareConnection(id, status),
      )
      if (get().online) await get().refresh()
    },

    async addFollowUpNote(patientId: string, note: string) {
      const { session, profile } = get()
      if (!session) throw new Error('auth.required')
      await provider.addFollowUpNote({
        patient_id: patientId,
        author_id: session.id,
        author_name: profile?.full_name ?? session.full_name,
        note,
      })
      await get().refresh()
    },

    async addSupportRequest(subject: string, message: string) {
      const userId = get().session?.id
      if (!userId) throw new Error('auth.required')
      await provider.addSupportRequest({
        user_id: userId,
        subject,
        message,
        status: 'open',
      })
      await get().refresh()
    },

    async updateSupportRequest(id: string, status: 'open' | 'resolved') {
      await provider.updateSupportRequest(id, status)
      await get().refresh()
    },

    async revokeAllAccess() {
      const snap = get().snapshot
      const patientId = get().profile?.id
      if (!snap || !patientId) return
      for (const c of snap.caregiverConnections.filter(
        (c) => c.patient_id === patientId && c.status === 'active',
      )) {
        await provider.updateCaregiverConnection(c.id, 'revoked')
      }
      for (const c of snap.healthcareConnections.filter(
        (c) => c.patient_id === patientId && c.status === 'active',
      )) {
        await provider.updateHealthcareConnection(c.id, 'revoked')
      }
      await get().refresh()
    },

    async syncNow() {
      const pending = await listOutbox()
      if (pending.length === 0) {
        set({ syncState: 'synced', outboxPending: 0 })
        return
      }
      set({ syncState: 'syncing' })
      const conflicts: string[] = []
      for (const item of pending) {
        try {
          if (item.kind === 'dose_event') {
            await provider.recordDose(item.payload as unknown as DoseRecordInput)
          } else if (item.kind === 'medication') {
            const { input, existingId } = item.payload as unknown as {
              input: MedicationInput
              existingId?: string
            }
            await provider.saveMedication(get().profile?.id ?? '', input, existingId)
          } else if (item.kind === 'medication_delete') {
            await provider.deleteMedication(
              (item.payload as unknown as { id: string }).id,
            )
          } else if (item.kind === 'profile') {
            await provider.upsertProfile(item.payload as unknown as Profile)
          } else if (item.kind === 'preferences') {
            await provider.savePreferences(
              item.payload as unknown as NotificationPreferences,
            )
          } else if (item.kind === 'call_preferences') {
            await provider.saveCallPreferences(
              item.payload as unknown as CallPreferences,
            )
          } else if (item.kind === 'medicine_call_settings') {
            await provider.saveMedicineCallSettings(
              item.payload as unknown as MedicineCallSettings,
            )
          } else if (item.kind === 'private_settings') {
            await provider.savePatientPrivateSettings(
              item.payload as unknown as PatientPrivateSettings,
            )
          } else if (item.kind === 'connection') {
            const { table, id, status } = item.payload as unknown as {
              table: 'caregiver' | 'healthcare'
              id: string
              status: ConnectionStatus
            }
            if (table === 'caregiver') {
              await provider.updateCaregiverConnection(id, status)
            } else {
              await provider.updateHealthcareConnection(id, status)
            }
          }
          await removeOutbox(item.id)
        } catch (e) {
          const message = e instanceof Error ? e.message : 'sync.failed'
          await markOutboxFailed(item.id, message)
          conflicts.push(`${item.kind}: ${message}`)
        }
      }
      const remaining = await outboxCount()
      set({
        outboxPending: remaining,
        syncState: remaining === 0 ? 'synced' : 'error',
        conflicts,
        lastSyncAt: remaining === 0 ? new Date().toISOString() : get().lastSyncAt,
      })
      if (remaining === 0) await get().refresh()
    },

    async runEscalationCheck() {
      const { session, profile, snapshot } = get()
      if (!session || !profile || !snapshot) return
      if (profile.role !== 'patient') return
      const patientId = profile.id
      const prefs =
        snapshot.preferences.find((p) => p.user_id === patientId) ?? null
      const grace = prefs?.grace_period_minutes ?? DEFAULT_GRACE_MINUTES
      const today = todayISO()
      const doses = dosesForDate({
        medications: snapshot.medications.filter((m) => m.patient_id === patientId),
        schedules: snapshot.schedules,
        events: snapshot.doseEvents.filter((e) => e.patient_id === patientId),
        dateISO: today,
        graceMinutes: grace,
        live: false, // escalation needs stored statuses, not live-flipped ones
      })
      const expired = expiredPendingDoses(doses, new Date(), grace)
      if (expired.length === 0) return
      const activeCaregivers = snapshot.caregiverConnections.filter(
        (c) => c.patient_id === patientId && c.status === 'active',
      )
      const alertsEnabled = prefs?.caregiver_alerts_enabled ?? true
      const includeDetails = prefs?.include_med_details ?? false
      for (const dose of expired) {
        // Mark missed first: a second run will not see it as pending, so
        // the alert below is raised exactly once per dose.
        try {
          await provider.recordDose({
            schedule_id: dose.schedule_id,
            patient_id: patientId,
            medication_id: dose.medication_id,
            scheduled_date: dose.scheduled_date,
            scheduled_time: dose.scheduled_time,
            status: 'missed',
          })
        } catch {
          continue
        }
        if (!alertsEnabled) continue
        for (const conn of activeCaregivers) {
          const base = includeDetails
            ? `${profile.full_name} did not confirm ${dose.medication_name} ${dose.strength} at ${dose.scheduled_time}.`
            : `A dose for ${profile.full_name} was not confirmed and the grace period has passed.`
          const log: Omit<NotificationLog, 'id' | 'created_at'> = {
            patient_id: patientId,
            recipient_id: conn.caregiver_id,
            recipient_email: conn.invited_email,
            type: 'missed_dose_alert',
            channel: 'in_app',
            message: base,
            status: 'delivered',
          }
          try {
            await provider.addNotificationLog(log)
          } catch {
            /* alert logging is best-effort; the missed dose is recorded */
          }
          // External channels are NOT sent: no provider is configured.
          // The log honestly records them as unavailable.
          try {
            await provider.addNotificationLog({
              ...log,
              channel: 'email',
              status: 'unavailable',
            })
          } catch {
            /* ignore */
          }
        }
      }
      await loadSnapshot()
    },

    markAlertRead(id: string) {
      const alertsRead = { ...get().alertsRead, [id]: true as const }
      localStorage.setItem(ALERTS_READ_KEY, JSON.stringify(alertsRead))
      set({ alertsRead })
    },

    dismissReminder(doseKey: string) {
      const reminderDismissed = {
        ...get().reminderDismissed,
        [doseKey]: true as const,
      }
      try {
        sessionStorage.setItem(
          REMINDERS_DISMISSED_KEY,
          JSON.stringify(reminderDismissed),
        )
      } catch {
        /* sessionStorage unavailable: dismissal lasts until reload */
      }
      set({ reminderDismissed })
    },

    alertsForMe(): InAppAlert[] {
      const { session, snapshot, profile } = get()
      if (!session || !snapshot || !profile) return []
      const myEmail = session.email.toLowerCase()
      return snapshot.notificationLogs
        .filter(
          (l) =>
            l.type === 'missed_dose_alert' &&
            l.channel === 'in_app' &&
            (l.recipient_id === session.id ||
              (l.recipient_email !== null &&
                l.recipient_email.toLowerCase() === myEmail)),
        )
        .map((l) => {
          const patient =
            snapshot.profiles.find((p) => p.id === l.patient_id) ?? null
          return {
            id: l.id,
            patient_id: l.patient_id,
            patient_name: patient?.full_name ?? 'Patient',
            message: l.message,
            created_at: l.created_at,
            read: Boolean(get().alertsRead[l.id]),
          }
        })
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
    },
  }
})
