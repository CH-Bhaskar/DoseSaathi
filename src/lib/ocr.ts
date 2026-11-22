/* On-device OCR for medicine photos (tesseract.js). SUGGESTION ONLY:
 * the extracted text may pre-fill the medicine NAME and STRENGTH fields
 * for the user to check against their prescription. The app NEVER infers
 * or creates a dosage, schedule, or instruction from an image, and an
 * unclear image prompts manual entry or a pharmacist/doctor check.
 *
 * tesseract.js is loaded with a dynamic import so its worker + language
 * data only download when the user actually taps "Read text from photo".
 * The parse step is a pure function, unit-tested without the engine. */

/** A name/strength suggestion read from a photo. Suggestion only — the
 * user checks it against their prescription before anything is saved. */
export interface OcrSuggestion {
  name: string | null
  strength: string | null
  rawText: string
}

const STRENGTH_RE = /(\d+(?:\.\d+)?\s*(?:mg|mcg|µg|g|ml|iu|%))/i
const LETTERS_RE = /[A-Za-z\u0C80-\u0CFF]/

// Words that mark a line as an instruction or label boilerplate rather
// than a medicine name. Kept short and generic on purpose.
const NON_NAME_WORDS = [
  'tablet', 'tablets', 'capsule', 'capsules', 'take', 'daily', 'twice',
  'once', 'dose', 'prescription', 'doctor', 'pharmacist', 'expiry',
  'batch', 'manufactured', 'contains', 'each', 'strip', 'food',
  'after', 'before', 'with', 'morning', 'evening', 'night',
]

/** Pull a name/strength suggestion out of raw OCR text. Returns nulls
 * when nothing plausible is found — the caller then prompts manual
 * entry. Never returns a dosage, schedule, or instruction. */
export function parseOcrSuggestion(rawText: string): OcrSuggestion {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  let strength: string | null = null
  const strengthMatch = STRENGTH_RE.exec(rawText)
  if (strengthMatch) {
    strength = strengthMatch[1].replace(/\s+/g, ' ').trim()
  }

  // Name candidates: lines with letters, no digits, not boilerplate.
  // Prefer the longest such line; fall back to the longest line overall
  // with the strength part stripped out.
  const cleanLines = lines.filter((line) => {
    if (line.length < 3 || line.length > 60) return false
    if (/\d/.test(line)) return false
    if (!LETTERS_RE.test(line)) return false
    const lower = line.toLowerCase()
    if (NON_NAME_WORDS.some((w) => lower.includes(w))) return false
    return true
  })
  let name: string | null = null
  if (cleanLines.length > 0) {
    name = cleanLines.reduce((a, b) => (b.length > a.length ? b : a))
  } else {
    const stripped = lines
      .map((l) => (strength ? l.replace(STRENGTH_RE, '').trim() : l))
      .filter((l) => l.length >= 3 && l.length <= 60 && LETTERS_RE.test(l))
    if (stripped.length > 0) {
      name = stripped.reduce((a, b) => (b.length > a.length ? b : a))
    }
  }

  return { name, strength, rawText }
}

/** Run the OCR engine over a photo blob. Returns the raw extracted text
 * (possibly empty). Throws on engine/load failure — the caller shows a
 * clear error and the user can still enter details manually.
 *
 * The worker, core, and language data are bundled locally under
 * public/tesseract/ (copied from the tesseract.js + tesseract.js-core
 * packages and the @tesseract.js-data/eng data package) instead of
 * loading from a CDN at runtime: DoseSaathi's users are often on slow
 * or offline connections, and OCR must work wherever the app itself
 * loads. Only the plain LSTM core is bundled — it runs on every device
 * (no SIMD requirement). */
export async function recognizePhotoText(blob: Blob): Promise<string> {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng', undefined, {
    workerPath: '/tesseract/worker.min.js',
    corePath: '/tesseract/core/tesseract-core-lstm.wasm.js',
    langPath: '/tesseract/lang-data',
  })
  try {
    const { data } = await worker.recognize(blob)
    return data.text ?? ''
  } finally {
    await worker.terminate()
  }
}
