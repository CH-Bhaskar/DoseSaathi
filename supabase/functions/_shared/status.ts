/* Twilio call-status mapping for call-status.
 *
 * Rule: a call is NEVER recorded as completed/delivered unless Twilio
 * confirms it. This mapping only ever translates Twilio's own reported
 * CallStatus (plus AnsweredBy for machine detection) into a
 * call_attempts status — it never invents a delivery. */

import type { CallAttemptStatus } from './types'

/** Map Twilio's CallStatus (+ AnsweredBy) to a call_attempts status.
 * Unknown Twilio statuses map to 'failed' — an unknown outcome is
 * never treated as a delivery. */
export function mapTwilioStatus(input: {
  callStatus: string | null | undefined
  answeredBy: string | null | undefined
}): CallAttemptStatus {
  const status = (input.callStatus ?? '').trim().toLowerCase()
  const answeredBy = (input.answeredBy ?? '').trim().toLowerCase()
  // Answering-machine detection wins over 'completed': a voicemail is
  // not a delivered reminder.
  if (answeredBy === 'machine_start' || answeredBy === 'machine_end_beep' || answeredBy === 'machine_end_silence' || answeredBy === 'machine_end_other' || answeredBy === 'machine') {
    return 'voicemail'
  }
  switch (status) {
    case 'completed':
      return 'completed'
    case 'no-answer':
      return 'no_answer'
    case 'busy':
      return 'busy'
    case 'failed':
      return 'failed'
    case 'canceled':
    case 'cancelled':
      return 'cancelled'
    case 'queued':
    case 'ringing':
    case 'in-progress':
      // Still in flight — the caller keeps the attempt as 'calling'.
      return 'calling'
    default:
      return 'failed'
  }
}

/** Terminal statuses: the attempt is over and will not change again. */
export function isTerminalStatus(status: CallAttemptStatus): boolean {
  return (
    status === 'completed' ||
    status === 'no_answer' ||
    status === 'busy' ||
    status === 'failed' ||
    status === 'voicemail' ||
    status === 'cancelled'
  )
}
