/* Deterministic idempotency keys for call attempts.
 *
 * Key shape: call:<patient_id>:<schedule_id>:<date>:<time>:a<attempt>
 * where <date>/<time> are the dose's canonical scheduled_date /
 * scheduled_time (not wall-clock time), so a re-run of the scanner over
 * the same due dose produces the same key, and the UNIQUE constraint on
 * call_attempts.idempotency_key makes the duplicate insert impossible.
 * Retries are distinct attempts (a2, a3, …) and get distinct keys. */

export function buildIdempotencyKey(input: {
  patientId: string
  scheduleId: string
  scheduledDate: string
  scheduledTime: string
  attemptNumber: number
}): string {
  const time = input.scheduledTime.slice(0, 5)
  return `call:${input.patientId}:${input.scheduleId}:${input.scheduledDate}:${time}:a${input.attemptNumber}`
}

/** Parse a key back into its parts. Returns null for anything that was
 * not produced by buildIdempotencyKey. */
export function parseIdempotencyKey(key: string): {
  patientId: string
  scheduleId: string
  scheduledDate: string
  scheduledTime: string
  attemptNumber: number
} | null {
  const match =
    /^call:([0-9a-f-]+):([0-9a-f-]+):(\d{4}-\d{2}-\d{2}):(\d{2}:\d{2}):a(\d+)$/.exec(key)
  if (!match) return null
  return {
    patientId: match[1] ?? '',
    scheduleId: match[2] ?? '',
    scheduledDate: match[3] ?? '',
    scheduledTime: match[4] ?? '',
    attemptNumber: Number(match[5]),
  }
}
