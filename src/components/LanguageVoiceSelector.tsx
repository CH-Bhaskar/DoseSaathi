/* Language + voice choice for voice-call reminders, with a spoken
 * preview. Controlled: the parent owns the values (they live in
 * call_preferences) and this component only edits them. Voice preview
 * follows the existing speech.ts patterns and degrades honestly when
 * the browser has no voice for the language. */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Volume2, Square } from 'lucide-react'
import { SUPPORTED_LANGUAGES } from '../i18n'
import {
  listVoices,
  speakWithOptions,
  speechSupported,
  stopSpeaking,
  type SpeechVoiceOption,
} from '../lib/speech'
import type { CallLanguage } from '../types'
import AccessibleActionButton from './AccessibleActionButton'

export interface VoiceChoice {
  language: CallLanguage
  voiceName: string | null
  speechRate: number
}

export default function LanguageVoiceSelector({
  value,
  onChange,
}: {
  value: VoiceChoice
  onChange: (v: VoiceChoice) => void
}) {
  const { t } = useTranslation()
  const [voices, setVoices] = useState<SpeechVoiceOption[]>([])
  const [previewState, setPreviewState] = useState<'idle' | 'playing' | 'unavailable'>('idle')

  // Voices load asynchronously in most browsers; re-query when they do.
  useEffect(() => {
    const refresh = () => setVoices(listVoices(value.language))
    refresh()
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.addEventListener('voiceschanged', refresh)
      return () =>
        window.speechSynthesis.removeEventListener('voiceschanged', refresh)
    }
    return undefined
  }, [value.language])

  useEffect(() => stopSpeaking, [])

  function preview() {
    const started = speakWithOptions(t('voiceCalls.previewText'), {
      lang: value.language,
      voiceName: value.voiceName,
      rate: value.speechRate,
    })
    setPreviewState(started ? 'playing' : 'unavailable')
    if (started) {
      window.setTimeout(() => {
        setPreviewState((s) => (s === 'playing' ? 'idle' : s))
      }, 8000)
    }
  }

  function stop() {
    stopSpeaking()
    setPreviewState('idle')
  }

  const supported = speechSupported()
  const voiceValid =
    value.voiceName === null || voices.some((v) => v.name === value.voiceName)

  return (
    <div className="flex flex-col gap-4" data-testid="language-voice-selector">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="voice-language">
            {t('voiceCalls.language')}
          </label>
          <select
            id="voice-language"
            className="input"
            value={value.language}
            onChange={(e) =>
              onChange({
                ...value,
                language: e.target.value as CallLanguage,
                voiceName: null,
              })
            }
            data-testid="voice-language"
          >
            {SUPPORTED_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.nativeLabel} ({l.label})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="voice-name">
            {t('voiceCalls.voice')}
          </label>
          <select
            id="voice-name"
            className="input"
            value={voiceValid ? (value.voiceName ?? '') : ''}
            onChange={(e) =>
              onChange({ ...value, voiceName: e.target.value || null })
            }
            data-testid="voice-name"
          >
            <option value="">{t('voiceCalls.voiceDefault')}</option>
            {voices.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name} ({v.lang})
              </option>
            ))}
          </select>
          {voices.length === 0 ? (
            <p className="mt-1 text-sm text-slate-500">{t('voiceCalls.noVoices')}</p>
          ) : null}
        </div>
      </div>

      <div>
        <label className="label" htmlFor="voice-rate">
          {t('voiceCalls.speechRate')} — {value.speechRate.toFixed(1)}x
        </label>
        <input
          id="voice-rate"
          type="range"
          min={0.5}
          max={1.5}
          step={0.1}
          className="w-full accent-brand-700"
          value={value.speechRate}
          onChange={(e) =>
            onChange({ ...value, speechRate: Number(e.target.value) })
          }
          data-testid="voice-rate"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {supported ? (
          <>
            <AccessibleActionButton
              variant="secondary"
              onClick={preview}
              data-testid="voice-preview"
            >
              <Volume2 size={18} aria-hidden="true" />
              {t('voiceCalls.voicePreview')}
            </AccessibleActionButton>
            {previewState === 'playing' ? (
              <AccessibleActionButton variant="ghost" onClick={stop}>
                <Square size={18} aria-hidden="true" />
                {t('common.stopListening')}
              </AccessibleActionButton>
            ) : null}
          </>
        ) : (
          <p className="text-base text-slate-600">{t('common.speakNotSupported')}</p>
        )}
        {previewState === 'playing' ? (
          <p className="text-base text-slate-600" role="status">
            {t('voiceCalls.previewStarted')}
          </p>
        ) : null}
        {previewState === 'unavailable' ? (
          <p className="text-base text-amber-800" role="status">
            {t('voiceCalls.previewUnavailable')}
          </p>
        ) : null}
      </div>
    </div>
  )
}
