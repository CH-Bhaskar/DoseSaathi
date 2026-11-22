import { describe, expect, it } from 'vitest'
import {
  clampSpeechRate,
  escapeXml,
  redirectTo,
  resolveVoice,
  sayAndGather,
  sayAndHangup,
  twilioLanguage,
  voiceFor,
} from './twiml'

describe('escapeXml', () => {
  it('escapes all five XML special characters', () => {
    expect(escapeXml('<a href="x">&\'y\'</a>')).toBe(
      '&lt;a href=&quot;x&quot;&gt;&amp;&apos;y&apos;&lt;/a&gt;',
    )
  })
  it('leaves plain text untouched', () => {
    expect(escapeXml('Hello, Ravi.')).toBe('Hello, Ravi.')
  })
})

describe('clampSpeechRate', () => {
  it('passes valid rates through', () => {
    expect(clampSpeechRate(0.9)).toBe(0.9)
    expect(clampSpeechRate(1)).toBe(1)
  })
  it('clamps to Twilio range 0.5–2.0', () => {
    expect(clampSpeechRate(0.2)).toBe(0.5)
    expect(clampSpeechRate(3)).toBe(2)
  })
  it('falls back to 1.0 for missing or invalid rates', () => {
    expect(clampSpeechRate(null)).toBe(1)
    expect(clampSpeechRate(undefined)).toBe(1)
    expect(clampSpeechRate(Number.NaN)).toBe(1)
  })
})

describe('voiceFor / twilioLanguage', () => {
  it('uses an Indian voice per language', () => {
    expect(voiceFor('en')).toBe('Polly.Aditi')
    expect(voiceFor('kn')).toBe('Polly.Kajal')
  })
  it('uses the Indian locale for speech recognition', () => {
    expect(twilioLanguage('en')).toBe('en-IN')
    expect(twilioLanguage('kn')).toBe('kn-IN')
  })
})

describe('resolveVoice', () => {
  it('uses a known preferred voice for the language', () => {
    expect(resolveVoice('en', 'Polly.Raveena')).toEqual({
      voice: 'Polly.Raveena',
      preferredAvailable: true,
    })
  })
  it('falls back to the same-language default for an unknown voice', () => {
    const resolved = resolveVoice('kn', 'Polly.Aditi')
    expect(resolved.voice).toBe('Polly.Kajal')
    expect(resolved.preferredAvailable).toBe(false)
  })
  it('never switches languages on fallback', () => {
    const resolved = resolveVoice('kn', 'SomeVoice')
    expect(resolved.voice).toBe('Polly.Kajal')
  })
  it('uses the default when no preference is set', () => {
    expect(resolveVoice('en', null)).toEqual({
      voice: 'Polly.Aditi',
      preferredAvailable: true,
    })
  })
})

describe('sayAndHangup', () => {
  it('builds a valid TwiML document with Say and Hangup', () => {
    const twiml = sayAndHangup(['Hello.', 'Goodbye.'], 'en', 0.9)
    expect(twiml).toContain('<?xml version="1.0" encoding="UTF-8"?>')
    expect(twiml).toContain('<Response>')
    expect(twiml).toContain('<Say voice="Polly.Aditi" language="en-IN" rate="0.9">Hello.</Say>')
    expect(twiml).toContain('<Hangup/>')
    expect(twiml).toContain('</Response>')
  })
  it('escapes spoken text', () => {
    const twiml = sayAndHangup(['Amlodipine & Metformin'], 'en', 1)
    expect(twiml).toContain('Amlodipine &amp; Metformin')
    expect(twiml).not.toContain('Amlodipine & Metformin')
  })
})

describe('sayAndGather', () => {
  it('gathers speech and DTMF when speech is available', () => {
    const twiml = sayAndGather({
      lines: ['Press 1.'],
      language: 'en',
      rate: 1,
      actionUrl: 'https://example.com/menu',
      speechAvailable: true,
    })
    expect(twiml).toContain('input="speech dtmf"')
    expect(twiml).toContain('language="en-IN"')
    expect(twiml).toContain('action="https://example.com/menu"')
  })
  it('falls back to keypad-only when speech is unavailable', () => {
    const twiml = sayAndGather({
      lines: ['Press 1.'],
      language: 'kn',
      rate: 1,
      actionUrl: 'https://example.com/menu',
      speechAvailable: false,
    })
    expect(twiml).toContain('input="dtmf"')
    expect(twiml).not.toContain('input="speech dtmf"')
  })
  it('redirects back to the action URL on no input', () => {
    const twiml = sayAndGather({
      lines: ['Press 1.'],
      language: 'en',
      rate: 1,
      actionUrl: 'https://example.com/menu?a=1&b=2',
      speechAvailable: true,
    })
    expect(twiml).toContain(
      '<Redirect method="POST">https://example.com/menu?a=1&amp;b=2</Redirect>',
    )
  })
})

describe('redirectTo', () => {
  it('builds a redirect document', () => {
    expect(redirectTo('https://example.com/next')).toBe(
      '<?xml version="1.0" encoding="UTF-8"?><Response><Redirect method="POST">https://example.com/next</Redirect></Response>',
    )
  })
})
