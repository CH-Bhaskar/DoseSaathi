/* Medicine photo upload with edit-before-save: pick (camera or device),
 * rotate, preset crop, retake/remove, optional OCR read, then save.
 *
 * Two modes:
 *  - Saved mode (`medicationId` set): the photo uploads immediately on
 *    save and replaces the medication's current photo, if any.
 *  - Pending mode (`medicationId` null, used while adding a medicine):
 *    the edited photo is handed to the parent through `onPendingPhoto`
 *    and uploads only after the medicine itself is saved.
 *
 * OCR is a SUGGESTION ONLY: it may pre-fill the name/strength fields
 * for the user to check against their prescription. It never infers a
 * dosage, schedule, or instruction. An unclear image prompts manual
 * entry or a pharmacist/doctor check.
 *
 * Upload progress is honest: an indeterminate "Uploading…" state, never
 * a fake percentage (neither provider reports byte progress). A failed
 * upload keeps the edited photo on screen so the user can retry. */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Camera,
  ImagePlus,
  Loader2,
  RotateCcw,
  RotateCw,
  ScanText,
  Trash2,
  X,
} from 'lucide-react'
import { parseOcrSuggestion, recognizePhotoText, type OcrSuggestion } from '../lib/ocr'
import {
  transformPhoto,
  validatePhotoFile,
  type CropPreset,
  type RotationDeg,
} from '../lib/photo'
import { useAppStore } from '../store/appStore'
import AccessibleActionButton from './AccessibleActionButton'
import ConfirmDialog from './ConfirmDialog'
import MedicationPhotoPreview from './MedicationPhotoPreview'

export interface PendingPhoto {
  blob: Blob
  fileName: string
  ocrText: string | null
  ocrConfirmed: boolean
}

type Phase = 'idle' | 'editing' | 'uploading'
type OcrState = 'idle' | 'reading' | 'done' | 'unclear' | 'failed'

export default function MedicationPhotoUpload({
  medicationId,
  medicationName,
  onPendingPhoto,
  onOcrSuggestion,
  onUploaded,
}: {
  /** Null while the medicine is still being added (pending mode). */
  medicationId: string | null
  medicationName: string
  onPendingPhoto?: (photo: PendingPhoto | null) => void
  onOcrSuggestion?: (s: { name: string | null; strength: string | null }) => void
  onUploaded?: () => void
}) {
  const { t } = useTranslation()
  const snapshot = useAppStore((s) => s.snapshot)
  const uploadMedicationPhoto = useAppStore((s) => s.uploadMedicationPhoto)
  const deleteMedicationPhoto = useAppStore((s) => s.deleteMedicationPhoto)
  const setToast = useAppStore((s) => s.setToast)

  const [phase, setPhase] = useState<Phase>('idle')
  const [originalBlob, setOriginalBlob] = useState<Blob | null>(null)
  const [originalName, setOriginalName] = useState('')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [rotation, setRotation] = useState<RotationDeg>(0)
  const [crop, setCrop] = useState<CropPreset>('full')
  const [ocrState, setOcrState] = useState<OcrState>('idle')
  const [suggestion, setSuggestion] = useState<OcrSuggestion | null>(null)
  const [ocrConfirmed, setOcrConfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [removeOpen, setRemoveOpen] = useState(false)
  const [pendingThumbUrl, setPendingThumbUrl] = useState<string | null>(null)

  const cameraInputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const existingPhotos = medicationId
    ? (snapshot?.medicationImages.filter((m) => m.medication_id === medicationId) ?? [])
        .slice()
        .sort((a, b) => b.created_at.localeCompare(a.created_at))
    : []
  const currentPhoto = existingPhotos[0] ?? null

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl)
      if (pendingThumbUrl) URL.revokeObjectURL(pendingThumbUrl)
    }
  }, [previewUrl, pendingThumbUrl])

  function resetEditor() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPhase('idle')
    setOriginalBlob(null)
    setOriginalName('')
    setPreviewUrl(null)
    setRotation(0)
    setCrop('full')
    setOcrState('idle')
    setSuggestion(null)
    setOcrConfirmed(false)
    setError(null)
  }

  function pickFile(file: File | null) {
    if (!file) return
    const validation = validatePhotoFile(file)
    if (!validation.ok) {
      setError(validation.errorKey)
      return
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setOriginalBlob(file)
    setOriginalName(file.name)
    setPreviewUrl(URL.createObjectURL(file))
    setRotation(0)
    setCrop('full')
    setOcrState('idle')
    setSuggestion(null)
    setOcrConfirmed(false)
    setError(null)
    setPhase('editing')
  }

  function rotate(direction: 1 | -1) {
    setRotation((r) => {
      const next = (r + direction * 90 + 360) % 360
      return next as RotationDeg
    })
  }

  async function readText() {
    if (!originalBlob) return
    setOcrState('reading')
    setError(null)
    try {
      // Read the photo as it will be saved: rotate + crop first.
      const edited = await transformPhoto(originalBlob, {
        rotationDeg: rotation,
        crop,
      })
      const raw = await recognizePhotoText(edited)
      const parsed = parseOcrSuggestion(raw)
      setSuggestion(parsed)
      if (parsed.name || parsed.strength) {
        setOcrState('done')
      } else {
        setOcrState('unclear')
      }
    } catch {
      setOcrState('failed')
    }
  }

  function useSuggestion() {
    if (!suggestion) return
    setOcrConfirmed(true)
    onOcrSuggestion?.({ name: suggestion.name, strength: suggestion.strength })
  }

  async function save() {
    if (!originalBlob) return
    setPhase('uploading')
    setError(null)
    try {
      const edited = await transformPhoto(originalBlob, {
        rotationDeg: rotation,
        crop,
      })
      const ocrText = suggestion?.rawText?.trim() ? suggestion.rawText : null
      if (medicationId === null) {
        // Pending mode: hand the edited photo to the parent; it uploads
        // after the medicine is saved.
        if (pendingThumbUrl) URL.revokeObjectURL(pendingThumbUrl)
        setPendingThumbUrl(URL.createObjectURL(edited))
        onPendingPhoto?.({
          blob: edited,
          fileName: originalName,
          ocrText,
          ocrConfirmed,
        })
        resetEditor()
        return
      }
      await uploadMedicationPhoto(
        medicationId,
        edited,
        originalName,
        ocrText,
        ocrConfirmed,
      )
      // Replace: the old photo goes only after the new one landed.
      if (currentPhoto) {
        await deleteMedicationPhoto(currentPhoto.id)
      }
      setToast(t('photos.uploadedToast'))
      resetEditor()
      onUploaded?.()
    } catch {
      setPhase('editing')
      setError('photos.uploadFailed')
    }
  }

  function clearPending() {
    if (pendingThumbUrl) URL.revokeObjectURL(pendingThumbUrl)
    setPendingThumbUrl(null)
    onPendingPhoto?.(null)
  }

  async function removeCurrent() {
    if (!currentPhoto) return
    setRemoveOpen(false)
    await deleteMedicationPhoto(currentPhoto.id)
    setToast(t('photos.deletedToast'))
  }

  const busy = phase === 'uploading'
  const editing = phase === 'editing' || phase === 'uploading'

  return (
    <div className="flex flex-col gap-4" data-testid="medication-photo-upload">
      <div>
        <h2 className="text-xl font-bold text-slate-900">{t('photos.title')}</h2>
        <p className="mt-1 text-base text-slate-600">{t('photos.subtitle')}</p>
      </div>

      {error ? (
        <p className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-base font-medium text-red-800" role="alert">
          {t(error)}
        </p>
      ) : null}

      {editing && originalBlob && previewUrl ? (
        <div className="flex flex-col gap-4">
          <h3 className="text-lg font-bold text-slate-900">{t('photos.editTitle')}</h3>
          <div className="relative mx-auto w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-slate-900">
            <img
              src={previewUrl}
              alt={t('photos.editTitle')}
              data-testid="photo-editor-preview"
              className="max-h-80 w-full object-contain"
              style={{ transform: `rotate(${rotation}deg)` }}
            />
            {crop === 'square' ? (
              <div
                className="pointer-events-none absolute inset-0 m-auto aspect-square max-h-full max-w-full border-2 border-dashed border-white"
                aria-hidden="true"
              />
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <AccessibleActionButton
              variant="secondary"
              onClick={() => rotate(-1)}
              disabled={busy}
              aria-label={t('photos.rotateLeft')}
            >
              <RotateCcw size={18} aria-hidden="true" />
              {t('photos.rotateLeft')}
            </AccessibleActionButton>
            <AccessibleActionButton
              variant="secondary"
              onClick={() => rotate(1)}
              disabled={busy}
              aria-label={t('photos.rotateRight')}
            >
              <RotateCw size={18} aria-hidden="true" />
              {t('photos.rotateRight')}
            </AccessibleActionButton>
            <AccessibleActionButton
              variant="ghost"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
            >
              <ImagePlus size={18} aria-hidden="true" />
              {t('photos.retake')}
            </AccessibleActionButton>
            <AccessibleActionButton
              variant="ghost"
              onClick={resetEditor}
              disabled={busy}
            >
              <X size={18} aria-hidden="true" />
              {t('common.cancel')}
            </AccessibleActionButton>
          </div>

          <fieldset>
            <legend className="label">{t('photos.cropHint')}</legend>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('photos.cropHint')}>
              {(['full', 'square'] as const).map((preset) => (
                <label
                  key={preset}
                  className={`flex min-h-11 cursor-pointer items-center rounded-xl border-2 px-4 py-2 text-base font-semibold focus-within:outline-3 focus-within:outline-brand-600 focus-within:outline-offset-2 ${
                    crop === preset
                      ? 'border-brand-700 bg-brand-50 text-brand-800'
                      : 'border-slate-300 text-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="photo-crop"
                    className="sr-only"
                    checked={crop === preset}
                    onChange={() => setCrop(preset)}
                    disabled={busy}
                  />
                  {t(preset === 'full' ? 'photos.cropFull' : 'photos.cropSquare')}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="rounded-xl border border-slate-200 p-4">
            <AccessibleActionButton
              variant="secondary"
              onClick={() => void readText()}
              disabled={ocrState === 'reading' || busy}
              data-testid="photo-read-text"
            >
              {ocrState === 'reading' ? (
                <Loader2 size={20} className="animate-spin" aria-hidden="true" />
              ) : (
                <ScanText size={20} aria-hidden="true" />
              )}
              {ocrState === 'reading' ? t('photos.readingText') : t('photos.readText')}
            </AccessibleActionButton>
            {ocrState === 'done' && suggestion ? (
              <div className="mt-3" role="status">
                <p className="text-base font-bold text-slate-900">{t('photos.ocrSuggestion')}</p>
                <p className="mt-1 text-sm text-slate-600">{t('photos.ocrSuggestionHint')}</p>
                <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                  {suggestion.name ? (
                    <div>
                      <dt className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t('photos.ocrName')}</dt>
                      <dd className="mt-1 text-base text-slate-900">{suggestion.name}</dd>
                    </div>
                  ) : null}
                  {suggestion.strength ? (
                    <div>
                      <dt className="text-sm font-semibold uppercase tracking-wide text-slate-500">{t('photos.ocrStrength')}</dt>
                      <dd className="mt-1 text-base text-slate-900">{suggestion.strength}</dd>
                    </div>
                  ) : null}
                </dl>
                <AccessibleActionButton
                  variant="primary"
                  className="mt-3"
                  onClick={useSuggestion}
                  disabled={ocrConfirmed}
                  data-testid="photo-use-details"
                >
                  {ocrConfirmed ? t('photos.ocrConfirmed') : t('photos.useDetails')}
                </AccessibleActionButton>
              </div>
            ) : null}
            {ocrState === 'unclear' ? (
              <p className="mt-3 text-base text-amber-900" role="status">{t('photos.ocrUnclear')}</p>
            ) : null}
            {ocrState === 'failed' ? (
              <p className="mt-3 text-base text-amber-900" role="status">{t('photos.ocrFailed')}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <AccessibleActionButton
              variant="secondary"
              className="flex-1"
              onClick={resetEditor}
              disabled={busy}
            >
              {t('common.cancel')}
            </AccessibleActionButton>
            <AccessibleActionButton
              variant="primary"
              className="flex-1"
              onClick={() => void save()}
              disabled={busy}
              data-testid="photo-save"
            >
              {busy ? (
                <>
                  <Loader2 size={20} className="animate-spin" aria-hidden="true" />
                  {t('photos.uploading')}
                </>
              ) : (
                t(medicationId === null ? 'photos.usePhoto' : 'photos.savePhoto')
              )}
            </AccessibleActionButton>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {currentPhoto ? (
            <div className="flex items-start gap-4">
              <MedicationPhotoPreview
                image={currentPhoto}
                medicationName={medicationName}
                size="large"
                showOcr
              />
            </div>
          ) : null}
          {pendingThumbUrl ? (
            <div className="flex items-start gap-4">
              <img
                src={pendingThumbUrl}
                alt={t('photos.reviewPhoto')}
                data-testid="medication-photo-pending"
                className="h-24 w-24 rounded-xl border border-slate-200 object-cover"
              />
              <div>
                <p className="text-base font-semibold text-slate-900" role="status">{t('photos.reviewPhoto')}</p>
                <p className="mt-1 text-sm text-slate-600">{t('photos.pendingNote')}</p>
                <AccessibleActionButton
                  variant="ghost"
                  className="mt-2"
                  onClick={clearPending}
                  data-testid="photo-clear-pending"
                >
                  <Trash2 size={18} aria-hidden="true" />
                  {t('photos.removePhoto')}
                </AccessibleActionButton>
              </div>
            </div>
          ) : null}

          {!currentPhoto && !pendingThumbUrl ? (
            <p className="text-base text-slate-600">{t('photos.noPhoto')}</p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <AccessibleActionButton
              variant="secondary"
              onClick={() => cameraInputRef.current?.click()}
              data-testid="photo-take"
            >
              <Camera size={20} aria-hidden="true" />
              {t('photos.takePhoto')}
            </AccessibleActionButton>
            <AccessibleActionButton
              variant="secondary"
              onClick={() => fileInputRef.current?.click()}
              data-testid="photo-choose"
            >
              <ImagePlus size={20} aria-hidden="true" />
              {t('photos.chooseFromDevice')}
            </AccessibleActionButton>
            {currentPhoto ? (
              <AccessibleActionButton
                variant="danger"
                onClick={() => setRemoveOpen(true)}
                data-testid="photo-remove"
              >
                <Trash2 size={20} aria-hidden="true" />
                {t('photos.removePhoto')}
              </AccessibleActionButton>
            ) : null}
          </div>
          <p className="text-sm text-slate-500">{t('photos.privateNote')}</p>
        </div>
      )}

      {/* Hidden file inputs: camera capture + plain device picker. */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        data-testid="photo-camera-input"
        aria-label={t('photos.takePhoto')}
        onChange={(e) => {
          pickFile(e.target.files?.[0] ?? null)
          e.target.value = ''
        }}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        data-testid="photo-file-input"
        aria-label={t('photos.chooseFromDevice')}
        onChange={(e) => {
          pickFile(e.target.files?.[0] ?? null)
          e.target.value = ''
        }}
      />

      <ConfirmDialog
        open={removeOpen}
        title={t('photos.confirmRemoveTitle')}
        text={t('photos.confirmRemoveText')}
        danger
        confirmLabel={t('common.delete')}
        onConfirm={() => void removeCurrent()}
        onCancel={() => setRemoveOpen(false)}
      />
    </div>
  )
}
