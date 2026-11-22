import { describe, expect, it } from 'vitest'
import {
  authSchema,
  inviteSchema,
  medicationFormSchema,
  preferencesSchema,
  profileSchema,
} from './medication'

const validMed = {
  name: 'Amlodipine',
  brand_name: '',
  strength: '5 mg',
  form: 'tablet' as const,
  instructions: 'Take one tablet in the morning with water.',
  dose_amount: '1 tablet',
  frequency: 'once_daily' as const,
  times: ['08:00'],
  days_of_week: [1, 2, 3, 4, 5, 6, 7],
  food_rule: 'none' as const,
  start_date: '2026-11-22',
  end_date: '',
  prescriber_name: '',
  notes: '',
}

describe('medicationFormSchema', () => {
  it('accepts a complete valid medication', () => {
    expect(medicationFormSchema.safeParse(validMed).success).toBe(true)
  })
  it('rejects a missing name', () => {
    const r = medicationFormSchema.safeParse({ ...validMed, name: '' })
    expect(r.success).toBe(false)
  })
  it('rejects a missing strength — never infer it', () => {
    const r = medicationFormSchema.safeParse({ ...validMed, strength: '' })
    expect(r.success).toBe(false)
  })
  it('rejects missing instructions', () => {
    const r = medicationFormSchema.safeParse({ ...validMed, instructions: '' })
    expect(r.success).toBe(false)
  })
  it('rejects a missing dose amount', () => {
    const r = medicationFormSchema.safeParse({ ...validMed, dose_amount: '' })
    expect(r.success).toBe(false)
  })
  it('rejects an empty times list', () => {
    const r = medicationFormSchema.safeParse({ ...validMed, times: [] })
    expect(r.success).toBe(false)
  })
  it('rejects a malformed time', () => {
    const r = medicationFormSchema.safeParse({ ...validMed, times: ['8am'] })
    expect(r.success).toBe(false)
  })
  it('rejects more than 6 times a day', () => {
    const r = medicationFormSchema.safeParse({
      ...validMed,
      times: ['06:00', '09:00', '12:00', '15:00', '18:00', '21:00', '23:00'],
    })
    expect(r.success).toBe(false)
  })
  it('rejects a malformed start date', () => {
    const r = medicationFormSchema.safeParse({ ...validMed, start_date: '22/11/2026' })
    expect(r.success).toBe(false)
  })
})

describe('profileSchema', () => {
  it('accepts a valid profile', () => {
    expect(
      profileSchema.safeParse({
        full_name: 'Meena Rao',
        phone: '+91 98765 43210',
        preferred_language: 'en',
        timezone: 'Asia/Kolkata',
        caregiver_contact: '',
      }).success,
    ).toBe(true)
  })
  it('rejects a bad phone number', () => {
    expect(
      profileSchema.safeParse({
        full_name: 'Meena Rao',
        phone: 'abc',
        preferred_language: 'en',
        timezone: 'Asia/Kolkata',
        caregiver_contact: '',
      }).success,
    ).toBe(false)
  })
})

describe('authSchema / inviteSchema / preferencesSchema', () => {
  it('requires a valid email and 8+ char password at signup', () => {
    expect(
      authSchema.safeParse({
        full_name: 'Meena Rao',
        email: 'not-an-email',
        password: 'short',
        role: 'patient',
      }).success,
    ).toBe(false)
    expect(
      authSchema.safeParse({
        full_name: 'Meena Rao',
        email: 'meena@example.com',
        password: 'correct-horse-123',
        role: 'patient',
      }).success,
    ).toBe(true)
  })
  it('requires a valid email for invitations', () => {
    expect(inviteSchema.safeParse({ email: 'bad', name: '' }).success).toBe(false)
    expect(
      inviteSchema.safeParse({ email: 'son@example.com', name: 'Rahul' }).success,
    ).toBe(true)
  })
  it('bounds the grace period between 5 and 240 minutes', () => {
    const base = {
      browser_notifications: false,
      in_app_alerts: true,
      caregiver_alerts_enabled: true,
      include_med_details: false,
      reminder_minutes_before: 0,
    }
    expect(
      preferencesSchema.safeParse({ ...base, grace_period_minutes: 3 }).success,
    ).toBe(false)
    expect(
      preferencesSchema.safeParse({ ...base, grace_period_minutes: 300 }).success,
    ).toBe(false)
    expect(
      preferencesSchema.safeParse({ ...base, grace_period_minutes: 60 }).success,
    ).toBe(true)
  })
})
