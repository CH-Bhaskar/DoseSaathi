/* Call-preference defaults: the call language must follow the
 * patient's preferred language, not hard-code English. A Kannada
 * patient who enables calls without touching the language selector
 * must get Kannada calls. */
import { describe, expect, it } from 'vitest'
import {
  callsConfigured,
  defaultCallLanguage,
  defaultCallPreferences,
} from './callPrefs'

describe('defaultCallLanguage', () => {
  it('uses the profile preferred language when it is supported', () => {
    expect(defaultCallLanguage('kn', 'en')).toBe('kn')
    expect(defaultCallLanguage('en', 'kn')).toBe('en')
  })

  it('falls back to the app language when no profile language is given', () => {
    expect(defaultCallLanguage(null, 'kn')).toBe('kn')
    expect(defaultCallLanguage(undefined, 'kn')).toBe('kn')
    expect(defaultCallLanguage('', 'kn')).toBe('kn')
  })

  it('falls back to the app language for an unsupported profile language', () => {
    expect(defaultCallLanguage('hi', 'kn')).toBe('kn')
    expect(defaultCallLanguage('xx', 'en')).toBe('en')
  })

  it('falls back to English only as the last resort', () => {
    expect(defaultCallLanguage(null, undefined)).toBe('en')
    expect(defaultCallLanguage('hi', undefined)).toBe('en')
  })
})

describe('defaultCallPreferences', () => {
  it('defaults the call language to the patient preferred language', () => {
    const prefs = defaultCallPreferences('user-1', 'kn', 'en')
    expect(prefs.language).toBe('kn')
    expect(prefs.user_id).toBe('user-1')
  })

  it('defaults the call language to the app language without a profile language', () => {
    const prefs = defaultCallPreferences('user-1', null, 'kn')
    expect(prefs.language).toBe('kn')
  })

  it('keeps the safe defaults: calls off, consent not given', () => {
    const prefs = defaultCallPreferences('user-1', 'kn', 'kn')
    expect(prefs.calls_enabled).toBe(false)
    expect(prefs.consent_calls).toBe(false)
    expect(prefs.consent_escalation).toBe(false)
    expect(prefs.paused).toBe(false)
    expect(prefs.quiet_hours_start).toBe('21:00')
    expect(prefs.quiet_hours_end).toBe('07:00')
  })
})

describe('callsConfigured', () => {
  it('is false without the Twilio flag (and without Supabase configured)', () => {
    // No VITE_TWILIO_CONFIGURED in the test env, and no Supabase
    // credentials either — calls must never be reported as configured.
    expect(callsConfigured()).toBe(false)
  })
})
