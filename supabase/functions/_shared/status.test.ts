import { describe, expect, it } from 'vitest'
import { isTerminalStatus, mapTwilioStatus } from './status'

describe('mapTwilioStatus', () => {
  it('maps completed to completed', () => {
    expect(mapTwilioStatus({ callStatus: 'completed', answeredBy: null })).toBe('completed')
  })
  it('maps no-answer, busy, failed, canceled', () => {
    expect(mapTwilioStatus({ callStatus: 'no-answer', answeredBy: null })).toBe('no_answer')
    expect(mapTwilioStatus({ callStatus: 'busy', answeredBy: null })).toBe('busy')
    expect(mapTwilioStatus({ callStatus: 'failed', answeredBy: null })).toBe('failed')
    expect(mapTwilioStatus({ callStatus: 'canceled', answeredBy: null })).toBe('cancelled')
  })
  it('a machine answer is voicemail even when Twilio says completed', () => {
    for (const answeredBy of [
      'machine_start',
      'machine_end_beep',
      'machine_end_silence',
      'machine_end_other',
      'machine',
    ]) {
      expect(mapTwilioStatus({ callStatus: 'completed', answeredBy })).toBe('voicemail')
    }
  })
  it('a human answer stays completed', () => {
    expect(mapTwilioStatus({ callStatus: 'completed', answeredBy: 'human' })).toBe('completed')
  })
  it('in-flight statuses stay calling', () => {
    for (const callStatus of ['queued', 'ringing', 'in-progress']) {
      expect(mapTwilioStatus({ callStatus, answeredBy: null })).toBe('calling')
    }
  })
  it('an unknown status is never treated as a delivery', () => {
    expect(mapTwilioStatus({ callStatus: 'weird-status', answeredBy: null })).toBe('failed')
    expect(mapTwilioStatus({ callStatus: null, answeredBy: null })).toBe('failed')
    expect(mapTwilioStatus({ callStatus: '', answeredBy: null })).toBe('failed')
  })
  it('is case-insensitive', () => {
    expect(mapTwilioStatus({ callStatus: 'No-Answer', answeredBy: null })).toBe('no_answer')
    expect(mapTwilioStatus({ callStatus: 'COMPLETED', answeredBy: 'MACHINE_START' })).toBe('voicemail')
  })
})

describe('isTerminalStatus', () => {
  it('completed, no_answer, busy, failed, voicemail, cancelled are terminal', () => {
    for (const status of ['completed', 'no_answer', 'busy', 'failed', 'voicemail', 'cancelled'] as const) {
      expect(isTerminalStatus(status)).toBe(true)
    }
  })
  it('queued and calling are not terminal', () => {
    expect(isTerminalStatus('queued')).toBe(false)
    expect(isTerminalStatus('calling')).toBe(false)
  })
})
