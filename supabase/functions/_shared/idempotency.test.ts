import { describe, expect, it } from 'vitest'
import { buildIdempotencyKey, parseIdempotencyKey } from './idempotency'

const INPUT = {
  patientId: '11111111-1111-1111-1111-111111111111',
  scheduleId: '22222222-2222-2222-2222-222222222222',
  scheduledDate: '2026-11-22',
  scheduledTime: '08:30',
  attemptNumber: 1,
}

describe('buildIdempotencyKey', () => {
  it('is deterministic for the same dose and attempt', () => {
    expect(buildIdempotencyKey(INPUT)).toBe(buildIdempotencyKey(INPUT))
    expect(buildIdempotencyKey(INPUT)).toBe(
      'call:11111111-1111-1111-1111-111111111111:22222222-2222-2222-2222-222222222222:2026-11-22:08:30:a1',
    )
  })
  it('differs by attempt number', () => {
    expect(buildIdempotencyKey({ ...INPUT, attemptNumber: 2 })).not.toBe(
      buildIdempotencyKey(INPUT),
    )
  })
  it('differs by date and time', () => {
    expect(buildIdempotencyKey({ ...INPUT, scheduledDate: '2026-11-23' })).not.toBe(
      buildIdempotencyKey(INPUT),
    )
    expect(buildIdempotencyKey({ ...INPUT, scheduledTime: '20:30' })).not.toBe(
      buildIdempotencyKey(INPUT),
    )
  })
  it('truncates seconds off the time', () => {
    expect(buildIdempotencyKey({ ...INPUT, scheduledTime: '08:30:00' })).toBe(
      buildIdempotencyKey(INPUT),
    )
  })
})

describe('parseIdempotencyKey', () => {
  it('round-trips a built key', () => {
    expect(parseIdempotencyKey(buildIdempotencyKey(INPUT))).toEqual({
      patientId: INPUT.patientId,
      scheduleId: INPUT.scheduleId,
      scheduledDate: '2026-11-22',
      scheduledTime: '08:30',
      attemptNumber: 1,
    })
  })
  it('returns null for anything else', () => {
    expect(parseIdempotencyKey('not-a-key')).toBeNull()
    expect(parseIdempotencyKey('call:abc')).toBeNull()
    expect(parseIdempotencyKey('')).toBeNull()
  })
})
