/* Displays one saved medicine photo. The bytes are fetched on demand
 * through the provider (a short-lived signed URL from the private
 * Storage bucket) — never a public URL. Object URLs are revoked when
 * the preview unmounts or the photo changes. */
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BadgeCheck, ImageOff } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import type { MedicationImage } from '../types'

export default function MedicationPhotoPreview({
  image,
  medicationName,
  size = 'thumb',
  showOcr = false,
}: {
  image: MedicationImage
  medicationName: string
  size?: 'thumb' | 'large'
  showOcr?: boolean
}) {
  const { t } = useTranslation()
  const getMedicationPhotoUrl = useAppStore((s) => s.getMedicationPhotoUrl)
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  // Depend on the photo's identity, not the object: snapshot refreshes
  // rebuild the row objects, and re-fetching the URL every 30s would
  // flicker the image and waste signed-URL calls.
  const imageId = image.id
  const storagePath = image.storage_path
  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    setFailed(false)
    setUrl(null)
    void getMedicationPhotoUrl(image)
      .then((fetched) => {
        if (cancelled) {
          URL.revokeObjectURL(fetched)
          return
        }
        objectUrl = fetched
        setUrl(fetched)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageId, storagePath, getMedicationPhotoUrl])

  const boxClass =
    size === 'large'
      ? 'h-64 w-full max-w-md'
      : 'h-16 w-16 shrink-0'

  if (failed) {
    return (
      <div
        className={`${boxClass} flex items-center justify-center rounded-xl bg-slate-100 text-slate-400`}
        role="img"
        aria-label={t('photos.photoAlt', { name: medicationName })}
      >
        <ImageOff size={size === 'large' ? 40 : 24} aria-hidden="true" />
      </div>
    )
  }

  if (!url) {
    return (
      <div
        className={`${boxClass} animate-pulse rounded-xl bg-slate-100`}
        aria-label={t('common.loading')}
      />
    )
  }

  return (
    <div className={size === 'large' ? 'flex flex-col gap-2' : ''}>
      <img
        src={url}
        alt={t('photos.photoAlt', { name: medicationName })}
        data-testid="medication-photo"
        className={`${boxClass} rounded-xl border border-slate-200 object-cover`}
      />
      {showOcr && image.ocr_text ? (
        <div className="rounded-xl bg-slate-50 px-3 py-2">
          <p className="text-sm font-semibold text-slate-700">
            {t('photos.ocrTextLabel')}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-600">
            {image.ocr_text}
          </p>
          {image.ocr_confirmed ? (
            <p className="mt-1 flex items-center gap-1 text-sm font-semibold text-green-800">
              <BadgeCheck size={16} aria-hidden="true" />
              {t('photos.ocrConfirmed')}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
