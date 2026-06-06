/**
 * Generic session filtering utilities.
 *
 * These pure functions operate on any session type that implements
 * FilterableSession, eliminating duplication across stores that
 * all share the same grade→subject→topic→subtopic cascading filter pattern.
 */

import { toMYTDateString, mytDateToUTCDate, utcDateToString } from '@/lib/date'

export type DateRangeFilter = 'today' | 'last7days' | 'last30days' | 'alltime'

/** Minimum fields required for filtering and available-options extraction */
export interface FilterableSession {
  gradeLevelName: string
  subjectName: string
  topicName: string
  subTopicName: string
  completedAt: string | null
}

export interface SessionFilterParams {
  gradeLevelName?: string
  subjectName?: string
  topicName?: string
  subTopicName?: string
  dateRange?: DateRangeFilter
}

/**
 * Returns the inclusive start of a date range filter as an MYT calendar date
 * string (YYYY-MM-DD). Returns null for 'alltime' (no filtering).
 *
 * Boundaries are anchored to the MYT (UTC+8) calendar — consistent with the
 * rest of the app (daily statuses, streaks, leaderboard) — rather than the
 * browser's local timezone. Day arithmetic is performed on the MYT calendar.
 */
export function getDateRangeStart(filter: DateRangeFilter): string | null {
  const todayMYT = toMYTDateString()
  switch (filter) {
    case 'today':
      return todayMYT
    case 'last7days':
      return subtractMYTDays(todayMYT, 6)
    case 'last30days':
      return subtractMYTDays(todayMYT, 29)
    case 'alltime':
    default:
      return null
  }
}

/** Subtracts `days` from an MYT calendar date string, returning a YYYY-MM-DD string. */
function subtractMYTDays(mytDateStr: string, days: number): string {
  const date = mytDateToUTCDate(mytDateStr)
  date.setUTCDate(date.getUTCDate() - days)
  return utcDateToString(date)
}

/**
 * Filter sessions by cascading criteria (grade, subject, topic, subtopic, date range).
 * In-progress sessions (completedAt === null) are always included regardless of date filter.
 */
export function filterSessions<T extends FilterableSession>(
  sessions: T[],
  filters: SessionFilterParams,
): T[] {
  const dateRangeStart = filters.dateRange ? getDateRangeStart(filters.dateRange) : null

  return sessions.filter((s) => {
    if (filters.gradeLevelName && s.gradeLevelName !== filters.gradeLevelName) return false
    if (filters.subjectName && s.subjectName !== filters.subjectName) return false
    if (filters.topicName && s.topicName !== filters.topicName) return false
    if (filters.subTopicName && s.subTopicName !== filters.subTopicName) return false
    // Date filter applies to completedAt; in-progress sessions always shown.
    // Compare MYT calendar dates (string compare is valid for YYYY-MM-DD).
    if (dateRangeStart && s.completedAt) {
      const sessionDateMYT = toMYTDateString(new Date(s.completedAt))
      if (sessionDateMYT < dateRangeStart) return false
    }
    return true
  })
}

/** Get unique grade levels from sessions, sorted alphabetically */
export function getUniqueGradeLevels<T extends FilterableSession>(sessions: T[]): string[] {
  return Array.from(new Set(sessions.map((s) => s.gradeLevelName))).sort()
}

/** Get unique subjects, optionally filtered by grade level */
export function getUniqueSubjects<T extends FilterableSession>(
  sessions: T[],
  gradeLevelName?: string,
): string[] {
  const filtered = gradeLevelName
    ? sessions.filter((s) => s.gradeLevelName === gradeLevelName)
    : sessions
  return Array.from(new Set(filtered.map((s) => s.subjectName))).sort()
}

/** Get unique topics, optionally filtered by grade level and subject */
export function getUniqueTopics<T extends FilterableSession>(
  sessions: T[],
  gradeLevelName?: string,
  subjectName?: string,
): string[] {
  let filtered = sessions
  if (gradeLevelName) {
    filtered = filtered.filter((s) => s.gradeLevelName === gradeLevelName)
  }
  if (subjectName) {
    filtered = filtered.filter((s) => s.subjectName === subjectName)
  }
  return Array.from(new Set(filtered.map((s) => s.topicName))).sort()
}

/** Get unique subtopics, optionally filtered by grade level, subject, and topic */
export function getUniqueSubTopics<T extends FilterableSession>(
  sessions: T[],
  gradeLevelName?: string,
  subjectName?: string,
  topicName?: string,
): string[] {
  let filtered = sessions
  if (gradeLevelName) {
    filtered = filtered.filter((s) => s.gradeLevelName === gradeLevelName)
  }
  if (subjectName) {
    filtered = filtered.filter((s) => s.subjectName === subjectName)
  }
  if (topicName) {
    filtered = filtered.filter((s) => s.topicName === topicName)
  }
  return Array.from(new Set(filtered.map((s) => s.subTopicName))).sort()
}

/**
 * Factory that creates the 5 cascading filter lookup methods shared
 * across statistics stores. Each store provides a function that
 * returns sessions for a given entity ID.
 */
export function createSessionLookupMethods<T extends FilterableSession>(
  getSessionsForId: (id: string) => T[] | undefined,
) {
  function getFilteredSessions(
    id: string,
    gradeLevelName?: string,
    subjectName?: string,
    topicName?: string,
    subTopicName?: string,
    dateRange?: DateRangeFilter,
  ): T[] {
    const sessions = getSessionsForId(id)
    if (!sessions) return []
    return filterSessions(sessions, {
      gradeLevelName,
      subjectName,
      topicName,
      subTopicName,
      dateRange,
    })
  }

  function getGradeLevels(id: string): string[] {
    const sessions = getSessionsForId(id)
    if (!sessions) return []
    return getUniqueGradeLevels(sessions)
  }

  function getSubjects(id: string, gradeLevelName?: string): string[] {
    const sessions = getSessionsForId(id)
    if (!sessions) return []
    return getUniqueSubjects(sessions, gradeLevelName)
  }

  function getTopics(id: string, gradeLevelName?: string, subjectName?: string): string[] {
    const sessions = getSessionsForId(id)
    if (!sessions) return []
    return getUniqueTopics(sessions, gradeLevelName, subjectName)
  }

  function getSubTopics(
    id: string,
    gradeLevelName?: string,
    subjectName?: string,
    topicName?: string,
  ): string[] {
    const sessions = getSessionsForId(id)
    if (!sessions) return []
    return getUniqueSubTopics(sessions, gradeLevelName, subjectName, topicName)
  }

  return { getFilteredSessions, getGradeLevels, getSubjects, getTopics, getSubTopics }
}
