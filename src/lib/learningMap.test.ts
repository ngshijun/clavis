import { describe, expect, it } from 'vitest'
import {
  nodeStateForStats,
  recommendedNodeId,
  starsForScore,
  type StarCount,
  type SubTopicStats,
} from './learningMap'

function stats(bestScorePercent: number): SubTopicStats {
  return { bestScorePercent, sessionsCompleted: 1, lastCompletedAt: '2026-08-12T00:00:00Z' }
}

describe('starsForScore', () => {
  it('maps threshold boundaries to 0–3 stars', () => {
    expect(starsForScore(0)).toBe(0)
    expect(starsForScore(59)).toBe(0)
    expect(starsForScore(60)).toBe(1)
    expect(starsForScore(79)).toBe(1)
    expect(starsForScore(80)).toBe(2)
    expect(starsForScore(94)).toBe(2)
    expect(starsForScore(95)).toBe(3)
    expect(starsForScore(100)).toBe(3)
  })

  it('returns 0 for non-finite input', () => {
    expect(starsForScore(Number.NaN)).toBe(0)
    expect(starsForScore(Number.POSITIVE_INFINITY)).toBe(0)
    expect(starsForScore(Number.NEGATIVE_INFINITY)).toBe(0)
  })

  it('returns 0 for negative scores', () => {
    expect(starsForScore(-5)).toBe(0)
  })
})

describe('nodeStateForStats', () => {
  it('is not-started without a stats row', () => {
    expect(nodeStateForStats(null)).toBe('not-started')
    expect(nodeStateForStats(undefined)).toBe('not-started')
  })

  it('is in-progress with a row below 1 star', () => {
    expect(nodeStateForStats(stats(0))).toBe('in-progress')
    expect(nodeStateForStats(stats(59))).toBe('in-progress')
  })

  it('is completed with at least 1 star', () => {
    expect(nodeStateForStats(stats(60))).toBe('completed')
    expect(nodeStateForStats(stats(100))).toBe('completed')
  })
})

describe('recommendedNodeId', () => {
  function node(id: string, stars: StarCount, questionCount = 10) {
    return { id, stars, questionCount }
  }

  it('skips zero-question nodes when recommending', () => {
    expect(recommendedNodeId([node('a', 3), node('b', 0, 0), node('c', 0)])).toBe('c')
  })

  it('returns null when the only unfinished nodes have no questions', () => {
    expect(recommendedNodeId([node('a', 1), node('b', 0, 0)])).toBeNull()
  })

  it('picks the first node with fewer than 1 star', () => {
    expect(recommendedNodeId([node('a', 3), node('b', 0), node('c', 0)])).toBe('b')
  })

  it('recommends the first node when nothing is started', () => {
    expect(recommendedNodeId([node('a', 0), node('b', 0)])).toBe('a')
  })

  it('returns null when every node is completed', () => {
    expect(recommendedNodeId([node('a', 1), node('b', 3)])).toBeNull()
  })

  it('returns null for an empty path', () => {
    expect(recommendedNodeId([])).toBeNull()
  })
})
