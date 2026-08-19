import { getCurrentScope, onScopeDispose, ref, type Ref } from 'vue'

export type SaveStatus = 'idle' | 'saving' | 'saved'

export interface EnqueueOptions<T> {
  /**
   * The value BEFORE the local optimistic change — becomes the
   * server-confirmed baseline the first time a key is seen. Later enqueues
   * for the same key ignore it (the composable tracks confirmation from
   * save results).
   */
  previous: T
  /** Persist this exact value (positional reorder RPC, payload update, …). */
  save: (value: T) => Promise<{ error: string | null }>
  /** Restore local state to the last server-confirmed value. */
  rollback: (confirmed: T) => void
}

interface KeyState {
  /** Last value the server is known to hold (serialized snapshot). */
  confirmed: string
  /** Latest optimistically-applied local value (serialized snapshot). */
  latest: string
  save: (value: unknown) => Promise<{ error: string | null }>
  rollback: (confirmed: unknown) => void
  timer: ReturnType<typeof setTimeout> | null
  inFlightSeq: number | null
}

export interface UseAutosaveOptions {
  /** Debounce window between the last change and the save request. */
  debounceMs?: number
  /** How long the "Saved" affordance stays before fading to idle. */
  savedDisplayMs?: number
  /** Called with a user-facing message when a save FINALLY fails (post-rollback). */
  onError?: (message: string) => void
}

/**
 * Google-style background autosave (decision 72b, generalized for the Forms
 * builder): editing and dragging are never blocked; the optimistic change is
 * instant and persistence happens in the background.
 *
 * - Rapid changes are debounced and coalesced per key: only the LATEST value
 *   is sent, and while a save is in flight at most one follow-up is queued.
 * - A monotonically increasing sequence guards every response; a stale
 *   response can never clobber a newer local value (success only advances
 *   the confirmed baseline — it never touches local state).
 * - On final failure the local state rolls back to the last server-confirmed
 *   value and `onError` fires. A failure superseded by a newer change is
 *   swallowed; the newer save decides.
 * - `flush()` dispatches any debounced save immediately (called automatically
 *   on scope dispose, i.e. component unmount / route leave).
 *
 * Keys isolate independent saves (one per list / per question payload /
 * per points field) so they never coalesce with each other. Values must be
 * JSON-serializable — snapshots are taken via JSON so a caller mutating the
 * enqueued value afterwards cannot corrupt the queue.
 */
export function useAutosave(options: UseAutosaveOptions = {}) {
  const debounceMs = options.debounceMs ?? 400
  const savedDisplayMs = options.savedDisplayMs ?? 2000

  const status: Ref<SaveStatus> = ref('idle')
  const keys = new Map<string, KeyState>()
  let seqCounter = 0
  let savedFadeTimer: ReturnType<typeof setTimeout> | null = null

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

  function enqueue<T>(key: string, value: T, opts: EnqueueOptions<T>): void {
    let state = keys.get(key)
    if (!state) {
      state = {
        confirmed: JSON.stringify(opts.previous),
        latest: '',
        save: opts.save as KeyState['save'],
        rollback: opts.rollback as KeyState['rollback'],
        timer: null,
        inFlightSeq: null,
      }
      keys.set(key, state)
    }
    state.latest = JSON.stringify(value)
    state.save = opts.save as KeyState['save']
    state.rollback = opts.rollback as KeyState['rollback']
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
    // final value — this is the "at most one follow-up" coalescing.
    if (state.inFlightSeq !== null) return
    // Changed back to the confirmed value — nothing to persist.
    if (state.latest === state.confirmed) {
      settleStatus()
      return
    }

    const seq = ++seqCounter
    const sent = state.latest
    state.inFlightSeq = seq
    void state.save(JSON.parse(sent)).then(
      (result) => settle(key, seq, sent, result.error ?? null),
      (err: unknown) => settle(key, seq, sent, err instanceof Error ? err.message : String(err)),
    )
  }

  function settle(key: string, seq: number, sent: string, error: string | null): void {
    const state = keys.get(key)
    // Stale-response guard: only the response for the CURRENT in-flight
    // sequence may settle this key.
    if (!state || state.inFlightSeq !== seq) return
    state.inFlightSeq = null

    const superseded = state.timer !== null || state.latest !== sent

    if (error === null) {
      // The server now holds this value, even if a newer local one exists.
      state.confirmed = sent
      if (superseded) {
        // A pending debounce timer will dispatch on its own; otherwise the
        // follow-up change arrived mid-flight and must be dispatched now.
        if (state.timer === null) dispatch(key)
        return
      }
      settleStatus()
      return
    }

    if (superseded) {
      // This failure is already obsolete — the newer value's save decides.
      if (state.timer === null) dispatch(key)
      return
    }

    // Final failure: restore the last server-confirmed value.
    state.latest = state.confirmed
    state.rollback(JSON.parse(state.confirmed))
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
