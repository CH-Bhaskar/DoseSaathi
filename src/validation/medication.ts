/* Zod validation schemas. The app never infers missing prescription
 * information: required fields must come from the user's prescription.
 * Error messages use i18n keys, resolved at the display layer. */
import { z } from 'zod'

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/

export const medicationFormSchema = z.object({
  name: z.string().trim().min(2, 'validation.nameRequired').max(120),
  brand_name: z.string().trim().max(120).optional().or(z.literal('')),
  strength: z
    .string()
    .trim()
    .min(1, 'validation.strengthRequired')
    .max(60),
  form: z.enum([
    'tablet',
    'capsule',
    'liquid',
    'injection',
    'inhaler',
    'drops',
    'cream',
    'other',
  ]),
  instructions: z
    .string()
    .trim()
    .min(3, 'validation.instructionsRequired')
    .max(500),
  dose_amount: z
    .string()
    .trim()
    .min(1, 'validation.doseAmountRequired')
    .max(60),
  frequency: z.enum([
    'once_daily',
    'twice_daily',
    'three_times_daily',
    'four_times_daily',
    'as_needed',
    'weekly',
    'custom',
  ]),
  times: z
    .array(z.string().regex(TIME_RE, 'validation.timeInvalid'))
    .min(1, 'validation.timesRequired')
    .max(6, 'validation.timesTooMany'),
  days_of_week: z.array(z.number().int().min(1).max(7)),
  food_rule: z.enum(['none', 'before', 'with', 'after']),
  start_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'validation.dateInvalid'),
  end_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'validation.dateInvalid')
    .optional()
    .or(z.literal('')),
  prescriber_name: z.string().trim().max(120).optional().or(z.literal('')),
  notes: z.string().trim().max(500).optional().or(z.literal('')),
})

export type MedicationFormValues = z.infer<typeof medicationFormSchema>

export const profileSchema = z.object({
  full_name: z.string().trim().min(2, 'validation.nameRequired').max(120),
  phone: z
    .string()
    .trim()
    .regex(/^[+]?[0-9][0-9 -]{6,17}$/, 'validation.phoneInvalid')
    .optional()
    .or(z.literal('')),
  preferred_language: z.enum(['en', 'kn']),
  timezone: z.string().min(1),
  caregiver_contact: z.string().trim().max(200).optional().or(z.literal('')),
})

export type ProfileFormValues = z.infer<typeof profileSchema>

export const authSchema = z.object({
  full_name: z.string().trim().min(2, 'validation.nameRequired').max(120),
  email: z.string().trim().email('validation.emailInvalid'),
  password: z.string().min(8, 'validation.passwordShort'),
  role: z.enum(['patient', 'caregiver', 'healthcare_professional']),
})

export const loginSchema = z.object({
  email: z.string().trim().email('validation.emailInvalid'),
  password: z.string().min(1, 'validation.passwordRequired'),
})

export const inviteSchema = z.object({
  email: z.string().trim().email('validation.emailInvalid'),
  name: z.string().trim().max(120).optional().or(z.literal('')),
})

export const preferencesSchema = z.object({
  grace_period_minutes: z.number().int().min(5).max(240),
  browser_notifications: z.boolean(),
  in_app_alerts: z.boolean(),
  caregiver_alerts_enabled: z.boolean(),
  include_med_details: z.boolean(),
  reminder_minutes_before: z.number().int().min(0).max(120),
})

export type PreferencesFormValues = z.infer<typeof preferencesSchema>

export const noteSchema = z.object({
  note: z.string().trim().min(3, 'validation.noteRequired').max(2000),
})

export const supportSchema = z.object({
  subject: z.string().trim().min(3, 'validation.subjectRequired').max(200),
  message: z.string().trim().min(10, 'validation.messageRequired').max(2000),
})

export const doseNoteSchema = z.object({
  note: z.string().trim().max(300).optional().or(z.literal('')),
})
