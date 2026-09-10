import { DIFFICULTIES, type QuestionDifficulty } from '@/stores/assessment-bank'
import type { Json } from '@/types/database.types'

/**
 * A generation spec (decision 90): the recipe a paper is drawn from. It lives
 * here rather than in a store because a paper KEEPS its spec — the generator
 * dialog builds one, `generate_paper` validates and stores it, and
 * `regenerate_paper_item` reads it back to re-roll a single line.
 *
 * How a line's questions split across the three difficulty levels, as whole
 * percentages that must add up to 100. The MOE UASA ratio is 50/30/20.
 */
export type DifficultyMix = Record<QuestionDifficulty, number>

/** The MOE UASA ratio (5:3:2), and the default for a fresh line. */
export const DEFAULT_DIFFICULTY_MIX: DifficultyMix = { low: 50, medium: 30, high: 20 }

/** One line of a generation spec (decision 90): what to draw, and how many. */
export interface GenerationLine {
  /** Draw from the union of these sub-topics, so one line can mix them. */
  subTopicIds: string[]
  tagIds: string[]
  difficultyMix: DifficultyMix
  count: number
}

/** A fresh line: nothing chosen yet, five questions at the MOE ratio. */
export function emptyGenerationLine(): GenerationLine {
  return { subTopicIds: [], tagIds: [], difficultyMix: { ...DEFAULT_DIFFICULTY_MIX }, count: 5 }
}

/** A line is drawable once it names a sub-topic, a valid count and a ratio of 100. */
export function isGenerationLineValid(line: GenerationLine): boolean {
  const total = DIFFICULTIES.reduce((sum, level) => sum + line.difficultyMix[level], 0)
  return (
    line.subTopicIds.length > 0 &&
    Number.isInteger(line.count) &&
    line.count >= 1 &&
    line.count <= 50 &&
    DIFFICULTIES.every((level) => {
      const share = line.difficultyMix[level]
      return Number.isInteger(share) && share >= 0 && share <= 100
    }) &&
    total === 100
  )
}

/** A line that asked for more than the bank could give. */
export interface GenerationShortfall {
  line: number
  requested: number
  picked: number
}

/** The wire shape of a generation spec — what `generate_paper` reads. */
export function specToJson(lines: GenerationLine[]): Json {
  return lines.map((line) => ({
    sub_topic_ids: line.subTopicIds,
    tag_ids: line.tagIds,
    difficulty_mix: line.difficultyMix,
    count: line.count,
  }))
}
