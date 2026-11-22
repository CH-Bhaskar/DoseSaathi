/* Call-language resolution for the voice-call flow.
 *
 * The language of every automatic call MUST be the PATIENT's own
 * language. Resolution happens once per call-webhook request, at call
 * time (not in the scanner, not in trigger-call — neither of them
 * stores a language on the attempt, so every attempt re-resolves here):
 *
 *   1. call_preferences.language — the patient's explicit voice-call
 *      choice. Wins whenever the prefs row exists with a supported
 *      value. (Migration 006 constrains the column to ('en', 'kn'),
 *      so an unsupported prefs value is unreachable from the database;
 *      it is validated anyway as defence-in-depth, and falls through
 *      to the profile instead of breaking the call.)
 *   2. profiles.preferred_language — the patient's own language,
 *      when it is a supported language ('en' | 'kn'). This is the
 *      path for a patient who never set an explicit call language.
 *   3. 'en' — explicit, logged last resort, reachable only when both
 *      stored values are missing or unsupported. The caller logs the
 *      fallback with the stored values so a bad row is visible.
 *
 * The resolved language is used for every prompt, the <Gather>
 * language, speech interpretation, and voice resolution in that
 * request, so the language can never switch mid-call.
 *
 * Pure and dependency-free (type-only import), so it is unit-testable
 * under Node (vitest). */

import type { CallLanguage } from './types'

/** Where the resolved call language came from. */
export type CallLanguageSource = 'call_preferences' | 'profile' | 'fallback'

export interface ResolvedCallLanguage {
  language: CallLanguage
  source: CallLanguageSource
}

/** True only for a language the call flow can speak ('en' | 'kn'). */
export function isSupportedCallLanguage(value: unknown): value is CallLanguage {
  return value === 'en' || value === 'kn'
}

/** Resolve the language for one call, per the precedence above.
 * `prefsLanguage` is call_preferences.language (null/undefined when
 * the prefs row is missing); `preferredLanguage` is
 * profiles.preferred_language (null/undefined when the profile row
 * is missing). Never throws, never returns an unsupported language. */
export function resolveCallLanguage(
  prefsLanguage: unknown,
  preferredLanguage: unknown,
): ResolvedCallLanguage {
  if (isSupportedCallLanguage(prefsLanguage)) {
    return { language: prefsLanguage, source: 'call_preferences' }
  }
  if (isSupportedCallLanguage(preferredLanguage)) {
    return { language: preferredLanguage, source: 'profile' }
  }
  return { language: 'en', source: 'fallback' }
}
