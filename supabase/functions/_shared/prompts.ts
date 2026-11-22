/* Voice prompt templates for the call flow (English + Kannada).
 *
 * Style rules (per the brief): short sentences, simple words, pauses
 * between steps. The prompts are spoken by a synthetic voice and never
 * claim to be human — the greeting says "This is DoseSaathi", not a
 * person's name.
 *
 * SAFETY COPY (baked in, must survive any edit): the call never tells
 * the patient to take an extra dose, change a dose, or take a missed
 * dose late. Medication questions are always answered with the
 * prescription / doctor-or-pharmacist line. The reminder asks whether
 * the scheduled medicine was taken; it does not instruct the patient
 * to take it.
 *
 * Kannada prompts are functional and NOT native-speaker reviewed —
 * they need a review pass before real patients use them. */

import type { CallLanguage } from './types'

/** The safety line, spoken whenever the patient asks about their
 * medicine and included at the end of the help flow. */
export const SAFETY_LINE: Record<CallLanguage, string> = {
  en: 'Please follow your prescription instructions. If you have questions about your medicine, contact your doctor or pharmacist.',
  kn: 'ದಯವಿಟ್ಟು ನಿಮ್ಮ ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ಸೂಚನೆಗಳನ್ನು ಅನುಸರಿಸಿ. ನಿಮ್ಮ ಔಷಧಿಯ ಬಗ್ಗೆ ಪ್ರಶ್ನೆಗಳಿದ್ದರೆ, ನಿಮ್ಮ ವೈದ್ಯರು ಅಥವಾ ಔಷಧಿಕಾರರನ್ನು ಸಂಪರ್ಕಿಸಿ.',
}

export interface PromptContext {
  /** Patient's first name — used ONLY when the patient consented to
   * being addressed by name on calls. Pass null otherwise. */
  patientName: string | null
  medicationName: string
  doseAmount: string
  scheduledTimeLabel: string
}

/** Greeting + reminder. Medicine details are spoken only when the
 * patient consented (speakMedicineDetails); otherwise the reminder
 * stays generic. */
export function greetingPrompt(
  ctx: PromptContext,
  language: CallLanguage,
  speakMedicineDetails: boolean,
): string {
  const namePart =
    ctx.patientName !== null && ctx.patientName.length > 0
      ? language === 'kn'
        ? `ನಮಸ್ಕಾರ, ${ctx.patientName}. `
        : `Hello, ${ctx.patientName}. `
      : language === 'kn'
        ? 'ನಮಸ್ಕಾರ. '
        : 'Hello. '
  if (language === 'kn') {
    const detail = speakMedicineDetails
      ? `ಇದು ಡೋಸ್ ಸಾಥಿ ನಿಂದ ನಿಮ್ಮ ಔಷಧಿಯ ನೆನಪು. ${ctx.scheduledTimeLabel} ಸಮಯದ ನಿಮ್ಮ ${ctx.medicationName} ${ctx.doseAmount} ಡೋಸ್ ಸಮಯವಾಗಿದೆ. `
      : 'ಇದು ಡೋಸ್ ಸಾಥಿ ನಿಂದ ನಿಮ್ಮ ಔಷಧಿಯ ನೆನಪು. ನಿಮ್ಮ ನಿಗದಿತ ಔಷಧಿಯ ಸಮಯವಾಗಿದೆ. '
    return `${namePart}${detail}ನೀವು ನಿಮ್ಮ ನಿಗದಿತ ಔಷಧಿಯನ್ನು ತೆಗೆದುಕೊಂಡಿದ್ದೀರಾ?`
  }
  const detail = speakMedicineDetails
    ? `This is a medicine reminder from DoseSaathi. It is time for your scheduled dose of ${ctx.medicationName}, ${ctx.doseAmount}, due at ${ctx.scheduledTimeLabel}. `
    : 'This is a medicine reminder from DoseSaathi. It is time for your scheduled medicine. '
  return `${namePart}${detail}Have you taken your scheduled medicine?`
}

/** The keypad menu, spoken after the greeting. */
export const MENU_PROMPT: Record<CallLanguage, string> = {
  en: 'Press 1 if you have taken it. Press 2 if you would like a reminder later. Press 3 if you need help.',
  kn: 'ನೀವು ಔಷಧಿ ತೆಗೆದುಕೊಂಡಿದ್ದರೆ 1 ಒತ್ತಿ. ನಂತರ ನೆನಪು ಬೇಕಾದರೆ 2 ಒತ್ತಿ. ಸಹಾಯ ಬೇಕಾದರೆ 3 ಒತ್ತಿ.',
}

/** Repeat-back before recording a "taken" confirmation. */
export const CONFIRM_PROMPT: Record<CallLanguage, string> = {
  en: 'You said you have taken your scheduled medicine. Press 1 to confirm, or press 2 to go back.',
  kn: 'ನೀವು ನಿಮ್ಮ ನಿಗದಿತ ಔಷಧಿಯನ್ನು ತೆಗೆದುಕೊಂಡಿದ್ದೀರಿ ಎಂದು ಹೇಳಿದ್ದೀರಿ. ದೃಢೀಕರಿಸಲು 1 ಒತ್ತಿ, ಅಥವಾ ಹಿಂತಿರುಗಲು 2 ಒತ್ತಿ.',
}

export const CONFIRMED_PROMPT: Record<CallLanguage, string> = {
  en: 'Thank you. Your medicine is recorded as taken. Take care.',
  kn: 'ಧನ್ಯವಾದಗಳು. ನಿಮ್ಮ ಔಷಧಿಯನ್ನು ತೆಗೆದುಕೊಂಡಿರುವುದಾಗಿ ದಾಖಲಿಸಲಾಗಿದೆ. ಜಾಗರೂಕರಾಗಿರಿ.',
}

export const LATER_PROMPT: Record<CallLanguage, string> = {
  en: 'Understood. We will remind you again later. Take care.',
  kn: 'ಅರ್ಥವಾಯಿತು. ನಾವು ನಿಮಗೆ ನಂತರ ಮತ್ತೆ ನೆನಪಿಸುತ್ತೇವೆ. ಜಾಗರೂಕರಾಗಿರಿ.',
}

export const HELP_PROMPT: Record<CallLanguage, string> = {
  en: 'Understood. We have noted that you need help, and your caregiver will be informed. If this is an emergency, please call emergency services now.',
  kn: 'ಅರ್ಥವಾಯಿತು. ನಿಮಗೆ ಸಹಾಯ ಬೇಕು ಎಂದು ನಾವು ಗಮನಿಸಿದ್ದೇವೆ, ಮತ್ತು ನಿಮ್ಮ ಆರೈಕೆದಾರರಿಗೆ ತಿಳಿಸಲಾಗುತ್ತದೆ. ಇದು ತುರ್ತು ಪರಿಸ್ಥಿತಿಯಾಗಿದ್ದರೆ, ದಯವಿಟ್ಟು ತಕ್ಷಣ ತುರ್ತು ಸೇವೆಗಳಿಗೆ ಕರೆ ಮಾಡಿ.',
}

/** Spoken when a key was not understood, before the menu repeats. */
export const NOT_UNDERSTOOD_PROMPT: Record<CallLanguage, string> = {
  en: 'Sorry, I did not understand that. Please listen again.',
  kn: 'ಕ್ಷಮಿಸಿ, ನನಗೆ ಅರ್ಥವಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಕೇಳಿ.',
}

/** Spoken when speech recognition is unavailable or unreliable — the
 * call falls back to keypad-only and says so honestly. */
export const SPEECH_UNAVAILABLE_PROMPT: Record<CallLanguage, string> = {
  en: 'Voice answers are not available on this call. Please use the keypad instead.',
  kn: 'ಈ ಕರೆಯಲ್ಲಿ ಧ್ವನಿ ಉತ್ತರಗಳು ಲಭ್ಯವಿಲ್ಲ. ದಯವಿಟ್ಟು ಕೀಪ್ಯಾಡ್ ಬಳಸಿ.',
}

/** Spoken when the menu has been repeated too many times. Nothing is
 * recorded. */
export const GOODBYE_PROMPT: Record<CallLanguage, string> = {
  en: 'Thank you. Goodbye.',
  kn: 'ಧನ್ಯವಾದಗಳು. ವಿದಾಯ.',
}

/** Voicemail message. Generic unless the patient consented to medicine
 * details on voicemail (speakMedicineDetails) — a voicemail may be
 * heard by anyone with access to the phone. */
export function voicemailPrompt(
  ctx: PromptContext,
  language: CallLanguage,
  speakMedicineDetails: boolean,
): string {
  if (language === 'kn') {
    if (speakMedicineDetails) {
      return `ನಮಸ್ಕಾರ, ಇದು ಡೋಸ್ ಸಾಥಿ. ${ctx.scheduledTimeLabel} ಸಮಯದ ನಿಮ್ಮ ${ctx.medicationName} ${ctx.doseAmount} ಡೋಸ್ ಬಗ್ಗೆ ನೆನಪಿಸಲು ಕರೆ ಮಾಡಿದ್ದೇವೆ. ದಯವಿಟ್ಟು ನಿಮ್ಮ ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ಸೂಚನೆಗಳನ್ನು ಅನುಸರಿಸಿ. ಧನ್ಯವಾದಗಳು.`
    }
    return 'ನಮಸ್ಕಾರ, ಇದು ಡೋಸ್ ಸಾಥಿ. ನಿಮ್ಮ ನಿಗದಿತ ಔಷಧಿಯ ಬಗ್ಗೆ ನೆನಪಿಸಲು ಕರೆ ಮಾಡಿದ್ದೇವೆ. ದಯವಿಟ್ಟು ನಿಮ್ಮ ಪ್ರಿಸ್ಕ್ರಿಪ್ಷನ್ ಸೂಚನೆಗಳನ್ನು ಅನುಸರಿಸಿ. ಧನ್ಯವಾದಗಳು.'
  }
  if (speakMedicineDetails) {
    return `Hello, this is DoseSaathi. We called to remind you about your scheduled dose of ${ctx.medicationName}, ${ctx.doseAmount}, due at ${ctx.scheduledTimeLabel}. Please follow your prescription instructions. Thank you.`
  }
  return 'Hello, this is DoseSaathi. We called to remind you about your scheduled medicine. Please follow your prescription instructions. Thank you.'
}
