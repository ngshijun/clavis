import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAutosave, type EnqueueOptions } from './useAutosave'

/** A save the test resolves by hand, so in-flight windows are controllable. */
function deferredSave() {
  const calls: string[][] = []
  const resolvers: ((result: { error: string | null }) => void)[] = []
  const save = (orderedIds: string[]): Promise<{ error: string | null }> => {
    calls.push(orderedIds)
    return new Promise((resolve) => {
      resolvers.push(resolve)
    })
  }
  const resolveNext = async (result: { error: string | null } = { error: null }) => {
    resolvers.shift()?.(result)
    // Let the settle handler's microtask run.
    await Promise.resolve()
    await Promise.resolve()
  }
  return { save, calls, resolveNext }
}

const DEBOUNCE = 400
const SAVED_DISPLAY = 2000

describe('useAutosave', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function makeOpts(
    save: EnqueueOptions<string[]>['save'],
    rollback = vi.fn(),
  ): EnqueueOptions<string[]> {
    return { previous: ['a', 'b', 'c'], save, rollback }
  }

  it('debounces rapid drags into ONE save carrying only the latest order', async () => {
    const { save, calls, resolveNext } = deferredSave()
    const { enqueue } = useAutosave()

    enqueue('k', ['b', 'a', 'c'], makeOpts(save))
    await vi.advanceTimersByTimeAsync(100)
    enqueue('k', ['c', 'b', 'a'], makeOpts(save))
    await vi.advanceTimersByTimeAsync(100)
    enqueue('k', ['c', 'a', 'b'], makeOpts(save))

    expect(calls).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(DEBOUNCE)

    expect(calls).toEqual([['c', 'a', 'b']])
    await resolveNext()
  })

  it('coalesces drags during an in-flight save into a single follow-up with the final order', async () => {
    const { save, calls, resolveNext } = deferredSave()
    const { enqueue } = useAutosave()

    enqueue('k', ['b', 'a', 'c'], makeOpts(save))
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    expect(calls).toHaveLength(1)

    // Two more drags while the first save is still in flight; their debounce
    // elapses mid-flight too — no extra request may be issued.
    enqueue('k', ['c', 'b', 'a'], makeOpts(save))
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    enqueue('k', ['a', 'c', 'b'], makeOpts(save))
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    expect(calls).toHaveLength(1)

    await resolveNext({ error: null })

    // Exactly one follow-up, carrying the FINAL order (intermediate dropped).
    expect(calls).toEqual([
      ['b', 'a', 'c'],
      ['a', 'c', 'b'],
    ])
    await resolveNext()
  })

  it('a stale success response never clobbers a newer local order', async () => {
    const { save, calls, resolveNext } = deferredSave()
    const rollback = vi.fn()
    const { enqueue } = useAutosave()

    enqueue('k', ['b', 'a', 'c'], makeOpts(save, rollback))
    await vi.advanceTimersByTimeAsync(DEBOUNCE)

    // Newer drag while in flight; the old response arrives afterwards.
    enqueue('k', ['c', 'b', 'a'], makeOpts(save, rollback))
    await resolveNext({ error: null })

    // The old success must not roll anything back or rewrite local state —
    // it only advances the baseline; the newer order is then saved.
    expect(rollback).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    expect(calls[calls.length - 1]).toEqual(['c', 'b', 'a'])
    await resolveNext()
  })

  it('rolls back to the last server-CONFIRMED order (not the original) on final failure', async () => {
    const { save, calls, resolveNext } = deferredSave()
    const rollback = vi.fn()
    const onError = vi.fn()
    const { enqueue } = useAutosave({ onError })

    // First drag saves fine → confirmed becomes b,a,c.
    enqueue('k', ['b', 'a', 'c'], makeOpts(save, rollback))
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await resolveNext({ error: null })

    // Second drag fails → roll back to b,a,c, not the original a,b,c.
    enqueue('k', ['c', 'b', 'a'], makeOpts(save, rollback))
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await resolveNext({ error: 'boom' })

    expect(rollback).toHaveBeenCalledTimes(1)
    expect(rollback).toHaveBeenCalledWith(['b', 'a', 'c'])
    expect(onError).toHaveBeenCalledWith('boom')
    expect(calls).toHaveLength(2)
  })

  it('swallows the failure of a superseded save and lets the newer order decide', async () => {
    const { save, calls, resolveNext } = deferredSave()
    const rollback = vi.fn()
    const onError = vi.fn()
    const { enqueue } = useAutosave({ onError })

    enqueue('k', ['b', 'a', 'c'], makeOpts(save, rollback))
    await vi.advanceTimersByTimeAsync(DEBOUNCE)

    // Newer drag while in flight, then the in-flight save FAILS.
    enqueue('k', ['c', 'b', 'a'], makeOpts(save, rollback))
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await resolveNext({ error: 'boom' })

    // No rollback, no toast — the follow-up save carries the final order.
    expect(rollback).not.toHaveBeenCalled()
    expect(onError).not.toHaveBeenCalled()
    expect(calls[calls.length - 1]).toEqual(['c', 'b', 'a'])

    await resolveNext({ error: null })
    expect(rollback).not.toHaveBeenCalled()
  })

  it('skips the round trip when the order returns to the confirmed baseline', async () => {
    const { save, calls } = deferredSave()
    const { enqueue, status } = useAutosave()

    enqueue('k', ['b', 'a', 'c'], makeOpts(save))
    // Dragged back to the original order before the debounce fired.
    enqueue('k', ['a', 'b', 'c'], makeOpts(save))
    await vi.advanceTimersByTimeAsync(DEBOUNCE)

    expect(calls).toHaveLength(0)
    expect(status.value).toBe('saved')
  })

  it('walks the status lifecycle idle → saving → saved → idle', async () => {
    const { save, resolveNext } = deferredSave()
    const { enqueue, status } = useAutosave()

    expect(status.value).toBe('idle')
    enqueue('k', ['b', 'a', 'c'], makeOpts(save))
    expect(status.value).toBe('saving')

    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    expect(status.value).toBe('saving')

    await resolveNext({ error: null })
    expect(status.value).toBe('saved')

    await vi.advanceTimersByTimeAsync(SAVED_DISPLAY)
    expect(status.value).toBe('idle')
  })

  it('returns to idle (no lingering "saving") after a final failure', async () => {
    const { save, resolveNext } = deferredSave()
    const { enqueue, status } = useAutosave({ onError: vi.fn() })

    enqueue('k', ['b', 'a', 'c'], makeOpts(save))
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await resolveNext({ error: 'boom' })

    expect(status.value).toBe('idle')
  })

  it('flush dispatches a pending debounced save immediately', async () => {
    const { save, calls, resolveNext } = deferredSave()
    const { enqueue, flush } = useAutosave()

    enqueue('k', ['b', 'a', 'c'], makeOpts(save))
    expect(calls).toHaveLength(0)

    flush()
    expect(calls).toEqual([['b', 'a', 'c']])
    await resolveNext()
  })

  it('treats a rejected save promise as a failure (rollback + onError)', async () => {
    const rollback = vi.fn()
    const onError = vi.fn()
    const { enqueue } = useAutosave({ onError })

    enqueue('k', ['b', 'a', 'c'], {
      previous: ['a', 'b', 'c'],
      save: () => Promise.reject(new Error('network down')),
      rollback,
    })
    await vi.advanceTimersByTimeAsync(DEBOUNCE)
    await Promise.resolve()
    await Promise.resolve()

    expect(rollback).toHaveBeenCalledWith(['a', 'b', 'c'])
    expect(onError).toHaveBeenCalledWith('network down')
  })

  it('persists arbitrary JSON values and snapshots them at enqueue time', async () => {
    const calls: unknown[] = []
    const resolvers: ((result: { error: string | null }) => void)[] = []
    const save = (value: { question: string }): Promise<{ error: string | null }> => {
      calls.push(value)
      return new Promise((resolve) => {
        resolvers.push(resolve)
      })
    }
    const { enqueue } = useAutosave()

    // Caller mutates the object AFTER enqueue — the snapshot must not follow.
    const payload = { question: 'first' }
    enqueue('payload:q1', payload, { previous: { question: 'stored' }, save, rollback: vi.fn() })
    payload.question = 'mutated'
    await vi.advanceTimersByTimeAsync(DEBOUNCE)

    expect(calls).toEqual([{ question: 'first' }])
    resolvers.shift()?.({ error: null })
    await Promise.resolve()
    await Promise.resolve()
  })

  it('keeps keys independent: saves for different lists never coalesce', async () => {
    const first = deferredSave()
    const second = deferredSave()
    const { enqueue, status } = useAutosave()

    enqueue('one', ['b', 'a'], { previous: ['a', 'b'], save: first.save, rollback: vi.fn() })
    enqueue('two', ['d', 'c'], { previous: ['c', 'd'], save: second.save, rollback: vi.fn() })
    await vi.advanceTimersByTimeAsync(DEBOUNCE)

    expect(first.calls).toEqual([['b', 'a']])
    expect(second.calls).toEqual([['d', 'c']])

    // Status stays "saving" until BOTH keys settle.
    await first.resolveNext({ error: null })
    expect(status.value).toBe('saving')
    await second.resolveNext({ error: null })
    expect(status.value).toBe('saved')
  })
})
