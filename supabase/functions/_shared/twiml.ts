/* TwiML builders for the call flow. Pure — no Deno imports.
 *
 * All spoken text is XML-escaped before it is embedded, so a medicine
 * name or patient name can never break the TwiML document. Voice is a
 * warm, calm Polly voice; the speech rate comes from the patient's
 * call_preferences.speech_rate (clamped to Twilio's 0.5–2.0 range).
 * The voice is never presented as human — see prompts.ts. */

import type { CallLanguage } from './types'

/** Escape text for safe inclusion in TwiML. */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** Clamp a speech rate to Twilio's supported range. Invalid input
 * falls back to 1.0 (normal speed). */
export function clampSpeechRate(rate: number | null | undefined): number {
  if (typeof rate !== 'number' || !Number.isFinite(rate)) return 1
  return Math.min(2, Math.max(0.5, rate))
}

/** A warm, calm voice per language. en-IN uses Polly Aditi, kn-IN uses
 * Polly Kajal — both are Indian-accent neural voices. The caller must
 * pass the language the patient chose; this function never switches
 * languages silently. */
export function voiceFor(language: CallLanguage): string {
  return language === 'kn' ? 'Polly.Kajal' : 'Polly.Aditi'
}

/** Voices known to exist for each language. A preferred voice outside
 * this list is treated as unavailable — never silently swapped for a
 * voice in another language. */
const KNOWN_VOICES: Record<CallLanguage, string[]> = {
  en: ['Polly.Aditi', 'Polly.Raveena'],
  kn: ['Polly.Kajal'],
}

/** Resolve the voice to speak with. When the patient named a preferred
 * voice and it exists for their language, it is used; otherwise the
 * language default is used and `preferredAvailable` is false, so the
 * caller can log the fallback honestly. The language NEVER changes. */
export function resolveVoice(
  language: CallLanguage,
  preferredVoiceName: string | null | undefined,
): { voice: string; preferredAvailable: boolean } {
  const preferred = (preferredVoiceName ?? '').trim()
  if (preferred.length > 0 && KNOWN_VOICES[language].includes(preferred)) {
    return { voice: preferred, preferredAvailable: true }
  }
  return { voice: voiceFor(language), preferredAvailable: preferred.length === 0 }
}

/** Language code for <Say> / <Gather> speech recognition. */
export function twilioLanguage(language: CallLanguage): string {
  return language === 'kn' ? 'kn-IN' : 'en-IN'
}

function sayTag(
  text: string,
  language: CallLanguage,
  rate: number,
  voice?: string,
): string {
  return `<Say voice="${voice ?? voiceFor(language)}" language="${twilioLanguage(language)}" rate="${clampSpeechRate(rate)}">${escapeXml(text)}</Say>`
}

/** A TwiML document that speaks one or more lines, then hangs up. */
export function sayAndHangup(
  lines: string[],
  language: CallLanguage,
  rate: number,
  voice?: string,
): string {
  const says = lines.map((line) => sayTag(line, language, rate, voice)).join('')
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${says}<Hangup/></Response>`
}

/** A TwiML document that speaks lines, then gathers keypad AND speech
 * input and posts the result to `actionUrl`. When speech recognition is
 * unavailable (speechAvailable === false) the Gather is keypad-only and
 * the caller should say so first (SPEECH_UNAVAILABLE_PROMPT). */
export function sayAndGather(input: {
  lines: string[]
  language: CallLanguage
  rate: number
  voice?: string
  actionUrl: string
  speechAvailable: boolean
  /** Seconds of silence before the gather times out. */
  timeoutSeconds?: number
  /** Maximum digits to accept (1 for a menu key). */
  numDigits?: number
}): string {
  const says = input.lines
    .map((line) => sayTag(line, input.language, input.rate, input.voice))
    .join('')
  const timeout = input.timeoutSeconds ?? 8
  const numDigits = input.numDigits ?? 1
  const gatherAttrs = input.speechAvailable
    ? `input="speech dtmf" language="${twilioLanguage(input.language)}" speechTimeout="auto" timeout="${timeout}" numDigits="${numDigits}"`
    : `input="dtmf" timeout="${timeout}" numDigits="${numDigits}"`
  return (
    `<?xml version="1.0" encoding="UTF-8"?><Response>${says}` +
    `<Gather ${gatherAttrs} action="${escapeXml(input.actionUrl)}" method="POST">` +
    `</Gather>` +
    // No input at all: Twilio falls through to this redirect, which
    // re-requests the same step so the webhook can repeat the menu.
    `<Redirect method="POST">${escapeXml(input.actionUrl)}</Redirect>` +
    `</Response>`
  )
}

/** A TwiML document that only redirects to another step. */
export function redirectTo(url: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Redirect method="POST">${escapeXml(url)}</Redirect></Response>`
}
