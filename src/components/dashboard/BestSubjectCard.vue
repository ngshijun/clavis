<script setup lang="ts">
import { computed } from 'vue'
import { usePracticeHistoryStore } from '@/stores/practice-history'
import { computeScorePercent } from '@/lib/questionHelpers'
import { useRouter } from 'vue-router'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Trophy } from 'lucide-vue-next'
import BestSubjectsList from '@/components/shared/BestSubjectsList.vue'
import { useT } from '@/composables/useT'

const t = useT()

const practiceStore = usePracticeHistoryStore()
const router = useRouter()

interface SubjectStats {
  gradeLevelName: string
  subjectName: string
  totalScore: number
  sessionCount: number
  averageScore: number
}

const topSubjects = computed<SubjectStats[]>(() => {
  const completedSessions = practiceStore
    .getFilteredHistory()
    .filter((s) => s.completedAt && s.totalQuestions > 0)

  if (completedSessions.length === 0) return []

  const subjectMap = new Map<
    string,
    { gradeLevelName: string; subjectName: string; totalScore: number; count: number }
  >()

  completedSessions.forEach((session) => {
    const score = computeScorePercent(session.correctAnswers, session.totalQuestions)
    const key = `${session.gradeLevelName}::${session.subjectName}`
    const existing = subjectMap.get(key)

    if (existing) {
      existing.totalScore += score
      existing.count += 1
    } else {
      subjectMap.set(key, {
        gradeLevelName: session.gradeLevelName,
        subjectName: session.subjectName,
        totalScore: score,
        count: 1,
      })
    }
  })

  const subjects: SubjectStats[] = []
  subjectMap.forEach((stats) => {
    subjects.push({
      gradeLevelName: stats.gradeLevelName,
      subjectName: stats.subjectName,
      totalScore: stats.totalScore,
      sessionCount: stats.count,
      averageScore: Math.round(stats.totalScore / stats.count),
    })
  })

  return subjects.sort((a, b) => b.averageScore - a.averageScore).slice(0, 3)
})

function goToHistory() {
  router.push('/student/history')
}
</script>

<template>
  <!-- Soft blue tint - knowledge/learning association -->
  <Card
    class="cursor-pointer border-sky-200 bg-gradient-to-br from-sky-50 to-blue-50 transition-shadow hover:shadow-lg dark:border-sky-900/50 dark:bg-card dark:from-sky-950/30 dark:to-blue-950/30"
    @click="goToHistory"
  >
    <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle class="text-sm font-medium">{{ t.shared.bestSubjectCard.title }}</CardTitle>
      <Trophy class="size-4 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      <BestSubjectsList
        :subjects="topSubjects"
        :empty-label="t.shared.bestSubjectCard.practiceMore"
        :format-score="t.shared.bestSubjectCard.averageLabel"
      />
    </CardContent>
  </Card>
</template>
