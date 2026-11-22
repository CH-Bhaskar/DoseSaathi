/* Unit tests: voice-call preferences, per-medicine call settings, and
 * patient-private settings validation (validation/extension.ts) — plus
 * the pregnancy privacy rule. */
import { describe, expect, it } from 'vitest'
import {
  callPreferencesSchema,
  mayShowPregnancyToCaregiver,
  medicineCallSettingsSchema,
  patientPrivateSettingsSchema,
} from './extension'

const basePrefs = {
  calls_enabled: false,
  paused: false,
  phone_number: '',
  language: 'en',
  voice_name: '',
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
} as const

describe('callPreferencesSchema', () => {
  it('accepts the defaults with calls off', () => {
    expect(callPreferencesSchema.safeParse(basePrefs).success).toBe(true)
  })

  it('accepts calls on with a valid phone number', () => {
    const result = callPreferencesSchema.safeParse({
      ...basePrefs,
      calls_enabled: true,
      phone_number: '+91 98765 43210',
    })
    expect(result.success).toBe(true)
  })

  it('requires a phone number when calls are enabled', () => {
    const result = callPreferencesSchema.safeParse({
      ...basePrefs,
      calls_enabled: true,
      phone_number: '',
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.issues[0]?.message).toBe('validation.phoneRequired')
    }
  })

  it('rejects a malformed phone number when calls are enabled', () => {
    const result = callPreferencesSchema.safeParse({
      ...basePrefs,
      calls_enabled: true,
      phone_number: 'not-a-number',
    })
    expect(result.success).toBe(false)
  })

  it('rejects a malformed phone number even with calls off', () => {
    const result = callPreferencesSchema.safeParse({
      ...basePrefs,
      phone_number: 'abc',
    })
    expect(result.success).toBe(false)
  })

  it('rejects a retry count above 3', () => {
    expect(
      callPreferencesSchema.safeParse({ ...basePrefs, retry_count: 4 }).success,
    ).toBe(false)
  })

  it('rejects a retry count below 0', () => {
    expect(
      callPreferencesSchema.safeParse({ ...basePrefs, retry_count: -1 }).success,
    ).toBe(false)
  })

  it('rejects a speech rate outside 0.5–1.5', () => {
    expect(
      callPreferencesSchema.safeParse({ ...basePrefs, speech_rate: 2.0 }).success,
    ).toBe(false)
    expect(
      callPreferencesSchema.safeParse({ ...basePrefs, speech_rate: 0.4 }).success,
    ).toBe(false)
  })

  it('rejects a bad quiet-hours time', () => {
    expect(
      callPreferencesSchema.safeParse({
        ...basePrefs,
        quiet_hours_start: '25:00',
      }).success,
    ).toBe(false)
  })

  it('rejects escalation without escalation consent', () => {
    const result = callPreferencesSchema.safeParse({
      ...basePrefs,
      escalation_enabled: true,
      consent_escalation: false,
    })
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(
        result.error.issues.some(
          (i) => i.message === 'validation.escalationConsentRequired',
        ),
      ).toBe(true)
    }
  })

  it('accepts escalation with escalation consent', () => {
    expect(
      callPreferencesSchema.safeParse({
        ...basePrefs,
        escalation_enabled: true,
        consent_escalation: true,
      }).success,
    ).toBe(true)
  })

  it('rejects an unsupported language', () => {
    expect(
      callPreferencesSchema.safeParse({ ...basePrefs, language: 'hi' }).success,
    ).toBe(false)
  })
})

describe('medicineCallSettingsSchema', () => {
  it('accepts a valid per-medicine toggle', () => {
    expect(
      medicineCallSettingsSchema.safeParse({
        medication_id: 'med-1',
        calls_enabled: false,
      }).success,
    ).toBe(true)
  })

  it('rejects an empty medication id', () => {
    expect(
      medicineCallSettingsSchema.safeParse({
        medication_id: '',
        calls_enabled: true,
      }).success,
    ).toBe(false)
  })
})

describe('patientPrivateSettingsSchema', () => {
  it('accepts opt-in with a clinician note', () => {
    expect(
      patientPrivateSettingsSchema.safeParse({
        pregnancy_opt_in: true,
        pregnancy_clinician_note: 'As instructed by Dr. Iyer.',
        pregnancy_visible_to_caregiver: false,
      }).success,
    ).toBe(true)
  })

  it('accepts opt-out with no note', () => {
    expect(
      patientPrivateSettingsSchema.safeParse({
        pregnancy_opt_in: false,
        pregnancy_clinician_note: '',
        pregnancy_visible_to_caregiver: false,
      }).success,
    ).toBe(true)
  })

  it('rejects a note over 500 characters', () => {
    expect(
      patientPrivateSettingsSchema.safeParse({
        pregnancy_opt_in: true,
        pregnancy_clinician_note: 'x'.repeat(501),
        pregnancy_visible_to_caregiver: false,
      }).success,
    ).toBe(false)
  })
})

describe('mayShowPregnancyToCaregiver', () => {
  it('is false when not opted in', () => {
    expect(
      mayShowPregnancyToCaregiver({
        pregnancy_opt_in: false,
        pregnancy_visible_to_caregiver: true,
      }),
    ).toBe(false)
  })

  it('is false when opted in but visibility is off', () => {
    expect(
      mayShowPregnancyToCaregiver({
        pregnancy_opt_in: true,
        pregnancy_visible_to_caregiver: false,
      }),
    ).toBe(false)
  })

  it('is true only when opted in AND visibility is explicitly on', () => {
    expect(
      mayShowPregnancyToCaregiver({
        pregnancy_opt_in: true,
        pregnancy_visible_to_caregiver: true,
      }),
    ).toBe(true)
  })
})
