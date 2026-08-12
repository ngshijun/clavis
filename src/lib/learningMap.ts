/**
 * Learning-map derivations (decision 19/20): stars and node states are
 * computed on the client from `student_sub_topic_stats` — never stored.
 * Thresholds can change here without a migration.
 */

export type StarCount = 0 | 1 | 2 | 3

/** Best-score thresholds for 1★ / 2★ / 3★, as whole-number percentages. */
export const STAR_THRESHOLDS: readonly [number, number, number] = [60, 80, 95]

/**
 * Derive the star count for a best score percentage.
 * ≥60 → 1★, ≥80 → 2★, ≥95 → 3★. Non-finite input yields 0.
 */
export function starsForScore(bestScorePercent: number): StarCount {
  if (!Number.isFinite(bestScorePercent)) return 0
  if (bestScorePercent >= STAR_THRESHOLDS[2]) return 3
  if (bestScorePercent >= STAR_THRESHOLDS[1]) return 2
  if (bestScorePercent >= STAR_THRESHOLDS[0]) return 1
  return 0
}

/** Per-student progress for one sub-topic (a `student_sub_topic_stats` row). */
export interface SubTopicStats {
  bestScorePercent: number
  sessionsCompleted: number
  lastCompletedAt: string | null
}

export type NodeState = 'not-started' | 'in-progress' | 'completed'

/**
 * Node state (decision 20): no stats row = not started; a row with 0★ =
 * in progress; ≥1★ = completed. States are display-only — every node is
 * always open, there is no gating.
 */
export function nodeStateForStats(stats: SubTopicStats | null | undefined): NodeState {
  if (!stats) return 'not-started'
  return starsForScore(stats.bestScorePercent) >= 1 ? 'completed' : 'in-progress'
}

/**
 * The recommended next node: the first node in path order with fewer than
 * 1★ that actually has questions to practice. Purely a "continue here"
 * hint — never a lock. Null when every practicable node is completed (or
 * the list is empty).
 */
export function recommendedNodeId<
  T extends { id: string; stars: StarCount; questionCount: number },
>(orderedNodes: readonly T[]): string | null {
  return orderedNodes.find((node) => node.stars < 1 && node.questionCount > 0)?.id ?? null
}

/** One sub-topic rendered as a stop on the learning map, in path order. */
export interface LearningMapNode {
  id: string
  name: string
  questionCount: number
  stars: StarCount
  state: NodeState
}
