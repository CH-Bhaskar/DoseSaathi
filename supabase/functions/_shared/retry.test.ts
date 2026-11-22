import { describe, expect, it } from 'vitest'
import {
  MAX_RETRIES,
  effectiveRetryCap,
  nextRetryAt,
  retryStateAfter,
  shouldRetry,
} from './retry'

describe('effectiveRetryCap', () => {
  it('caps at MAX_RETRIES (3) whatever the stored value says', () => {
    expect(MAX_RETRIES).toBe(3)
    expect(effectiveRetryCap(10)).toBe(3)
    expect(effectiveRetryCap(3)).toBe(3)
  })
  it('passes smaller values through', () => {
    expect(effectiveRetryCap(2)).toBe(2)
    expect(effectiveRetryCap(0)).toBe(0)
  })
  it('treats missing or invalid values as 0 retries', () => {
    expect(effectiveRetryCap(null)).toBe(0)
    expect(effectiveRetryCap(undefined)).toBe(0)
    expect(effectiveRetryCap(Number.NaN)).toBe(0)
    expect(effectiveRetryCap(-2)).toBe(0)
  })
})

describe('shouldRetry', () => {
  it('retries no_answer, busy, failed, and voicemail under the cap', () => {
    for (const status of ['no_answer', 'busy', 'failed', 'voicemail'] as const) {
      expect(
        shouldRetry({ status, retryCount: 0, configuredRetries: 2 }),
      ).toBe(true)
    }
  })
  it('never retries a completed call', () => {
    expect(
      shouldRetry({ status: 'completed', retryCount: 0, configuredRetries: 3 }),
    ).toBe(false)
  })
  it('never retries queued, calling, or cancelled attempts', () => {
    for (const status of ['queued', 'calling', 'cancelled'] as const) {
      expect(
        shouldRetry({ status, retryCount: 0, configuredRetries: 3 }),
      ).toBe(false)
    }
  })
  it('stops at the cap — no endless retry loops', () => {
    expect(
      shouldRetry({ status: 'no_answer', retryCount: 3, configuredRetries: 3 }),
    ).toBe(false)
    expect(
      shouldRetry({ status: 'no_answer', retryCount: 2, configuredRetries: 3 }),
    ).toBe(true)
    expect(
      shouldRetry({ status: 'no_answer', retryCount: 1, configuredRetries: 1 }),
    ).toBe(false)
  })
})

describe('nextRetryAt', () => {
  it('adds the configured delay', () => {
    expect(nextRetryAt('2026-11-22T03:00:00.000Z', 30)).toBe(
      '2026-11-22T03:30:00.000Z',
    )
  })
  it('falls back to 15 minutes for missing or non-positive delays', () => {
    expect(nextRetryAt('2026-11-22T03:00:00.000Z', null)).toBe(
      '2026-11-22T03:15:00.000Z',
    )
    expect(nextRetryAt('2026-11-22T03:00:00.000Z', 0)).toBe(
      '2026-11-22T03:15:00.000Z',
    )
  })
})

describe('retryStateAfter', () => {
  it('schedules the next retry when one is due', () => {
    const state = retryStateAfter({
      status: 'no_answer',
      retryCount: 0,
      configuredRetries: 2,
      retryDelayMinutes: 20,
      nowIso: '2026-11-22T03:00:00.000Z',
    })
    expect(state.willRetry).toBe(true)
    expect(state.nextRetryAt).toBe('2026-11-22T03:20:00.000Z')
  })
  it('clears next_retry_at when no retry follows', () => {
    const state = retryStateAfter({
      status: 'completed',
      retryCount: 0,
      configuredRetries: 2,
      retryDelayMinutes: 20,
      nowIso: '2026-11-22T03:00:00.000Z',
    })
    expect(state.willRetry).toBe(false)
    expect(state.nextRetryAt).toBeNull()
  })
})
