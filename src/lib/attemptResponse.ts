/**
 * Structured student responses for the P9a assessment question types — the
 * EXACT `attempt_answers.response` shapes the server-side grader reads
 * (P9A-HANDOFF §3), plus the pure helpers the runner uses to build them from
 * input state and to rehydrate input state from a saved response on resume.
 *
 * Grader contracts the builders enforce by construction:
 * - cloze: exactly ONE entry per blank index — the grader scores a blank with
 *   duplicate entries as zero (anti-shotgun).
 * - matching: exactly one pair per left item — duplicate `left_id` entries
 *   score zero for that pair.
 * - ordering: the full sequence of item ids, position 1 first.
 */

/** One shape for every response-carried type; unknown keys are ignored server-side. */
export type AttemptAnswerResponse = {
  /** true_false */
  value?: boolean
  /** cloze */
  blanks?: { index: number; value: string }[]
  /** matching */
  pairs?: { left_id: string; right_id: string }[]
  /** ordering */
  order?: string[]
}

// ──────────────────────────────────────────────
// Builders: runner input state → response
// ──────────────────────────────────────────────

export function buildTrueFalseResponse(value: boolean): AttemptAnswerResponse {
  return { value }
}

/**
 * Cloze response from the per-blank input values. Blank/whitespace values are
 * dropped (an empty value is always wrong server-side and would only lower
 * the score); returns null when nothing is filled in — nothing to save.
 * Exactly one entry per index by construction (Record keys are unique).
 */
export function buildClozeResponse(values: Record<number, string>): AttemptAnswerResponse | null {
  const blanks = Object.entries(values)
    .map(([index, value]) => ({ index: Number(index), value: value.trim() }))
    .filter((blank) => Number.isInteger(blank.index) && blank.index >= 1 && blank.value.length > 0)
    .sort((a, b) => a.index - b.index)
  return blanks.length > 0 ? { blanks } : null
}

/**
 * Matching response from the per-left-item selection. Unselected left items
 * are omitted (partial submissions are fine — those pairs simply score zero);
 * returns null when nothing is matched yet. `leftIds` fixes the pair order and
 * guards against stale selection keys; one pair per left by construction.
 */
export function buildMatchingResponse(
  leftIds: string[],
  selection: Record<string, string | null>,
): AttemptAnswerResponse | null {
  const pairs = leftIds
    .map((leftId) => ({ left_id: leftId, right_id: selection[leftId] ?? null }))
    .filter((pair): pair is { left_id: string; right_id: string } => pair.right_id !== null)
  return pairs.length > 0 ? { pairs } : null
}

/** Ordering response — the student's full sequence, position 1 first. */
export function buildOrderingResponse(order: string[]): AttemptAnswerResponse {
  return { order: [...order] }
}

// ──────────────────────────────────────────────
// Rehydrators: saved response → runner input state (resume / navigation)
// ──────────────────────────────────────────────

export function trueFalseFromResponse(response: AttemptAnswerResponse | null): boolean | null {
  return typeof response?.value === 'boolean' ? response.value : null
}

export function clozeValuesFromResponse(
  response: AttemptAnswerResponse | null,
): Record<number, string> {
  const values: Record<number, string> = {}
  for (const blank of response?.blanks ?? []) {
    if (Number.isInteger(blank.index) && typeof blank.value === 'string') {
      values[blank.index] = blank.value
    }
  }
  return values
}

/** Selection keyed by left id; ids not in `leftIds` (stale) are dropped. */
export function matchingSelectionFromResponse(
  leftIds: string[],
  response: AttemptAnswerResponse | null,
): Record<string, string | null> {
  const byLeft = new Map((response?.pairs ?? []).map((pair) => [pair.left_id, pair.right_id]))
  return Object.fromEntries(leftIds.map((leftId) => [leftId, byLeft.get(leftId) ?? null]))
}

/**
 * The working order for the ordering input: the saved order filtered to the
 * question's current item ids (dedup), with any unsaved ids appended in the
 * served (per-attempt scrambled) order. With no saved response this is the
 * served order unchanged.
 */
export function orderingIdsFromResponse(
  itemIds: string[],
  response: AttemptAnswerResponse | null,
): string[] {
  const known = new Set(itemIds)
  const ordered: string[] = []
  for (const id of response?.order ?? []) {
    if (known.has(id) && !ordered.includes(id)) ordered.push(id)
  }
  for (const id of itemIds) {
    if (!ordered.includes(id)) ordered.push(id)
  }
  return ordered
}

// ──────────────────────────────────────────────
// Cloze text rendering
// ──────────────────────────────────────────────

export type ClozeSegment = { kind: 'text'; text: string } | { kind: 'blank'; index: number }

/** Split a cloze text into literal segments and `{{n}}` blank slots, in order. */
export function clozeSegments(text: string): ClozeSegment[] {
  const segments: ClozeSegment[] = []
  let cursor = 0
  for (const match of text.matchAll(/\{\{(\d+)\}\}/g)) {
    const index = Number.parseInt(match[1]!, 10)
    if (index < 1) continue
    if (match.index! > cursor) {
      segments.push({ kind: 'text', text: text.slice(cursor, match.index) })
    }
    segments.push({ kind: 'blank', index })
    cursor = match.index! + match[0].length
  }
  if (cursor < text.length) {
    segments.push({ kind: 'text', text: text.slice(cursor) })
  }
  return segments
}
