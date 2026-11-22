import { describe, expect, it } from 'vitest'
import { escalationMessage, shouldEscalate } from './escalation'
import type { EscalationStatus } from './types'

const BASE = {
  escalationEnabled: true,
  consentEscalation: true,
  doseStillUnconfirmed: true,
  minutesSinceDue: 90,
  escalationDelayMinutes: 60,
  escalationStatus: 'none' as EscalationStatus,
  hasActiveCaregiver: true,
}

describe('shouldEscalate', () => {
  it('escalates when every gate passes', () => {
    expect(shouldEscalate(BASE)).toEqual({ escalate: true })
  })
  it('escalates exactly when the delay has elapsed', () => {
    expect(shouldEscalate({ ...BASE, minutesSinceDue: 60 })).toEqual({ escalate: true })
    expect(shouldEscalate({ ...BASE, minutesSinceDue: 59 })).toEqual({
      escalate: false,
      reason: 'delay_not_elapsed',
    })
  })
  it('never escalates without consent — no consent, no alert, ever', () => {
    expect(shouldEscalate({ ...BASE, consentEscalation: false })).toEqual({
      escalate: false,
      reason: 'no_consent',
    })
  })
  it('never escalates when escalation is disabled', () => {
    expect(shouldEscalate({ ...BASE, escalationEnabled: false })).toEqual({
      escalate: false,
      reason: 'escalation_disabled',
    })
  })
  it('never escalates a confirmed dose', () => {
    expect(shouldEscalate({ ...BASE, doseStillUnconfirmed: false })).toEqual({
      escalate: false,
      reason: 'dose_confirmed',
    })
  })
  it('never escalates twice', () => {
    expect(shouldEscalate({ ...BASE, escalationStatus: 'notified' })).toEqual({
      escalate: false,
      reason: 'already_escalated',
    })
    expect(shouldEscalate({ ...BASE, escalationStatus: 'declined' })).toEqual({
      escalate: false,
      reason: 'already_escalated',
    })
  })
  it('a pending help request may still escalate', () => {
    expect(shouldEscalate({ ...BASE, escalationStatus: 'pending' })).toEqual({
      escalate: true,
    })
  })
  it('never escalates without an active caregiver', () => {
    expect(shouldEscalate({ ...BASE, hasActiveCaregiver: false })).toEqual({
      escalate: false,
      reason: 'no_active_caregiver',
    })
  })
})

describe('escalationMessage', () => {
  const INPUT = {
    patientName: 'Ravi',
    medicationName: 'Amlodipine',
    doseAmount: '5 mg',
    scheduledTimeLabel: '8:30 AM',
  }
  it('includes medicine details only when consented', () => {
    const detailed = escalationMessage({ ...INPUT, speakMedicineDetails: true, reason: 'unconfirmed' })
    expect(detailed).toContain('Amlodipine')
    expect(detailed).toContain('8:30 AM')
    const generic = escalationMessage({ ...INPUT, speakMedicineDetails: false, reason: 'unconfirmed' })
    expect(generic).not.toContain('Amlodipine')
    expect(generic).toContain('has not confirmed a scheduled medicine dose')
  })
  it('a help request says the patient asked for help', () => {
    const message = escalationMessage({ ...INPUT, speakMedicineDetails: false, reason: 'help' })
    expect(message).toContain('asked for help')
    expect(message).toContain('Please check on them')
  })
  it('names the patient when known', () => {
    expect(
      escalationMessage({ ...INPUT, speakMedicineDetails: false, reason: 'unconfirmed' }),
    ).toContain('Ravi')
    expect(
      escalationMessage({ ...INPUT, patientName: null, speakMedicineDetails: false, reason: 'unconfirmed' }),
    ).toContain('Your patient')
  })
})
