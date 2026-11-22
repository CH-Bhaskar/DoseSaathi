import { describe, expect, it } from 'vitest'
import {
  addMinutesIso,
  isDoseDue,
  isInQuietHours,
  localMinutesSinceMidnight,
  minutesSinceMidnight,
  timezoneOffsetMinutes,
  zonedTimeToUtc,
} from './time'

describe('minutesSinceMidnight', () => {
  it('parses HH:MM', () => {
    expect(minutesSinceMidnight('00:00')).toBe(0)
    expect(minutesSinceMidnight('08:30')).toBe(510)
    expect(minutesSinceMidnight('23:59')).toBe(1439)
  })
  it('accepts HH:MM:SS', () => {
    expect(minutesSinceMidnight('21:00:00')).toBe(1260)
  })
  it('rejects invalid input', () => {
    expect(minutesSinceMidnight(null)).toBeNull()
    expect(minutesSinceMidnight(undefined)).toBeNull()
    expect(minutesSinceMidnight('')).toBeNull()
    expect(minutesSinceMidnight('25:00')).toBeNull()
    expect(minutesSinceMidnight('12:60')).toBeNull()
    expect(minutesSinceMidnight('nope')).toBeNull()
  })
})

describe('localMinutesSinceMidnight', () => {
  it('converts UTC to Asia/Kolkata (+5:30)', () => {
    // 16:00 UTC = 21:30 IST
    expect(localMinutesSinceMidnight(new Date('2026-11-22T16:00:00Z'), 'Asia/Kolkata')).toBe(1290)
  })
  it('falls back to UTC for an invalid timezone', () => {
    expect(localMinutesSinceMidnight(new Date('2026-11-22T16:00:00Z'), 'Not/AZone')).toBe(960)
  })
})

describe('isInQuietHours', () => {
  // 2026-11-22T15:30:00Z = 21:00 IST; 2026-11-22T01:30:00Z = 07:00 IST.
  it('overnight window: at the start minute is quiet', () => {
    expect(isInQuietHours(new Date('2026-11-22T15:30:00Z'), 'Asia/Kolkata', '21:00', '07:00')).toBe(true)
  })
  it('overnight window: just before the start minute is not quiet', () => {
    expect(isInQuietHours(new Date('2026-11-22T15:29:00Z'), 'Asia/Kolkata', '21:00', '07:00')).toBe(false)
  })
  it('overnight window: after midnight is quiet', () => {
    // 02:00 IST
    expect(isInQuietHours(new Date('2026-11-21T20:30:00Z'), 'Asia/Kolkata', '21:00', '07:00')).toBe(true)
  })
  it('overnight window: at the end minute is callable again', () => {
    expect(isInQuietHours(new Date('2026-11-22T01:30:00Z'), 'Asia/Kolkata', '21:00', '07:00')).toBe(false)
  })
  it('overnight window: just before the end minute is quiet', () => {
    expect(isInQuietHours(new Date('2026-11-22T01:29:00Z'), 'Asia/Kolkata', '21:00', '07:00')).toBe(true)
  })
  it('overnight window: midday is not quiet', () => {
    expect(isInQuietHours(new Date('2026-11-22T06:30:00Z'), 'Asia/Kolkata', '21:00', '07:00')).toBe(false)
  })
  it('daytime window: boundaries are [start, end)', () => {
    expect(isInQuietHours(new Date('2026-11-22T07:29:00Z'), 'Asia/Kolkata', '13:00', '14:00')).toBe(false)
    expect(isInQuietHours(new Date('2026-11-22T07:30:00Z'), 'Asia/Kolkata', '13:00', '14:00')).toBe(true)
    expect(isInQuietHours(new Date('2026-11-22T08:29:00Z'), 'Asia/Kolkata', '13:00', '14:00')).toBe(true)
    expect(isInQuietHours(new Date('2026-11-22T08:30:00Z'), 'Asia/Kolkata', '13:00', '14:00')).toBe(false)
  })
  it('missing or invalid bounds mean no quiet hours', () => {
    expect(isInQuietHours(new Date(), 'Asia/Kolkata', null, '07:00')).toBe(false)
    expect(isInQuietHours(new Date(), 'Asia/Kolkata', '21:00', null)).toBe(false)
    expect(isInQuietHours(new Date(), 'Asia/Kolkata', 'bad', '07:00')).toBe(false)
  })
  it('equal start and end mean no quiet hours', () => {
    expect(isInQuietHours(new Date(), 'Asia/Kolkata', '21:00', '21:00')).toBe(false)
  })
})

describe('timezoneOffsetMinutes', () => {
  it('Asia/Kolkata is +330', () => {
    expect(timezoneOffsetMinutes(new Date('2026-11-22T12:00:00Z'), 'Asia/Kolkata')).toBe(330)
  })
  it('America/New_York is -300 in winter, -240 in summer', () => {
    expect(timezoneOffsetMinutes(new Date('2026-01-15T12:00:00Z'), 'America/New_York')).toBe(-300)
    expect(timezoneOffsetMinutes(new Date('2026-07-15T12:00:00Z'), 'America/New_York')).toBe(-240)
  })
})

describe('zonedTimeToUtc', () => {
  it('converts an IST local time to UTC', () => {
    expect(zonedTimeToUtc('2026-11-22', '08:30', 'Asia/Kolkata')?.toISOString()).toBe(
      '2026-11-22T03:00:00.000Z',
    )
  })
  it('converts a New York winter time to UTC', () => {
    expect(zonedTimeToUtc('2026-11-22', '08:30', 'America/New_York')?.toISOString()).toBe(
      '2026-11-22T13:30:00.000Z',
    )
  })
  it('converts a New York summer time to UTC (DST)', () => {
    expect(zonedTimeToUtc('2026-07-22', '08:30', 'America/New_York')?.toISOString()).toBe(
      '2026-07-22T12:30:00.000Z',
    )
  })
  it('returns null for invalid input', () => {
    expect(zonedTimeToUtc('2026-13-22', '08:30', 'Asia/Kolkata')).toBeNull()
    expect(zonedTimeToUtc('2026-11-22', '25:30', 'Asia/Kolkata')).toBeNull()
    expect(zonedTimeToUtc('2026-11-22', '08:30', 'Not/AZone')).toBeNull()
  })
})

describe('isDoseDue', () => {
  it('a dose due 5 minutes ago is due', () => {
    expect(isDoseDue('2026-11-22', '08:30', 'Asia/Kolkata', new Date('2026-11-22T03:05:00Z'))).toBe(true)
  })
  it('a dose due exactly now is due', () => {
    expect(isDoseDue('2026-11-22', '08:30', 'Asia/Kolkata', new Date('2026-11-22T03:00:00Z'))).toBe(true)
  })
  it('a dose due 16 minutes ago is outside the default window', () => {
    expect(isDoseDue('2026-11-22', '08:30', 'Asia/Kolkata', new Date('2026-11-22T03:16:00Z'))).toBe(false)
  })
  it('a future dose is not due', () => {
    expect(isDoseDue('2026-11-22', '08:30', 'Asia/Kolkata', new Date('2026-11-22T02:59:00Z'))).toBe(false)
  })
  it('the window is configurable', () => {
    expect(isDoseDue('2026-11-22', '08:30', 'Asia/Kolkata', new Date('2026-11-22T03:20:00Z'), 30)).toBe(true)
  })
})

describe('addMinutesIso', () => {
  it('adds minutes across the hour', () => {
    expect(addMinutesIso('2026-11-22T03:00:00.000Z', 90)).toBe('2026-11-22T04:30:00.000Z')
  })
})
