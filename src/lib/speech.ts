/* Text-to-speech with an honest fallback. Speech is only offered where
 * the browser supports it; otherwise the UI shows plain text and buttons. */

export function speechSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    'SpeechSynthesisUtterance' in window
  )
}

/** Speak text aloud. Returns true if speech was started. Best-effort:
 * any error is swallowed and reported as false — never throws. */
export function speak(text: string, lang: string): boolean {
  if (!speechSupported()) return false
  try {
    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = lang === 'kn' ? 'kn-IN' : 'en-IN'
    utter.rate = 0.9
    // Pick a matching voice when one exists; never assign a non-Voice.
    const voices = window.speechSynthesis.getVoices()
    const match = voices.find((v) =>
      v.lang.toLowerCase().startsWith(utter.lang.toLowerCase().slice(0, 2)),
    )
    if (match) utter.voice = match
    window.speechSynthesis.speak(utter)
    return true
  } catch {
    return false
  }
}

export function stopSpeaking(): void {
  if (!speechSupported()) return
  try {
    window.speechSynthesis.cancel()
  } catch {
    /* ignore */
  }
}

export interface SpeechVoiceOption {
  name: string
  lang: string
}

/** Voices the browser offers for a language ('en' or 'kn'). Returns an
 * empty list when speech is unsupported or no voice has loaded yet —
 * callers listen for `voiceschanged` and re-query. */
export function listVoices(lang: string): SpeechVoiceOption[] {
  if (!speechSupported()) return []
  try {
    const prefix = lang === 'kn' ? 'kn' : 'en'
    return window.speechSynthesis
      .getVoices()
      .filter((v) => v.lang.toLowerCase().startsWith(prefix))
      .map((v) => ({ name: v.name, lang: v.lang }))
  } catch {
    return []
  }
}

export interface SpeakOptions {
  lang: string
  /** Preferred voice name; falls back to the first matching voice. */
  voiceName?: string | null
  /** Playback speed, 0.5–1.5. Defaults to 0.9. */
  rate?: number
}

/** Speak with an explicit voice + speed (voice-call preview). Returns
 * true if speech was started. Best-effort: any error is swallowed and
 * reported as false — never throws. */
export function speakWithOptions(text: string, opts: SpeakOptions): boolean {
  if (!speechSupported()) return false
  try {
    window.speechSynthesis.cancel()
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = opts.lang === 'kn' ? 'kn-IN' : 'en-IN'
    utter.rate =
      typeof opts.rate === 'number' && opts.rate >= 0.5 && opts.rate <= 1.5
        ? opts.rate
        : 0.9
    // Pick the requested voice when it exists; never assign a non-Voice.
    const voices = window.speechSynthesis.getVoices()
    const match =
      (opts.voiceName
        ? voices.find((v) => v.name === opts.voiceName)
        : undefined) ??
      voices.find((v) =>
        v.lang.toLowerCase().startsWith(utter.lang.toLowerCase().slice(0, 2)),
      )
    if (match) utter.voice = match
    window.speechSynthesis.speak(utter)
    return true
  } catch {
    return false
  }
}
