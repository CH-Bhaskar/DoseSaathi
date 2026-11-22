/* Unit tests: medicine-photo validation, crop geometry, and rotation
 * math (lib/photo.ts). Canvas transforms run in a real browser and are
 * covered by the Playwright walkthrough instead. */
import { describe, expect, it } from 'vitest'
import {
  cropRectForPreset,
  PHOTO_MAX_SIZE_BYTES,
  rotatedDimensions,
  validatePhotoFile,
} from './photo'

describe('validatePhotoFile', () => {
  it('accepts a JPEG under the size limit', () => {
    expect(validatePhotoFile({ type: 'image/jpeg', size: 1024 })).toEqual({
      ok: true,
    })
  })

  it('accepts PNG and WebP', () => {
    expect(validatePhotoFile({ type: 'image/png', size: 1024 })).toEqual({
      ok: true,
    })
    expect(validatePhotoFile({ type: 'image/webp', size: 1024 })).toEqual({
      ok: true,
    })
  })

  it('accepts a file exactly at the 5 MB limit', () => {
    expect(
      validatePhotoFile({ type: 'image/jpeg', size: PHOTO_MAX_SIZE_BYTES }),
    ).toEqual({ ok: true })
  })

  it('rejects GIF and other types', () => {
    const result = validatePhotoFile({ type: 'image/gif', size: 1024 })
    expect(result).toEqual({ ok: false, errorKey: 'photos.errorType' })
  })

  it('rejects a file over the 5 MB limit', () => {
    const result = validatePhotoFile({
      type: 'image/jpeg',
      size: PHOTO_MAX_SIZE_BYTES + 1,
    })
    expect(result).toEqual({ ok: false, errorKey: 'photos.errorSize' })
  })

  it('rejects an empty file', () => {
    const result = validatePhotoFile({ type: 'image/jpeg', size: 0 })
    expect(result).toEqual({ ok: false, errorKey: 'photos.errorEmpty' })
  })
})

describe('cropRectForPreset', () => {
  it('full crop keeps the whole image', () => {
    expect(cropRectForPreset(800, 600, 'full')).toEqual({
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    })
  })

  it('square crop centres on a landscape image', () => {
    expect(cropRectForPreset(800, 600, 'square')).toEqual({
      x: 100,
      y: 0,
      width: 600,
      height: 600,
    })
  })

  it('square crop centres on a portrait image', () => {
    expect(cropRectForPreset(600, 800, 'square')).toEqual({
      x: 0,
      y: 100,
      width: 600,
      height: 600,
    })
  })

  it('square crop of a square image is the whole image', () => {
    expect(cropRectForPreset(500, 500, 'square')).toEqual({
      x: 0,
      y: 0,
      width: 500,
      height: 500,
    })
  })
})

describe('rotatedDimensions', () => {
  it('0 and 180 keep dimensions', () => {
    expect(rotatedDimensions(800, 600, 0)).toEqual({ width: 800, height: 600 })
    expect(rotatedDimensions(800, 600, 180)).toEqual({
      width: 800,
      height: 600,
    })
  })

  it('90 and 270 swap dimensions', () => {
    expect(rotatedDimensions(800, 600, 90)).toEqual({
      width: 600,
      height: 800,
    })
    expect(rotatedDimensions(800, 600, 270)).toEqual({
      width: 600,
      height: 800,
    })
  })
})
