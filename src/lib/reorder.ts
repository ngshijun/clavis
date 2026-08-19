import { nextTick } from 'vue'

/**
 * Move one element of a list to an adjacent (or further) position.
 *
 * The keyboard-reorder counterpart of a drag (decision 77): every reorder
 * surface funnels arrow-key moves through this helper and then emits the SAME
 * ordered result a drop would, so persistence (positional RPCs, autosave
 * coalescing, rollback) is identical for both input methods.
 *
 * Returns the reordered copy, or `null` when the move is impossible
 * (index out of range, or the target position falls outside the list) —
 * callers treat `null` as a no-op.
 */
export function moveItem<T>(list: readonly T[], from: number, delta: number): T[] | null {
  const to = from + delta
  if (delta === 0) return null
  if (from < 0 || from >= list.length) return null
  if (to < 0 || to >= list.length) return null
  const next = [...list]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved as T)
  return next
}

/**
 * Re-focus a reorder grip after a keyboard move.
 *
 * Vue's keyed patch relocates the moved node itself on an UPWARD move, and
 * Chrome blurs a re-inserted node — so focus silently fell to <body> and every
 * press after the first was swallowed (arrow keys scrolled the page instead).
 * Downward moves relocate the *other* node, which is why only up-moves broke.
 *
 * Grips carry `data-reorder-id="<item id>"`; re-focus the moved row's grip once
 * the patch has landed so repeated presses keep working.
 */
export async function refocusReorderHandle(itemId: string | number): Promise<void> {
  await nextTick()
  const id = String(itemId)
  const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id
  const handle = document.querySelector<HTMLElement>(`[data-reorder-id="${escaped}"]`)
  handle?.focus()
}
