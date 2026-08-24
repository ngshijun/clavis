<script setup lang="ts">
import { onMounted } from 'vue'
import { useActiveClassroom } from '@/composables/useActiveClassroom'
import { useRouter, useRoute } from 'vue-router'
import { useStudentAssessmentsStore } from '@/stores/student-assessments'
import { useT } from '@/composables/useT'
import { formatDateTime } from '@/lib/date'
import { ArrowLeft, Clock, Loader2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import AssessmentReviewCard from '@/components/session/AssessmentReviewCard.vue'

const router = useRouter()
const route = useRoute()
const store = useStudentAssessmentsStore()
const t = useT()
const { basePath } = useActiveClassroom()

onMounted(async () => {
  const attemptId = route.params.attemptId as string
  const { error } = await store.loadReview(attemptId)

  if (error) {
    // Owner access requires a completed attempt; anything else routes back.
    toast.error(error)
    router.replace(`${basePath.value}/assessments`)
  }
})
</script>

<template>
  <div class="p-6">
    <!-- Loading -->
    <div v-if="store.isLoadingReview" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <template v-else-if="store.review">
      <!-- Header -->
      <div class="mb-6 flex items-center gap-3">
        <Button variant="outline" size="icon" @click="router.push(`${basePath}/assessments`)">
          <ArrowLeft class="size-4" />
          <span class="sr-only">{{ t.student.assessmentResult.back }}</span>
        </Button>
        <p v-if="store.review.completedAt" class="text-sm text-muted-foreground">
          {{ t.student.assessmentResult.completedLabel }}:
          {{ formatDateTime(store.review.completedAt) }}
        </p>
      </div>

      <!-- Score withheld (decision 70): no numbers at all, only the awaiting state -->
      <Card v-if="store.review.scoreWithheld" class="mb-6">
        <CardContent class="flex items-start gap-3 p-6">
          <Clock class="mt-0.5 size-6 shrink-0 text-amber-500" />
          <div>
            <p class="font-semibold">{{ t.student.assessmentResult.withheldTitle }}</p>
            <p class="text-sm text-muted-foreground">
              {{ t.student.assessmentResult.withheldDesc }}
            </p>
          </div>
        </CardContent>
      </Card>

      <!-- Score summary (final, or the auto subtotal while marking is pending) -->
      <Card v-else class="mb-6">
        <CardContent class="space-y-4 p-6">
          <div class="flex flex-wrap items-center gap-x-10 gap-y-3">
            <div v-if="store.review.scorePercent !== null">
              <p class="text-sm text-muted-foreground">
                {{ t.student.assessmentResult.scoreLabel }}
              </p>
              <p class="text-3xl font-bold">
                {{ store.review.scorePercent }}%<span
                  v-if="store.review.pendingCount > 0"
                  class="ml-2 align-middle text-sm font-medium text-amber-600 dark:text-amber-400"
                  >{{ t.student.assessmentResult.provisional }}</span
                >
              </p>
            </div>
            <div v-if="store.review.correctCount !== null">
              <p class="text-sm text-muted-foreground">
                {{ t.student.assessmentResult.correctLabel }}
              </p>
              <p class="text-3xl font-bold">
                {{ store.review.correctCount
                }}<span class="text-lg font-medium text-muted-foreground"
                  >/{{ store.review.totalQuestions }}</span
                >
              </p>
            </div>
            <div v-if="store.review.pointsAwarded !== null && store.review.pointsTotal !== null">
              <p class="text-sm text-muted-foreground">
                {{ t.student.assessmentResult.pointsLabel }}
              </p>
              <p class="text-3xl font-bold">
                {{ store.review.pointsAwarded
                }}<span class="text-lg font-medium text-muted-foreground"
                  >/{{ store.review.pointsTotal }}</span
                >
              </p>
            </div>
          </div>

          <!-- Marking outstanding: the score above is a floor, never final -->
          <div
            v-if="store.review.pendingCount > 0"
            class="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-200"
          >
            <Clock class="mt-0.5 size-4 shrink-0" />
            {{ t.student.assessmentResult.pendingBanner(store.review.pendingCount) }}
          </div>

          <p v-if="!store.review.answersRevealed" class="text-sm text-muted-foreground">
            {{ t.student.assessmentResult.keyHiddenNote }}
          </p>
          <p v-else class="text-sm text-muted-foreground">
            {{ t.student.assessmentResult.answersShownNote }}
          </p>
        </CardContent>
      </Card>

      <!-- Per-question breakdown, gated entirely by get_attempt_result -->
      <div class="space-y-4">
        <AssessmentReviewCard
          v-for="(question, index) in store.review.questions"
          :key="question.assessmentQuestionId"
          :question="question"
          :index="index"
          :grades-hidden="store.review.scoreWithheld"
        />
      </div>
    </template>
  </div>
</template>
