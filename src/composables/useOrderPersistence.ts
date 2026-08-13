import { getCurrentScope, onScopeDispose, ref, type Ref } from 'vue'

export type OrderSaveStatus = 'idle' | 'saving' | 'saved'

export interface EnqueueOptions {
  /**
   * The order on screen BEFORE the drag — becomes the server-confirmed
   * baseline the first time a key is seen. Later enqueues for the same key
   * ignore it (the composable tracks confirmation from save results).
   */
  previousIds: string[]
  /** Persist this exact id order (positional reorder RPC). */
  save: (orderedIds: string[]) => Promise<{ error: string | null }>
  /** Restore local state to the last server-confirmed order. */
  rollback: (confirmedIds: string[]) => void
}

interface KeyState {
  /** Last order the server is known to hold. */
  confirmed: string[]
  /** Latest optimistically-applied local order. */
  latest: string[]
  save: EnqueueOptions['save']
  rollback: EnqueueOptions['rollback']
  timer: ReturnType<typeof setTimeout> | null
  inFlightSeq: number | null
}

export interface UseOrderPersistenceOptions {
  /** Debounce window between the last drop and the save request. */
  debounceMs?: number
  /** How long the "Saved" affordance stays before fading to idle. */
  savedDisplayMs?: number
  /** Called with a user-facing message when a save FINALLY fails (post-rollback). */
  onError?: (message: string) => void
}

/**
 * Google-Sheets-style order persistence: dragging is never blocked; the
 * optimistic reorder is instant and saves happen in the background.
 *
 * - Rapid drags are debounced and coalesced: only the LATEST order is sent,
 *   and while a save is in flight at most one follow-up is queued.
 * - A monotonically increasing sequence guards every response; a stale
 *   response can never clobber a newer local order (success only advances
 *   the confirmed baseline — it never touches local state).
 * - On final failure the list rolls back to the last server-confirmed order
 *   and `onError` fires. A failure superseded by a newer drag is swallowed;
 *   the newer save decides.
 * - `flush()` dispatches any debounced save immediately (called automatically
 *   on scope dispose, i.e. component unmount / route leave).
 *
 * Keys isolate independent lists (e.g. one per curriculum parent) so saves
 * for different lists never coalesce with each other.
 */
export function useOrderPersistence(options: UseOrderPersistenceOptions = {}) {
  const debounceMs = options.debounceMs ?? 400
  const savedDisplayMs = options.savedDisplayMs ?? 2000

  const status: Ref<OrderSaveStatus> = ref('idle')
  const keys = new Map<string, KeyState>()
  let seqCounter = 0
  let savedFadeTimer: ReturnType<typeof setTimeout> | null = null

  function sameOrder(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((id, index) => id === b[index])
  }

  function anyActive(): boolean {
    for (const state of keys.values()) {
      if (state.timer !== null || state.inFlightSeq !== null) return true
    }
    return false
  }

  function clearSavedFade(): void {
    if (savedFadeTimer !== null) {
      clearTimeout(savedFadeTimer)
      savedFadeTimer = null
    }
  }

  function settleStatus(): void {
    if (anyActive()) return
    status.value = 'saved'
    clearSavedFade()
    savedFadeTimer = setTimeout(() => {
      status.value = 'idle'
      savedFadeTimer = null
    }, savedDisplayMs)
  }

  function enqueue(key: string, orderedIds: string[], opts: EnqueueOptions): void {
    let state = keys.get(key)
    if (!state) {
      state = {
        confirmed: opts.previousIds.slice(),
        latest: [],
        save: opts.save,
        rollback: opts.rollback,
        timer: null,
        inFlightSeq: null,
      }
      keys.set(key, state)
    }
    state.latest = orderedIds.slice()
    state.save = opts.save
    state.rollback = opts.rollback
    if (state.timer !== null) clearTimeout(state.timer)
    state.timer = setTimeout(() => dispatch(key), debounceMs)
    clearSavedFade()
    status.value = 'saving'
  }

  function dispatch(key: string): void {
    const state = keys.get(key)
    if (!state) return
    if (state.timer !== null) {
      clearTimeout(state.timer)
      state.timer = null
    }
    // A save is already in flight: its settle handler re-dispatches with the
    // final order — this is the "at most one follow-up" coalescing.
    if (state.inFlightSeq !== null) return
    // Dragged back to the confirmed order — nothing to persist.
    if (sameOrder(state.latest, state.confirmed)) {
      settleStatus()
      return
    }

    const seq = ++seqCounter
    const ids = state.latest.slice()
    state.inFlightSeq = seq
    void state.save(ids).then(
      (result) => settle(key, seq, ids, result.error ?? null),
      (err: unknown) => settle(key, seq, ids, err instanceof Error ? err.message : String(err)),
    )
  }

  function settle(key: string, seq: number, sentIds: string[], error: string | null): void {
    const state = keys.get(key)
    // Stale-response guard: only the response for the CURRENT in-flight
    // sequence may settle this key.
    if (!state || state.inFlightSeq !== seq) return
    state.inFlightSeq = null

    const superseded = state.timer !== null || !sameOrder(state.latest, sentIds)

    if (error === null) {
      // The server now holds this order, even if a newer local order exists.
      state.confirmed = sentIds
      if (superseded) {
        // A pending debounce timer will dispatch on its own; otherwise the
        // follow-up drag arrived mid-flight and must be dispatched now.
        if (state.timer === null) dispatch(key)
        return
      }
      settleStatus()
      return
    }

    if (superseded) {
      // This failure is already obsolete — the newer order's save decides.
      if (state.timer === null) dispatch(key)
      return
    }

    // Final failure: restore the last server-confirmed order.
    state.latest = state.confirmed.slice()
    state.rollback(state.confirmed.slice())
    options.onError?.(error)
    if (!anyActive()) {
      clearSavedFade()
      status.value = 'idle'
    }
  }

  /** Dispatch every debounced save immediately (unmount / route-leave). */
  function flush(): void {
    for (const [key, state] of keys) {
      if (state.timer !== null) dispatch(key)
    }
  }

  if (getCurrentScope()) onScopeDispose(flush)

  return { status, enqueue, flush }
}
