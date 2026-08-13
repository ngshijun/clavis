import { describe, it, expect } from 'vitest'
import {
  buildTrueFalseResponse,
  buildClozeResponse,
  buildMatchingResponse,
  buildOrderingResponse,
  trueFalseFromResponse,
  clozeValuesFromResponse,
  matchingSelectionFromResponse,
  orderingIdsFromResponse,
  clozeSegments,
} from './attemptResponse'

describe('buildTrueFalseResponse', () => {
  it('wraps the boolean as {value}', () => {
    expect(buildTrueFalseResponse(true)).toEqual({ value: true })
    expect(buildTrueFalseResponse(false)).toEqual({ value: false })
  })
})

describe('buildClozeResponse', () => {
  it('emits exactly one trimmed entry per filled blank, ascending by index', () => {
    expect(buildClozeResponse({ 3: ' even ', 1: 'seven', 2: '8' })).toEqual({
      blanks: [
        { index: 1, value: 'seven' },
        { index: 2, value: '8' },
        { index: 3, value: 'even' },
      ],
    })
  })

  it('drops blank/whitespace values instead of submitting empties', () => {
    expect(buildClozeResponse({ 1: 'seven', 2: '   ', 3: '' })).toEqual({
      blanks: [{ index: 1, value: 'seven' }],
    })
  })

  it('returns null when nothing is filled in', () => {
    expect(buildClozeResponse({})).toBeNull()
    expect(buildClozeResponse({ 1: '', 2: '  ' })).toBeNull()
  })

  it('ignores non-positive indices', () => {
    expect(buildClozeResponse({ 0: 'x', [-1]: 'y', 1: 'z' })).toEqual({
      blanks: [{ index: 1, value: 'z' }],
    })
  })
})

describe('buildMatchingResponse', () => {
  it('emits one pair per matched left item, in left order', () => {
    expect(buildMatchingResponse(['l1', 'l2', 'l3'], { l2: 'r1', l1: 'r2', l3: null })).toEqual({
      pairs: [
        { left_id: 'l1', right_id: 'r2' },
        { left_id: 'l2', right_id: 'r1' },
      ],
    })
  })

  it('ignores stale selection keys that are not current left ids', () => {
    expect(buildMatchingResponse(['l1'], { l1: 'r1', ghost: 'r2' })).toEqual({
      pairs: [{ left_id: 'l1', right_id: 'r1' }],
    })
  })

  it('returns null when nothing is matched', () => {
    expect(buildMatchingResponse(['l1', 'l2'], { l1: null })).toBeNull()
  })
})

describe('buildOrderingResponse', () => {
  it('copies the sequence, position 1 first', () => {
    const order = ['i2', 'i4', 'i1', 'i3']
    const response = buildOrderingResponse(order)
    expect(response).toEqual({ order: ['i2', 'i4', 'i1', 'i3'] })
    expect(response.order).not.toBe(order)
  })
})

describe('trueFalseFromResponse', () => {
  it('round-trips a saved boolean and rejects anything else', () => {
    expect(trueFalseFromResponse({ value: false })).toBe(false)
    expect(trueFalseFromResponse({ value: true })).toBe(true)
    expect(trueFalseFromResponse(null)).toBeNull()
    expect(trueFalseFromResponse({})).toBeNull()
  })
})

describe('clozeValuesFromResponse', () => {
  it('round-trips saved blanks into the values record', () => {
    const built = buildClozeResponse({ 1: 'seven', 3: 'even' })
    expect(clozeValuesFromResponse(built)).toEqual({ 1: 'seven', 3: 'even' })
  })

  it('returns an empty record for null/missing blanks', () => {
    expect(clozeValuesFromResponse(null)).toEqual({})
    expect(clozeValuesFromResponse({})).toEqual({})
  })
})

describe('matchingSelectionFromResponse', () => {
  it('rebuilds the selection with null for unmatched left items', () => {
    const built = buildMatchingResponse(['l1', 'l2', 'l3'], { l1: 'r2', l3: 'r1' })
    expect(matchingSelectionFromResponse(['l1', 'l2', 'l3'], built)).toEqual({
      l1: 'r2',
      l2: null,
      l3: 'r1',
    })
  })

  it('drops pairs whose left id no longer exists', () => {
    expect(
      matchingSelectionFromResponse(['l1'], { pairs: [{ left_id: 'ghost', right_id: 'r1' }] }),
    ).toEqual({ l1: null })
  })
})

describe('orderingIdsFromResponse', () => {
  it('uses the saved order when it covers the items', () => {
    expect(orderingIdsFromResponse(['i1', 'i2', 'i3'], { order: ['i3', 'i1', 'i2'] })).toEqual([
      'i3',
      'i1',
      'i2',
    ])
  })

  it('falls back to the served order without a response', () => {
    expect(orderingIdsFromResponse(['i2', 'i4', 'i1'], null)).toEqual(['i2', 'i4', 'i1'])
  })

  it('filters unknown ids, dedupes, and appends unsaved ids in served order', () => {
    expect(
      orderingIdsFromResponse(['i1', 'i2', 'i3', 'i4'], { order: ['i3', 'ghost', 'i3', 'i1'] }),
    ).toEqual(['i3', 'i1', 'i2', 'i4'])
  })
})

describe('clozeSegments', () => {
  it('splits text and blank slots in order', () => {
    expect(clozeSegments('5 + {{1}} = 12, so 12 is {{2}}.')).toEqual([
      { kind: 'text', text: '5 + ' },
      { kind: 'blank', index: 1 },
      { kind: 'text', text: ' = 12, so 12 is ' },
      { kind: 'blank', index: 2 },
      { kind: 'text', text: '.' },
    ])
  })

  it('handles leading/trailing blanks and text without placeholders', () => {
    expect(clozeSegments('{{1}} end')).toEqual([
      { kind: 'blank', index: 1 },
      { kind: 'text', text: ' end' },
    ])
    expect(clozeSegments('no blanks')).toEqual([{ kind: 'text', text: 'no blanks' }])
  })

  it('skips {{0}} (indices are 1-based) but keeps repeats of a valid index', () => {
    expect(clozeSegments('{{0}}a{{1}}b{{1}}')).toEqual([
      { kind: 'text', text: '{{0}}a' },
      { kind: 'blank', index: 1 },
      { kind: 'text', text: 'b' },
      { kind: 'blank', index: 1 },
    ])
  })
})
