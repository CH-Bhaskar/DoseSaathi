/* Small date/time helpers. Times are handled in the user's local
 * timezone; the app stores dates as YYYY-MM-DD and times as HH:MM strings
 * so they survive timezone shifts. Date labels follow the app's current
 * language (English/Kannada); times use a locale-independent 12-hour
 * format so they read the same everywhere. */
import i18n from '../i18n'

function dateLocale(): string {
  return i18n.language === 'kn' ? 'kn-IN' : 'en-IN'
}

/** Format a Date as YYYY-MM-DD in local time. */
export function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Format a Date as HH:MM (24-hour clock) in local time. */
export function toISOTime(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Today's date as YYYY-MM-DD. */
export function todayISO(now = new Date()): string {
  return toISODate(now)
}

/** Add n days to a YYYY-MM-DD date string. */
export function addDaysISO(iso: string, n: number): string {
  const d = parseISODate(iso)
  d.setDate(d.getDate() + n)
  return toISODate(d)
}

/** Parse YYYY-MM-DD as a local Date (midnight). */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

/** ISO day number: 1 = Monday … 7 = Sunday. */
export function isoDayOfWeek(iso: string): number {
  const js = parseISODate(iso).getDay() // 0 = Sunday
  return js === 0 ? 7 : js
}

/** "08:30" -> 8.5 (hour float). */
export function hourFloatFromTime(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return (h ?? 0) + (m ?? 0) / 60
}

/** Current time as an hour float. */
export function hourFloatFromDate(date: Date): number {
  return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600
}

/** "08:30" -> "8:30 AM". Locale-independent, plain and readable. */
export function formatTime12h(time: string): string {
  const [hRaw, mRaw] = time.split(':')
  const h = Number(hRaw)
  const m = Number(mRaw)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

/** "2026-11-22" -> "Sun, 22 Nov 2026" (short, readable). */
export function formatDateShort(iso: string): string {
  return parseISODate(iso).toLocaleDateString(dateLocale(), {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/** "2026-11-22" -> "Sun" (weekday only, in the app language). */
export function formatWeekdayShort(iso: string): string {
  return parseISODate(iso).toLocaleDateString(dateLocale(), {
    weekday: 'short',
  })
}

/** "2026-11-22" -> "Sunday, 22 November 2026". */
export function formatDateLong(iso: string): string {
  return parseISODate(iso).toLocaleDateString(dateLocale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** Minutes between two HH:MM times on the same day. */
export function minutesBetween(a: string, b: string): number {
  return Math.abs(hourFloatFromTime(a) - hourFloatFromTime(b)) * 60
}
