/* Time helpers for the call functions. Pure — no Deno imports.
 *
 * Rule: all call times are stored in UTC (timestamptz). Quiet hours are
 * the patient's LOCAL window, so the check converts the instant to the
 * patient's timezone with Intl and compares HH:MM there. */

/** "HH:MM" (or "HH:MM:SS") -> minutes since midnight. Returns null for
 * anything that is not a valid 24-hour time. */
export function minutesSinceMidnight(time: string | null | undefined): number | null {
  if (!time) return null
  const match = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(time.trim())
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return hours * 60 + minutes
}

/** Minutes since midnight for an instant in a given IANA timezone.
 * Falls back to UTC when the timezone name is invalid — never throws. */
export function localMinutesSinceMidnight(now: Date, timezone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(now)
    let hours = 0
    let minutes = 0
    for (const part of parts) {
      if (part.type === 'hour') hours = Number(part.value)
      if (part.type === 'minute') minutes = Number(part.value)
    }
    // Some environments render midnight as hour 24.
    if (hours === 24) hours = 0
    return hours * 60 + minutes
  } catch {
    return now.getUTCHours() * 60 + now.getUTCMinutes()
  }
}

/** Is `now` inside the patient's quiet-hours window?
 * The window is [start, end): at the start minute the patient is quiet,
 * at the end minute they are callable again. Overnight windows
 * (start > end, e.g. 21:00–07:00) span midnight. A missing or invalid
 * bound means "no quiet hours". */
export function isInQuietHours(
  now: Date,
  timezone: string,
  quietStart: string | null,
  quietEnd: string | null,
): boolean {
  const start = minutesSinceMidnight(quietStart)
  const end = minutesSinceMidnight(quietEnd)
  if (start === null || end === null) return false
  if (start === end) return false
  const local = localMinutesSinceMidnight(now, timezone)
  if (start < end) return local >= start && local < end
  // Overnight window: quiet from start to midnight, and from midnight
  // to end.
  return local >= start || local < end
}

/** Add whole minutes to an ISO instant, returning an ISO instant. */
export function addMinutesIso(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString()
}

/** Offset, in minutes, of a timezone from UTC at a given instant
 * (positive east of Greenwich, e.g. Asia/Kolkata = +330). */
export function timezoneOffsetMinutes(at: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(at)
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0)
  let hour = get('hour')
  if (hour === 24) hour = 0
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), hour, get('minute'), get('second'))
  return (asUtc - at.getTime()) / 60_000
}

/** Convert a local date + time in an IANA timezone to a UTC instant.
 * Returns null for an invalid date/time or timezone. The offset is
 * resolved twice so a DST transition between the guess and the answer
 * is handled. */
export function zonedTimeToUtc(
  date: string,
  time: string,
  timezone: string,
): Date | null {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const timeMatch = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(time)
  if (!dateMatch || !timeMatch) return null
  const year = Number(dateMatch[1])
  const month = Number(dateMatch[2])
  const day = Number(dateMatch[3])
  const hour = Number(timeMatch[1])
  const minute = Number(timeMatch[2])
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    return null
  }
  try {
    const guess = new Date(Date.UTC(year, month - 1, day, hour, minute))
    const offset1 = timezoneOffsetMinutes(guess, timezone)
    const adjusted = new Date(guess.getTime() - offset1 * 60_000)
    const offset2 = timezoneOffsetMinutes(adjusted, timezone)
    return new Date(guess.getTime() - offset2 * 60_000)
  } catch {
    return null
  }
}

/** Is a dose due inside the scan window? A dose is due when its local
 * scheduled instant is in the past but no older than `windowMinutes`
 * (default 15 — slightly longer than the 10-minute scan cadence, so a
 * slow run never skips a dose). Future doses are not due. */
export function isDoseDue(
  scheduledDate: string,
  scheduledTime: string,
  timezone: string,
  now: Date,
  windowMinutes = 15,
): boolean {
  const dueAt = zonedTimeToUtc(scheduledDate, scheduledTime, timezone)
  if (dueAt === null) return false
  const ageMs = now.getTime() - dueAt.getTime()
  return ageMs >= 0 && ageMs <= windowMinutes * 60_000
}
