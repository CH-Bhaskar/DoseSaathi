/* Zod validation for the voice-call + photo extension (migrations
 * 005/006). Error messages use i18n keys, resolved at the display layer.
 * The app never infers prescription information: OCR text is a suggestion
 * only, and the pregnancy fields accept clinician-provided notes only. */
import { z } from 'zod'
import { TIME_RE } from './medication'

export const PHONE_RE = /^[+]?[0-9][0-9 -]{6,17}$/

/** Voice-call preferences form. Phone is required only when calls are
 * enabled — a user may save quiet hours or a voice choice without
 * turning calls on. */
export const callPreferencesSchema = z
  .object({
    calls_enabled: z.boolean(),
    paused: z.boolean(),
    phone_number: z.string().trim().max(30).optional().or(z.literal('')),
    language: z.enum(['en', 'kn']),
    voice_name: z.string().trim().max(200).optional().or(z.literal('')),
    speech_rate: z.number().min(0.5, 'validation.speechRateRange').max(1.5, 'validation.speechRateRange'),
    retry_count: z.number().int().min(0, 'validation.retryCountRange').max(3, 'validation.retryCountRange'),
    retry_delay_minutes: z.number().int().min(5).max(60),
    quiet_hours_start: z.string().regex(TIME_RE, 'validation.timeInvalid'),
    quiet_hours_end: z.string().regex(TIME_RE, 'validation.timeInvalid'),
    escalation_enabled: z.boolean(),
    escalation_delay_minutes: z.number().int().min(5).max(240),
    speak_medicine_details: z.boolean(),
    consent_calls: z.boolean(),
    consent_escalation: z.boolean(),
  })
  .superRefine((values, ctx) => {
    if (values.calls_enabled) {
      if (!values.phone_number) {
        ctx.addIssue({
          code: 'custom',
          path: ['phone_number'],
          message: 'validation.phoneRequired',
        })
      } else if (!PHONE_RE.test(values.phone_number)) {
        ctx.addIssue({
          code: 'custom',
          path: ['phone_number'],
          message: 'validation.phoneInvalid',
        })
      }
    } else if (values.phone_number && !PHONE_RE.test(values.phone_number)) {
      ctx.addIssue({
        code: 'custom',
        path: ['phone_number'],
        message: 'validation.phoneInvalid',
      })
    }
    if (values.escalation_enabled && !values.consent_escalation) {
      ctx.addIssue({
        code: 'custom',
        path: ['escalation_enabled'],
        message: 'validation.escalationConsentRequired',
      })
    }
  })

export type CallPreferencesFormValues = z.infer<typeof callPreferencesSchema>

/** Per-medicine call toggle. */
export const medicineCallSettingsSchema = z.object({
  medication_id: z.string().min(1),
  calls_enabled: z.boolean(),
})

export type MedicineCallSettingsFormValues = z.infer<typeof medicineCallSettingsSchema>

/** Patient-private settings. The clinician note is free text the patient
 * copies from their clinician — the app never writes medical content
 * into it, and never acts on it. */
export const patientPrivateSettingsSchema = z.object({
  pregnancy_opt_in: z.boolean(),
  pregnancy_clinician_note: z.string().trim().max(500, 'validation.textTooLong').optional().or(z.literal('')),
  pregnancy_visible_to_caregiver: z.boolean(),
})

export type PatientPrivateSettingsFormValues = z.infer<typeof patientPrivateSettingsSchema>

/** Privacy rule, enforced in code wherever pregnancy data could leak:
 * pregnancy information may be shown to a caregiver ONLY when the
 * patient opted in AND explicitly allowed caregiver visibility. The
 * database enforces the stronger rule (owner-only RLS); this is the
 * second line of defence in the UI. */
export function mayShowPregnancyToCaregiver(settings: {
  pregnancy_opt_in: boolean
  pregnancy_visible_to_caregiver: boolean
}): boolean {
  return settings.pregnancy_opt_in && settings.pregnancy_visible_to_caregiver
}
