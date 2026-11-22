/* Caregiver escalation gates.
 *
 * Rule: no consent, no alert — ever. An escalation is raised only when
 * ALL of these hold:
 *   1. escalation_enabled is true in call_preferences,
 *   2. consent_escalation is true (the patient consented to caregiver
 *      alerts about unconfirmed doses),
 *   3. the dose is still unconfirmed after escalation_delay_minutes,
 *   4. the attempt has not already been escalated.
 * The alert goes only to caregivers with an ACTIVE caregiver_connection
 * (status = 'active'); pending or revoked connections receive nothing.
 * A Press-3 "I need help" sets escalation_status to 'pending' and the
 * same consent gate applies before anything is sent. */

import type { EscalationStatus } from './types'

export interface EscalationGateInput {
  escalationEnabled: boolean
  consentEscalation: boolean
  /** The dose is still pending (not taken, missed, or skipped). */
  doseStillUnconfirmed: boolean
  /** Minutes since the dose was due. */
  minutesSinceDue: number
  escalationDelayMinutes: number
  escalationStatus: EscalationStatus
  /** The patient has at least one ACTIVE caregiver connection. */
  hasActiveCaregiver: boolean
}

export type EscalationDecision =
  | { escalate: true }
  | { escalate: false; reason: string }

/** Decide whether a dose may be escalated to the caregiver right now. */
export function shouldEscalate(input: EscalationGateInput): EscalationDecision {
  if (!input.escalationEnabled) {
    return { escalate: false, reason: 'escalation_disabled' }
  }
  if (!input.consentEscalation) {
    return { escalate: false, reason: 'no_consent' }
  }
  if (!input.doseStillUnconfirmed) {
    return { escalate: false, reason: 'dose_confirmed' }
  }
  if (input.escalationStatus === 'notified' || input.escalationStatus === 'declined') {
    return { escalate: false, reason: 'already_escalated' }
  }
  if (input.minutesSinceDue < input.escalationDelayMinutes) {
    return { escalate: false, reason: 'delay_not_elapsed' }
  }
  if (!input.hasActiveCaregiver) {
    return { escalate: false, reason: 'no_active_caregiver' }
  }
  return { escalate: true }
}

/** The in-app message written to notification_logs for the caregiver.
 * Medicine details are included only when the patient consented
 * (speakMedicineDetails); otherwise the alert stays generic. */
export function escalationMessage(input: {
  patientName: string | null
  medicationName: string
  doseAmount: string
  scheduledTimeLabel: string
  speakMedicineDetails: boolean
  /** 'unconfirmed' = delay elapsed with no answer; 'help' = Press 3. */
  reason: 'unconfirmed' | 'help'
}): string {
  const who = input.patientName ?? 'Your patient'
  if (input.reason === 'help') {
    return input.speakMedicineDetails
      ? `${who} asked for help during a medicine reminder call for ${input.medicationName} ${input.doseAmount} (due ${input.scheduledTimeLabel}). Please check on them.`
      : `${who} asked for help during a medicine reminder call. Please check on them.`
  }
  return input.speakMedicineDetails
    ? `${who} has not confirmed their scheduled dose of ${input.medicationName} ${input.doseAmount} (due ${input.scheduledTimeLabel}). Please check on them.`
    : `${who} has not confirmed a scheduled medicine dose. Please check on them.`
}
