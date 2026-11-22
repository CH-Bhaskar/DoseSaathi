/* Retry policy for unanswered / failed calls.
 *
 * Hard cap: no dose is ever retried more than MAX_RETRIES times (3),
 * whatever the stored preference says. A retry is scheduled only for
 * terminal non-confirming outcomes — no_answer, busy, failed, voicemail.
 * A 'completed' call that produced no confirmation is NOT retried: the
 * patient answered and chose not to confirm, and calling again would be
 * harassment, not a reminder. 'cancelled' is final too. */

import type { CallAttemptStatus } from './types'
import { addMinutesIso } from './time'

export const MAX_RETRIES = 3

/** Outcomes that may be retried. */
export const RETRYABLE_STATUSES: readonly CallAttemptStatus[] = [
  'no_answer',
  'busy',
  'failed',
  'voicemail',
]

/** The effective retry cap: the patient's configured count, clamped to
 * [0, MAX_RETRIES]. A missing or invalid value means 0 retries. */
export function effectiveRetryCap(configured: number | null | undefined): number {
  if (typeof configured !== 'number' || !Number.isFinite(configured)) return 0
  return Math.max(0, Math.min(MAX_RETRIES, Math.floor(configured)))
}

/** Should this attempt be followed by another call? */
export function shouldRetry(input: {
  status: CallAttemptStatus
  retryCount: number
  configuredRetries: number | null | undefined
}): boolean {
  if (!RETRYABLE_STATUSES.includes(input.status)) return false
  return input.retryCount < effectiveRetryCap(input.configuredRetries)
}

/** When the next retry may run: now + the configured delay. A missing or
 * non-positive delay falls back to 15 minutes. */
export function nextRetryAt(
  nowIso: string,
  retryDelayMinutes: number | null | undefined,
): string {
  const delay =
    typeof retryDelayMinutes === 'number' &&
    Number.isFinite(retryDelayMinutes) &&
    retryDelayMinutes > 0
      ? retryDelayMinutes
      : 15
  return addMinutesIso(nowIso, delay)
}

/** The retry_count / next_retry_at to store after an attempt ends. */
export function retryStateAfter(input: {
  status: CallAttemptStatus
  retryCount: number
  configuredRetries: number | null | undefined
  retryDelayMinutes: number | null | undefined
  nowIso: string
}): { retryCount: number; nextRetryAt: string | null; willRetry: boolean } {
  const willRetry = shouldRetry(input)
  return {
    retryCount: input.retryCount,
    nextRetryAt: willRetry
      ? nextRetryAt(input.nowIso, input.retryDelayMinutes)
      : null,
    willRetry,
  }
}
