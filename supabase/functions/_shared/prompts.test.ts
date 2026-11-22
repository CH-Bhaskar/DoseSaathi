import { describe, expect, it } from 'vitest'
import {
  CONFIRM_PROMPT,
  CONFIRMED_PROMPT,
  GOODBYE_PROMPT,
  HELP_PROMPT,
  LATER_PROMPT,
  MENU_PROMPT,
  NOT_UNDERSTOOD_PROMPT,
  SAFETY_LINE,
  SPEECH_UNAVAILABLE_PROMPT,
  greetingPrompt,
  voicemailPrompt,
} from './prompts'

const CTX = {
  patientName: 'Ravi',
  medicationName: 'Amlodipine',
  doseAmount: '5 mg',
  scheduledTimeLabel: '8:30 AM',
}

describe('SAFETY_LINE', () => {
  it('tells the patient to follow their prescription and ask a doctor or pharmacist', () => {
    expect(SAFETY_LINE.en).toContain('prescription')
    expect(SAFETY_LINE.en).toContain('doctor or pharmacist')
    expect(SAFETY_LINE.kn.length).toBeGreaterThan(0)
    expect(SAFETY_LINE.kn).toContain('ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್')
  })
})

describe('greetingPrompt', () => {
  it('speaks medicine details only when consented', () => {
    const detailed = greetingPrompt(CTX, 'en', true)
    expect(detailed).toContain('Amlodipine')
    expect(detailed).toContain('5 mg')
    const generic = greetingPrompt(CTX, 'en', false)
    expect(generic).not.toContain('Amlodipine')
    expect(generic).toContain('scheduled medicine')
  })
  it('uses the consented name, and never prints "null"', () => {
    expect(greetingPrompt(CTX, 'en', false)).toContain('Ravi')
    const anonymous = greetingPrompt({ ...CTX, patientName: null }, 'en', false)
    expect(anonymous).not.toContain('null')
    expect(anonymous).toContain('Hello.')
  })
  it('never tells the patient to take an extra dose, change a dose, or take a missed dose late', () => {
    const forbidden = ['extra dose', 'double dose', 'change your dose', 'take a missed dose', 'take it now']
    for (const language of ['en', 'kn'] as const) {
      const prompt = greetingPrompt(CTX, language, true)
      for (const phrase of forbidden) {
        expect(prompt.toLowerCase()).not.toContain(phrase)
      }
    }
  })
  it('asks whether the scheduled medicine was taken', () => {
    expect(greetingPrompt(CTX, 'en', false)).toContain('Have you taken your scheduled medicine?')
  })
  it('identifies the caller as DoseSaathi, never as a human', () => {
    expect(greetingPrompt(CTX, 'en', false)).toContain('DoseSaathi')
    expect(greetingPrompt(CTX, 'en', false)).not.toMatch(/my name is/i)
  })
})

describe('menu and outcome prompts', () => {
  it('the menu offers 1 taken / 2 later / 3 help', () => {
    expect(MENU_PROMPT.en).toContain('Press 1')
    expect(MENU_PROMPT.en).toContain('Press 2')
    expect(MENU_PROMPT.en).toContain('Press 3')
    expect(MENU_PROMPT.kn).toContain('1')
    expect(MENU_PROMPT.kn).toContain('2')
    expect(MENU_PROMPT.kn).toContain('3')
  })
  it('the confirmation prompt repeats the claim back and offers a way back', () => {
    expect(CONFIRM_PROMPT.en).toContain('You said you have taken')
    expect(CONFIRM_PROMPT.en).toContain('Press 1 to confirm')
    expect(CONFIRM_PROMPT.en).toContain('press 2 to go back')
  })
  it('later and help prompts never record a dose as taken', () => {
    expect(LATER_PROMPT.en).not.toContain('recorded as taken')
    expect(HELP_PROMPT.en).not.toContain('recorded as taken')
    expect(CONFIRMED_PROMPT.en).toContain('recorded as taken')
  })
  it('the help prompt directs emergencies to emergency services', () => {
    expect(HELP_PROMPT.en).toContain('emergency services')
  })
  it('the speech fallback says voice answers are unavailable', () => {
    expect(SPEECH_UNAVAILABLE_PROMPT.en).toContain('not available')
    expect(SPEECH_UNAVAILABLE_PROMPT.en).toContain('keypad')
  })
  it('all prompts exist in both languages', () => {
    for (const prompts of [
      MENU_PROMPT,
      CONFIRM_PROMPT,
      CONFIRMED_PROMPT,
      LATER_PROMPT,
      HELP_PROMPT,
      NOT_UNDERSTOOD_PROMPT,
      SPEECH_UNAVAILABLE_PROMPT,
      GOODBYE_PROMPT,
    ]) {
      expect(prompts.en.length).toBeGreaterThan(0)
      expect(prompts.kn.length).toBeGreaterThan(0)
    }
  })
})

describe('voicemailPrompt', () => {
  it('stays generic unless medicine details were consented', () => {
    const generic = voicemailPrompt(CTX, 'en', false)
    expect(generic).not.toContain('Amlodipine')
    expect(generic).not.toContain('5 mg')
    expect(generic).toContain('scheduled medicine')
  })
  it('includes details when consented', () => {
    const detailed = voicemailPrompt(CTX, 'en', true)
    expect(detailed).toContain('Amlodipine')
    expect(detailed).toContain('8:30 AM')
  })
  it('includes the safety line in both modes', () => {
    expect(voicemailPrompt(CTX, 'en', false)).toContain('prescription instructions')
    expect(voicemailPrompt(CTX, 'en', true)).toContain('prescription instructions')
  })
})
