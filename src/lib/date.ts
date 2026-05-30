/**
 * Date utilities for Asia/Kuala_Lumpur (MYT, UTC+8) timezone.
 *
 * The app's business logic (daily statuses, streaks, spin wheel, leaderboard)
 * is anchored to MYT. Using Intl.DateTimeFormat with an explicit IANA timezone
 * ensures correct dates regardless of the user's browser timezone.
 */

const MYT_TIMEZONE = 'Asia/Kuala_Lumpur'

/** Formatter that outputs YYYY-MM-DD in MYT (en-CA locale gives this format) */
const mytDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: MYT_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * Returns a YYYY-MM-DD date string in Asia/Kuala_Lumpur timezone.
 * Always reflects the MYT calendar date, even if the browser is in another timezone.
 */
export function toMYTDateString(date: Date = new Date()): string {
  return mytDateFormatter.format(date)
}

/** Formatter that outputs numeric date parts in MYT */
const mytPartsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: MYT_TIMEZONE,
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  weekday: 'short',
})

/**
 * Returns the day of week in MYT (0 = Sun, 1 = Mon, ..., 6 = Sat).
 */
export function getMYTDayOfWeek(date: Date = new Date()): number {
  const parts = mytPartsFormatter.formatToParts(date)
  const weekday = parts.find((p) => p.type === 'weekday')!.value
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return map[weekday] ?? 0
}

/**
 * Returns a UTC Date object representing midnight of the given MYT date string.
 * Useful for date arithmetic (adding/subtracting days) on MYT calendar dates.
 *
 * Example: mytDateToUTCDate('2026-02-12') → Date(2026-02-12T00:00:00Z)
 */
export function mytDateToUTCDate(mytDateStr: string): Date {
  const parts = mytDateStr.split('-').map(Number)
  return new Date(Date.UTC(parts[0]!, parts[1]! - 1, parts[2]))
}

/**
 * Formats a UTC Date (from mytDateToUTCDate) back to YYYY-MM-DD string.
 */
export function utcDateToString(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

/**
 * Returns start and end of the current MYT day as UTC ISO strings.
 * MYT is always UTC+8 (no DST), so midnight MYT = day-1 16:00 UTC.
 * Useful for Supabase date-range queries anchored to the MYT calendar day.
 */
export function getMYTDayBoundsISO(date: Date = new Date()): { start: string; end: string } {
  const mytDateStr = toMYTDateString(date)
  const [y, m, d] = mytDateStr.split('-').map(Number)
  const start = new Date(Date.UTC(y!, m! - 1, d!, -8)) // midnight MYT in UTC
  const end = new Date(Date.UTC(y!, m! - 1, d!, 15, 59, 59, 999)) // 23:59:59.999 MYT in UTC
  return { start: start.toISOString(), end: end.toISOString() }
}

/**
 * Returns YYYY-MM month key in MYT timezone.
 * Useful for grouping records by calendar month in MYT.
 */
export function toMYTMonthKey(date: Date = new Date()): string {
  return toMYTDateString(date).slice(0, 7)
}

// ─── Display formatting utilities ────────────────────────────────────────────

/**
 * Formats seconds into a human-readable study time string.
 * Examples: "5 sec", "3 min", "1 hr 30 min"
 */
export function formatStudyTime(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} sec`
  }
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return `${minutes} min`
  }
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  if (remainingMinutes === 0) {
    return `${hours} hr`
  }
  return `${hours} hr ${remainingMinutes} min`
}

/**
 * Formats seconds into a compact duration string.
 * Examples: "5s", "3m", "1m 30s"
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`
  }
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (remainingSeconds === 0) {
    return `${minutes}m`
  }
  return `${minutes}m ${remainingSeconds}s`
}

/**
 * Formats a date string into a locale date-time string.
 * Example: "Jan 1, 2025, 10:30 AM"
 */
export function formatDateTime(dateString: string): string {
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Formats a date string into a short date string.
 * Example: "Jan 1, 2025"
 * Returns '-' for null/undefined input.
 */
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return '-'
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Formats a date string into a long date string.
 * Example: "January 1, 2025"
 * Returns '-' for null/undefined input.
 */
export function formatLongDate(dateString: string | null | undefined): string {
  if (!dateString) return '-'
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/**
 * Formats a date string into a long date-time string.
 * Example: "January 1, 2025, 10:30 AM"
 * Returns '' for null/undefined input.
 */
export function formatLongDateTime(dateString: string | null | undefined): string {
  if (!dateString) return ''
  const date = new Date(dateString)
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export interface RelativeDateLabels {
  today: string
  yesterday: string
  daysAgo: (n: number) => string
  weeksAgo: (n: number) => string
  never: string
}

/**
 * Formats a date string as a relative date.
 * Examples: "Today", "Yesterday", "3d ago", "2w ago", falls back to formatDate.
 * Returns 'Never' (or locale equivalent) for null/undefined input.
 * Pass a `labels` object to localise the output strings.
 */
export function formatRelativeDate(
  dateString: string | null | undefined,
  labels?: RelativeDateLabels,
): string {
  const never = labels?.never ?? 'Never'
  if (!dateString) return never
  const date = new Date(dateString)
  const now = new Date()

  // Anchor the Today/Yesterday boundary to the MYT calendar (UTC+8), consistent
  // with the rest of the app, rather than the browser's local timezone.
  const dateMYT = toMYTDateString(date)
  const todayMYT = toMYTDateString(now)

  if (dateMYT === todayMYT) return labels?.today ?? 'Today'

  const yesterdayUTC = mytDateToUTCDate(todayMYT)
  yesterdayUTC.setUTCDate(yesterdayUTC.getUTCDate() - 1)
  const yesterdayMYT = utcDateToString(yesterdayUTC)

  if (dateMYT === yesterdayMYT) return labels?.yesterday ?? 'Yesterday'

  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays < 7) return labels ? labels.daysAgo(diffDays) : `${diffDays}d ago`
  if (diffDays < 30)
    return labels ? labels.weeksAgo(Math.floor(diffDays / 7)) : `${Math.floor(diffDays / 7)}w ago`
  return formatDate(dateString)
}

/**
 * Formats a date string as a relative time ago.
 * Examples: "just now", "5 minutes ago", "3 hours ago", "2 days ago", falls back to short date.
 * Returns '' for null/undefined input.
 */
export interface TimeAgoLabels {
  justNow: string
  minutesAgo: (n: number) => string
  hoursAgo: (n: number) => string
  daysAgo: (n: number) => string
}

export function formatTimeAgo(
  dateString: string | null | undefined,
  labels?: TimeAgoLabels,
): string {
  if (!dateString) return ''
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return labels?.justNow ?? 'just now'
  if (diffMins < 60)
    return labels
      ? labels.minutesAgo(diffMins)
      : `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`
  if (diffHours < 24)
    return labels
      ? labels.hoursAgo(diffHours)
      : `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`
  if (diffDays < 7)
    return labels ? labels.daysAgo(diffDays) : `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
  return formatDate(dateString)
}

/**
 * Formats a date string as a compact relative time ago.
 * Examples: "just now", "5m ago", "3h ago", "2d ago", falls back to short date.
 * Returns '' for null/undefined input.
 */
export function formatTimeAgoCompact(
  dateString: string | null | undefined,
  labels?: TimeAgoLabels,
): string {
  if (!dateString) return ''
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return labels?.justNow ?? 'just now'
  if (diffMins < 60) return labels ? labels.minutesAgo(diffMins) : `${diffMins}m ago`
  if (diffHours < 24) return labels ? labels.hoursAgo(diffHours) : `${diffHours}h ago`
  if (diffDays < 7) return labels ? labels.daysAgo(diffDays) : `${diffDays}d ago`
  return formatDate(dateString)
}
