import { describe, expect, it } from 'vitest'
import { isSupportedCallLanguage, resolveCallLanguage } from './language'
import { MENU_PROMPT, greetingPrompt } from './prompts'
import { interpretSpeech, interpretYesNo } from './speech'
import { resolveVoice, sayAndGather, twilioLanguage, voiceFor } from './twiml'
import { TWILIO_GATHER_LANGUAGE } from './types'

const CTX = {
  patientName: 'Ravi',
  medicationName: 'Amlodipine',
  doseAmount: '5 mg',
  scheduledTimeLabel: '8:30 AM',
}

describe('resolveCallLanguage', () => {
  it("(a) prefs language 'kn' wins over profile 'en'", () => {
    expect(resolveCallLanguage('kn', 'en')).toEqual({
      language: 'kn',
      source: 'call_preferences',
    })
  })
  it("(b) missing prefs row falls back to profile preferred_language 'kn'", () => {
    expect(resolveCallLanguage(null, 'kn')).toEqual({
      language: 'kn',
      source: 'profile',
    })
    expect(resolveCallLanguage(undefined, 'kn')).toEqual({
      language: 'kn',
      source: 'profile',
    })
  })
  it("(c) prefs 'en' + profile 'kn' -> 'en' (explicit call-language choice wins)", () => {
    expect(resolveCallLanguage('en', 'kn')).toEqual({
      language: 'en',
      source: 'call_preferences',
    })
  })
  it("(d) unsupported profile value -> explicit 'en' last resort", () => {
    expect(resolveCallLanguage(null, 'fr')).toEqual({
      language: 'en',
      source: 'fallback',
    })
    expect(resolveCallLanguage(undefined, 'garbage-value')).toEqual({
      language: 'en',
      source: 'fallback',
    })
    expect(resolveCallLanguage(null, '')).toEqual({
      language: 'en',
      source: 'fallback',
    })
  })
  it('both values missing -> explicit \'en\' last resort', () => {
    expect(resolveCallLanguage(null, null)).toEqual({
      language: 'en',
      source: 'fallback',
    })
    expect(resolveCallLanguage(undefined, undefined)).toEqual({
      language: 'en',
      source: 'fallback',
    })
  })
  it('an unsupported prefs value falls through to a supported profile language', () => {
    // Migration 006 constrains call_preferences.language to ('en','kn'),
    // so this is unreachable from the database — defence-in-depth only.
    expect(resolveCallLanguage('fr', 'kn')).toEqual({
      language: 'kn',
      source: 'profile',
    })
  })
  it('unsupported prefs + unsupported profile -> explicit \'en\' last resort', () => {
    expect(resolveCallLanguage('xx', 'yy')).toEqual({
      language: 'en',
      source: 'fallback',
    })
  })
})

describe('isSupportedCallLanguage', () => {
  it("accepts 'en' and 'kn' only", () => {
    expect(isSupportedCallLanguage('en')).toBe(true)
    expect(isSupportedCallLanguage('kn')).toBe(true)
    expect(isSupportedCallLanguage('fr')).toBe(false)
    expect(isSupportedCallLanguage('EN')).toBe(false)
    expect(isSupportedCallLanguage('')).toBe(false)
    expect(isSupportedCallLanguage(null)).toBe(false)
    expect(isSupportedCallLanguage(undefined)).toBe(false)
    expect(isSupportedCallLanguage(123)).toBe(false)
  })
})

describe('resolved language drives the whole call (end to end)', () => {
  it("(e) Kannada resolution: Kannada prompts, kn-IN gather, Kajal voice, Kannada speech words", () => {
    const { language } = resolveCallLanguage(null, 'kn')
    expect(language).toBe('kn')
    expect(MENU_PROMPT[language]).toContain('1 ಒತ್ತಿ')
    expect(greetingPrompt(CTX, language, false)).toContain('ಡೋಸ್ ಸಾಥಿ')
    expect(TWILIO_GATHER_LANGUAGE[language]).toBe('kn-IN')
    expect(twilioLanguage(language)).toBe('kn-IN')
    expect(voiceFor(language)).toBe('Polly.Kajal')
    const twiml = sayAndGather({
      lines: [MENU_PROMPT[language]],
      language,
      rate: 1,
      actionUrl: 'https://example.com/menu',
      speechAvailable: true,
    })
    expect(twiml).toContain('language="kn-IN"')
    expect(twiml).toContain('voice="Polly.Kajal"')
    expect(interpretSpeech('ತೆಗೆದುಕೊಂಡೆ', language)).toBe('taken')
    expect(interpretYesNo('ಹೌದು', language)).toBe(true)
    expect(interpretYesNo('ಇಲ್ಲ', language)).toBe(false)
  })
  it('(e) English resolution: English prompts, en-IN gather, Aditi voice, English speech words', () => {
    const { language } = resolveCallLanguage('en', 'kn')
    expect(language).toBe('en')
    expect(MENU_PROMPT[language]).toContain('Press 1')
    expect(greetingPrompt(CTX, language, false)).toContain('DoseSaathi')
    expect(TWILIO_GATHER_LANGUAGE[language]).toBe('en-IN')
    expect(twilioLanguage(language)).toBe('en-IN')
    expect(voiceFor(language)).toBe('Polly.Aditi')
    const twiml = sayAndGather({
      lines: [MENU_PROMPT[language]],
      language,
      rate: 1,
      actionUrl: 'https://example.com/menu',
      speechAvailable: true,
    })
    expect(twiml).toContain('language="en-IN"')
    expect(twiml).toContain('voice="Polly.Aditi"')
    expect(interpretSpeech('I took it', language)).toBe('taken')
    expect(interpretYesNo('yes', language)).toBe(true)
    expect(interpretYesNo('no', language)).toBe(false)
  })
  it('speech words are language-specific — no cross-language misread', () => {
    const kn = resolveCallLanguage(null, 'kn').language
    const en = resolveCallLanguage('en', 'kn').language
    expect(interpretSpeech('ತೆಗೆದುಕೊಂಡೆ', en)).toBe('unknown')
    expect(interpretSpeech('I took it', kn)).toBe('unknown')
    expect(interpretYesNo('ಹೌದು', en)).toBe(null)
    expect(interpretYesNo('yes', kn)).toBe(null)
  })
  it('voice resolution for the resolved language never switches languages on fallback', () => {
    const kn = resolveCallLanguage(null, 'kn').language
    // The English default voice requested for a Kannada call: falls
    // back to the Kannada default, never to an English voice.
    expect(resolveVoice(kn, 'Polly.Aditi')).toEqual({
      voice: 'Polly.Kajal',
      preferredAvailable: false,
    })
    const en = resolveCallLanguage('en', 'kn').language
    expect(resolveVoice(en, 'Polly.Kajal')).toEqual({
      voice: 'Polly.Aditi',
      preferredAvailable: false,
    })
  })
  it('re-resolving per attempt picks up a changed preference (no cached language)', () => {
    // Each attempt re-resolves at webhook time from the rows as they
    // are now — a patient who switches their call language between
    // attempts gets the new language on the next attempt.
    expect(resolveCallLanguage('en', 'en').language).toBe('en')
    expect(resolveCallLanguage('kn', 'en').language).toBe('kn')
    expect(resolveCallLanguage(null, 'kn').language).toBe('kn')
  })
})
