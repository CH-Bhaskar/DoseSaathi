/* Medicine-photo helpers: validation, crop geometry, and canvas
 * transforms (rotate / preset crop). No `any`, no emoji, no secrets.
 *
 * CROP CHOICE (simplest robust approach): a preset crop — "Full photo"
 * or "Square (centre)". A draggable crop box was considered and rejected
 * for this pass: presets are predictable with a keyboard and screen
 * reader, need no pointer-drag handling, and cover the common case
 * (centring a medicine strip or box in the frame). Rotation is applied
 * first, then the crop, so a square crop is always centred on the
 * rotated image.
 */
export const PHOTO_MAX_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB
export const PHOTO_ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export type PhotoMimeType = (typeof PHOTO_ALLOWED_TYPES)[number]

export type PhotoValidationResult =
  | { ok: true }
  | { ok: false; errorKey: string }

/** Validate a picked file before any work happens on it. Pure — safe to
 * unit-test without a DOM. */
export function validatePhotoFile(file: { type: string; size: number }): PhotoValidationResult {
  if (!(PHOTO_ALLOWED_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, errorKey: 'photos.errorType' }
  }
  if (file.size > PHOTO_MAX_SIZE_BYTES) {
    return { ok: false, errorKey: 'photos.errorSize' }
  }
  if (file.size <= 0) {
    return { ok: false, errorKey: 'photos.errorEmpty' }
  }
  return { ok: true }
}

export type CropPreset = 'full' | 'square'
export type RotationDeg = 0 | 90 | 180 | 270

export interface CropRect {
  x: number
  y: number
  width: number
  height: number
}

/** Pure geometry: the crop rectangle for a preset, in source pixels. A
 * square crop is centred on the image. */
export function cropRectForPreset(
  naturalWidth: number,
  naturalHeight: number,
  preset: CropPreset,
): CropRect {
  if (preset === 'full') {
    return { x: 0, y: 0, width: naturalWidth, height: naturalHeight }
  }
  const side = Math.min(naturalWidth, naturalHeight)
  return {
    x: Math.round((naturalWidth - side) / 2),
    y: Math.round((naturalHeight - side) / 2),
    width: side,
    height: side,
  }
}

/** Dimensions of an image after rotating by `rotationDeg`. */
export function rotatedDimensions(
  width: number,
  height: number,
  rotationDeg: RotationDeg,
): { width: number; height: number } {
  return rotationDeg === 90 || rotationDeg === 270
    ? { width: height, height: width }
    : { width, height }
}

/** Rotate then crop an image blob with canvas. Returns a new Blob in the
 * same format (JPEG stays JPEG at quality 0.9; PNG/WebP keep their type).
 * Throws on an unloadable image — callers show a clear error. */
export async function transformPhoto(
  blob: Blob,
  opts: { rotationDeg: RotationDeg; crop: CropPreset },
): Promise<Blob> {
  const bitmap = await createImageBitmap(blob)
  try {
    const { width: rotatedWidth, height: rotatedHeight } = rotatedDimensions(
      bitmap.width,
      bitmap.height,
      opts.rotationDeg,
    )
    const crop = cropRectForPreset(rotatedWidth, rotatedHeight, opts.crop)

    const canvas = document.createElement('canvas')
    canvas.width = crop.width
    canvas.height = crop.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('photo.canvasUnavailable')

    // Draw the rotated image, offset so the crop rect lands at (0, 0).
    ctx.save()
    ctx.translate(-crop.x, -crop.y)
    ctx.translate(rotatedWidth / 2, rotatedHeight / 2)
    ctx.rotate((opts.rotationDeg * Math.PI) / 180)
    ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2)
    ctx.restore()

    const mime = blob.type === 'image/png' ? 'image/png' : blob.type === 'image/webp' ? 'image/webp' : 'image/jpeg'
    const out = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mime, 0.9),
    )
    if (!out) throw new Error('photo.encodeFailed')
    return out
  } finally {
    bitmap.close()
  }
}

/** File extension for a stored photo, from its MIME type. */
export function extensionForMime(mimeType: string): string {
  switch (mimeType) {
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    default:
      return 'jpg'
  }
}
