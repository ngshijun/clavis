import { computed, type Ref, type ComputedRef } from 'vue'

interface SessionWithStats {
  score: number | null
  durationSeconds: number | null
  gradeLevelName: string
  subjectName: string
  topicName: string
  subTopicName: string
}

export function useStatisticsSummary<T extends SessionWithStats>(
  sessions: Ref<T[]> | ComputedRef<T[]>,
) {
  // Every practice session is stored already completed (decision 85).
  const completedSessions = computed(() => sessions.value)

  const averageScore = computed(() => {
    const completed = completedSessions.value
    if (completed.length === 0) return 0
    const totalScore = completed.reduce((sum, s) => sum + (s.score ?? 0), 0)
    return Math.round(totalScore / completed.length)
  })

  const totalSessions = computed(() => completedSessions.value.length)

  const totalStudyTime = computed(() =>
    completedSessions.value.reduce((sum, s) => sum + (s.durationSeconds ?? 0), 0),
  )

  const subTopicsPracticed = computed(() => {
    const subTopicSet = new Set<string>()
    for (const s of completedSessions.value) {
      subTopicSet.add(`${s.gradeLevelName}::${s.subjectName}::${s.topicName}::${s.subTopicName}`)
    }
    return subTopicSet.size
  })

  return { completedSessions, averageScore, totalSessions, totalStudyTime, subTopicsPracticed }
}
