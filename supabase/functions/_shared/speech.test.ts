import { describe, expect, it } from 'vitest'
import { interpretSpeech, interpretYesNo } from './speech'

describe('interpretSpeech (English)', () => {
  it('recognises taken phrases', () => {
    expect(interpretSpeech('I took it', 'en')).toBe('taken')
    expect(interpretSpeech('Yes, I took my medicine', 'en')).toBe('taken')
    expect(interpretSpeech('done', 'en')).toBe('taken')
  })
  it('recognises later phrases', () => {
    expect(interpretSpeech('remind me later', 'en')).toBe('later')
    expect(interpretSpeech('not now', 'en')).toBe('later')
  })
  it('recognises help phrases', () => {
    expect(interpretSpeech('I need help', 'en')).toBe('help')
    expect(interpretSpeech('help', 'en')).toBe('help')
  })
  it('help wins over taken when both appear', () => {
    expect(interpretSpeech('I took it but I need help', 'en')).toBe('help')
  })
  it('ambiguous speech is unknown', () => {
    expect(interpretSpeech('hello there', 'en')).toBe('unknown')
    expect(interpretSpeech('maybe tomorrow morning', 'en')).toBe('unknown')
    expect(interpretSpeech('', 'en')).toBe('unknown')
    expect(interpretSpeech(null, 'en')).toBe('unknown')
  })
})

describe('interpretSpeech (Kannada)', () => {
  it('recognises taken / later / help phrases', () => {
    expect(interpretSpeech('ತೆಗೆದುಕೊಂಡೆ', 'kn')).toBe('taken')
    expect(interpretSpeech('ನಂತರ', 'kn')).toBe('later')
    expect(interpretSpeech('ಸಹಾಯ ಬೇಕು', 'kn')).toBe('help')
  })
  it('ambiguous speech is unknown', () => {
    expect(interpretSpeech('ನಮಸ್ಕಾರ', 'kn')).toBe('unknown')
  })
})

describe('interpretYesNo', () => {
  it('English yes/no', () => {
    expect(interpretYesNo('yes', 'en')).toBe(true)
    expect(interpretYesNo('yes, correct', 'en')).toBe(true)
    expect(interpretYesNo('no', 'en')).toBe(false)
    expect(interpretYesNo('wrong', 'en')).toBe(false)
    expect(interpretYesNo('maybe', 'en')).toBeNull()
    expect(interpretYesNo(null, 'en')).toBeNull()
  })
  it('Kannada yes/no', () => {
    expect(interpretYesNo('ಹೌದು', 'kn')).toBe(true)
    expect(interpretYesNo('ಇಲ್ಲ', 'kn')).toBe(false)
    expect(interpretYesNo('ಅರ್ಥವಾಗಲಿಲ್ಲ', 'kn')).toBeNull()
  })
})
