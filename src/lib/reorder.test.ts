import { describe, it, expect } from 'vitest'
import { moveItem } from './reorder'

describe('moveItem', () => {
  const list = ['a', 'b', 'c', 'd']

  it('moves an element down by one', () => {
    expect(moveItem(list, 1, 1)).toEqual(['a', 'c', 'b', 'd'])
  })

  it('moves an element up by one', () => {
    expect(moveItem(list, 2, -1)).toEqual(['a', 'c', 'b', 'd'])
  })

  it('does not mutate the input', () => {
    moveItem(list, 0, 1)
    expect(list).toEqual(['a', 'b', 'c', 'd'])
  })

  it('returns null when moving the first element up', () => {
    expect(moveItem(list, 0, -1)).toBeNull()
  })

  it('returns null when moving the last element down', () => {
    expect(moveItem(list, 3, 1)).toBeNull()
  })

  it('returns null for an out-of-range index', () => {
    expect(moveItem(list, -1, 1)).toBeNull()
    expect(moveItem(list, 4, -1)).toBeNull()
  })

  it('returns null for a zero delta', () => {
    expect(moveItem(list, 1, 0)).toBeNull()
  })

  it('returns null for a single-element list', () => {
    expect(moveItem(['only'], 0, 1)).toBeNull()
    expect(moveItem(['only'], 0, -1)).toBeNull()
  })
})
