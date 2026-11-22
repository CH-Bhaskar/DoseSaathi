/* i18n parity: every key exists in both dictionaries, with the same
 * interpolation placeholders. Loads the JSON as raw text (?raw) —
 * tsconfig does not enable resolveJsonModule, and node:fs types are
 * not available to the app tsconfig. */
import { describe, expect, it } from 'vitest'
import enRaw from './en.json?raw'
import knRaw from './kn.json?raw'

type Dict = Record<string, unknown>

function load(raw: string): Dict {
  return JSON.parse(raw) as Dict
}

function flatten(d: Dict, prefix = ''): Map<string, string> {
  const out = new Map<string, string>()
  for (const [key, value] of Object.entries(d)) {
    const full = prefix ? `${prefix}.${key}` : key
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      for (const [k, v] of flatten(value as Dict, full)) out.set(k, v)
    } else {
      out.set(full, String(value))
    }
  }
  return out
}

function placeholders(s: string): string[] {
  return [...s.matchAll(/\{\{(\w+)\}\}/g)]
    .map((m) => m[1] as string)
    .sort()
}

const EXPECTED_CALLS_KEYS = [
  'calls.historyTitle',
  'calls.historySubtitle',
  'calls.refresh',
  'calls.filterAll',
  'calls.loading',
  'calls.loadError',
  'calls.noCalls',
  'calls.noCallsText',
  'calls.status.queued',
  'calls.status.calling',
  'calls.status.completed',
  'calls.status.no_answer',
  'calls.status.busy',
  'calls.status.failed',
  'calls.status.voicemail',
  'calls.status.cancelled',
  'calls.scheduledFor',
  'calls.attemptNumber',
  'calls.retryScheduled',
  'calls.escalation',
  'calls.escalationStatus.none',
  'calls.escalationStatus.pending',
  'calls.escalationStatus.notified',
  'calls.escalationStatus.declined',
  'calls.response',
  'calls.responseType.keypad',
  'calls.responseType.speech',
  'calls.responseType.none',
  'calls.keyPressed',
  'calls.confirmed',
  'calls.notConfirmed',
  'calls.viewDetails',
  'calls.dialog.title',
  'calls.dialog.text',
  'calls.dialog.safetyNote',
  'calls.dialog.confirm',
  'calls.dialog.remindLater',
  'calls.dialog.needHelp',
  'calls.dialog.confirmedResult',
  'calls.dialog.laterResult',
  'calls.dialog.helpResult',
  'calls.dialog.close',
  'calls.notConfigured.title',
  'calls.notConfigured.text',
  'calls.offline.title',
  'calls.offline.text',
  'calls.inAppStillAvailable',
]

describe('i18n parity', () => {
  const en = flatten(load(enRaw))
  const kn = flatten(load(knRaw))

  it('has the same key set in English and Kannada', () => {
    const enKeys = [...en.keys()].sort()
    const knKeys = [...kn.keys()].sort()
    expect(knKeys).toEqual(enKeys)
  })

  it('has 626 keys in each dictionary', () => {
    expect(en.size).toBe(626)
    expect(kn.size).toBe(626)
  })

  it('has all 47 calls.* keys in both dictionaries', () => {
    expect(EXPECTED_CALLS_KEYS).toHaveLength(47)
    for (const key of EXPECTED_CALLS_KEYS) {
      expect(en.has(key), `missing in en: ${key}`).toBe(true)
      expect(kn.has(key), `missing in kn: ${key}`).toBe(true)
    }
  })

  it('uses the same interpolation placeholders in both languages', () => {
    for (const [key, enValue] of en) {
      const knValue = kn.get(key)
      expect(
        placeholders(knValue ?? ''),
        `placeholder mismatch on ${key}`,
      ).toEqual(placeholders(enValue))
    }
  })

  it('has no empty translations', () => {
    for (const [key, value] of en) {
      expect(value.trim().length, `empty en value: ${key}`).toBeGreaterThan(0)
    }
    for (const [key, value] of kn) {
      expect(value.trim().length, `empty kn value: ${key}`).toBeGreaterThan(0)
    }
  })
})
