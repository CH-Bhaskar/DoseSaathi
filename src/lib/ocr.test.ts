/* Unit tests: OCR suggestion parsing (lib/ocr.ts). The suggestion is
 * name + strength ONLY — these tests pin the safety rule that no dosage,
 * schedule, or instruction is ever derived from an image. The tesseract
 * engine itself is not run here; it needs a browser + language data. */
import { describe, expect, it } from 'vitest'
import { parseOcrSuggestion } from './ocr'

describe('parseOcrSuggestion', () => {
  it('reads name + strength from a typical label', () => {
    const result = parseOcrSuggestion('AMLODIPINE\n5 mg\nTake one tablet daily')
    expect(result.name).toBe('AMLODIPINE')
    expect(result.strength).toBe('5 mg')
  })

  it('finds a strength written on the same line as the name', () => {
    const result = parseOcrSuggestion('Metformin 500 mg')
    expect(result.strength).toBe('500 mg')
    expect(result.name).toBe('Metformin')
  })

  it('handles decimal strengths and other units', () => {
    expect(parseOcrSuggestion('Atorvastatin\n10.5 mg').strength).toBe('10.5 mg')
    expect(parseOcrSuggestion('Syrup\n100 ml').strength).toBe('100 ml')
    expect(parseOcrSuggestion('Drops\n0.5%').strength).toBe('0.5%')
  })

  it('returns nulls for empty or gibberish text', () => {
    expect(parseOcrSuggestion('')).toEqual({
      name: null,
      strength: null,
      rawText: '',
    })
    expect(parseOcrSuggestion('###\n@@@\n123')).toEqual({
      name: null,
      strength: null,
      rawText: '###\n@@@\n123',
    })
  })

  it('never returns dosage, schedule, or instruction text as the name', () => {
    const result = parseOcrSuggestion(
      'Take one tablet twice daily\nAfter food\nAMLODIPINE\n5 mg',
    )
    expect(result.name).toBe('AMLODIPINE')
    expect(result.name).not.toMatch(/take|twice|daily|food/i)
  })

  it('keeps the raw text so the user can check it', () => {
    const raw = 'PARACETAMOL\n650 mg'
    expect(parseOcrSuggestion(raw).rawText).toBe(raw)
  })

  it('ignores boilerplate lines when picking the name', () => {
    const result = parseOcrSuggestion(
      'Batch No. AB123\nExpiry 12/2027\nCROCIN\n650 mg',
    )
    expect(result.name).toBe('CROCIN')
    expect(result.strength).toBe('650 mg')
  })
})
