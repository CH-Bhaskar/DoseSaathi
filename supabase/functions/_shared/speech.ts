/* Speech-response interpretation for the call flow.
 *
 * Speech is a convenience, never an authority: a recognised phrase only
 * ever routes the patient to the same keypad confirmation step, and an
 * unrecognised or ambiguous phrase falls back to the keypad menu with an
 * honest "I did not understand" message. Speech alone can never mark a
 * dose taken — the patient must still press 1 to confirm the repeat-back.
 *
 * Keyword lists are deliberately small and exact. Kannada keywords are
 * functional and NOT native-speaker reviewed — they need a review pass
 * before real patients use them. */

import type { CallLanguage } from './types'

export type SpeechIntent = 'taken' | 'later' | 'help' | 'unknown'

/** Simple yes/no words, per language. "Yes" after the repeat-back is
 * treated as a confirmation of the menu choice, not as a dose record. */
const TAKEN_WORDS: Record<CallLanguage, string[]> = {
  en: ['taken', 'yes i took', 'i took it', 'took it', 'done', 'finished'],
  kn: ['ತೆಗೆದುಕೊಂಡೆ', 'ತೆಗೆದುಕೊಂಡಿದ್ದೇನೆ', 'ತಿಂದಿದ್ದೇನೆ', 'ಆಯ್ತು'],
}

const LATER_WORDS: Record<CallLanguage, string[]> = {
  en: ['later', 'remind me later', 'not now', 'remind later', 'after'],
  kn: ['ನಂತರ', 'ಆಮೇಲೆ', 'ಸ್ವಲ್ಪ ಹೊತ್ತು ಬಿಟ್ಟು', 'ಆಮೇಲೆ ನೆನಪಿಸಿ'],
}

const HELP_WORDS: Record<CallLanguage, string[]> = {
  en: ['help', 'need help', 'i need help', 'problem', 'doctor', 'emergency'],
  kn: ['ಸಹಾಯ', 'ಸಹಾಯ ಬೇಕು', 'ತೊಂದರೆ', 'ವೈದ್ಯರು', 'ತುರ್ತು'],
}

function normalise(text: string): string {
  return text.toLowerCase().replace(/[.,!?;:]/g, ' ').replace(/\s+/g, ' ').trim()
}

function containsAny(text: string, words: string[]): boolean {
  return words.some((word) => text.includes(word))
}

/** Classify a recognised speech phrase. Anything ambiguous is 'unknown'
 * and the caller must fall back to the keypad menu. */
export function interpretSpeech(
  speechText: string | null | undefined,
  language: CallLanguage,
): SpeechIntent {
  if (!speechText) return 'unknown'
  const text = normalise(speechText)
  if (text.length === 0) return 'unknown'
  // Check help first: a distress phrase must never be misread as "taken".
  if (containsAny(text, HELP_WORDS[language])) return 'help'
  if (containsAny(text, TAKEN_WORDS[language])) return 'taken'
  if (containsAny(text, LATER_WORDS[language])) return 'later'
  return 'unknown'
}

/** A plain "yes" / "no" answer on the confirmation repeat-back step.
 * Returns true for yes, false for no, null for anything else. */
export function interpretYesNo(
  speechText: string | null | undefined,
  language: CallLanguage,
): boolean | null {
  if (!speechText) return null
  const text = normalise(speechText)
  const yesWords = language === 'kn' ? ['ಹೌದು', 'ಸರಿ', 'ಆಗಿದೆ'] : ['yes', 'correct', 'right']
  const noWords = language === 'kn' ? ['ಇಲ್ಲ', 'ತಪ್ಪು'] : ['no', 'wrong', 'not correct']
  if (containsAny(text, yesWords)) return true
  if (containsAny(text, noWords)) return false
  return null
}
