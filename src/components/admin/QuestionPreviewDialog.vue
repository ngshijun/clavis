<script setup lang="ts">
import type { Question } from '@/stores/questions'
import { useQuestionsStore } from '@/stores/questions'
import type { QuestionFeedback } from '@/stores/feedback'
import type { Database } from '@/types/database.types'
import { parseSimpleMarkdown } from '@/lib/utils'
import { CheckCircle2, AlertTriangle } from 'lucide-vue-next'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { useT } from '@/composables/useT'

type FeedbackCategory = Database['public']['Enums']['feedback_category']

defineProps<{
  question: Question | null
  feedback?: QuestionFeedback | null
}>()

const open = defineModel<boolean>('open', { required: true })

const t = useT()
const questionsStore = useQuestionsStore()

// Category labels
function getCategoryLabel(category: FeedbackCategory): string {
  const labels: Record<FeedbackCategory, string> = {
    question_error: t.value.shared.questionFeedbackDialog.categories.question_error,
    image_error: t.value.shared.questionFeedbackDialog.categories.image_error,
    option_error: t.value.shared.questionFeedbackDialog.categories.option_error,
    answer_error: t.value.shared.questionFeedbackDialog.categories.answer_error,
    explanation_error: t.value.shared.questionFeedbackDialog.categories.explanation_error,
    other: t.value.shared.questionFeedbackDialog.categories.other,
  }
  return labels[category]
}

function getCategoryVariant(
  category: FeedbackCategory,
): 'default' | 'secondary' | 'destructive' | 'outline' {
  const variants: Record<FeedbackCategory, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    question_error: 'destructive',
    image_error: 'secondary',
    option_error: 'default',
    answer_error: 'destructive',
    explanation_error: 'secondary',
    other: 'outline',
  }
  return variants[category]
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          {{ t.shared.questionPreviewDialog.title }}
          <Badge v-if="question" variant="secondary">
            {{
              question.type === 'mcq'
                ? t.shared.questionPreviewDialog.multipleChoice
                : question.type === 'mrq'
                  ? t.shared.questionPreviewDialog.multipleResponse
                  : t.shared.questionPreviewDialog.shortAnswer
            }}
          </Badge>
        </DialogTitle>
      </DialogHeader>

      <div v-if="question" class="space-y-6">
        <!-- Feedback Info (when viewing from feedback page) -->
        <div
          v-if="feedback"
          class="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-900 dark:bg-red-950/20"
        >
          <div class="mb-2 flex items-center gap-2">
            <AlertTriangle class="size-5 text-red-600" />
            <h3 class="font-semibold text-red-700 dark:text-red-400">
              {{ t.shared.questionPreviewDialog.reportedIssue }}
            </h3>
          </div>
          <div class="space-y-2">
            <div class="flex items-center gap-2">
              <span class="text-sm text-muted-foreground">{{
                t.shared.questionPreviewDialog.category
              }}</span>
              <Badge :variant="getCategoryVariant(feedback.category)">
                {{ getCategoryLabel(feedback.category) }}
              </Badge>
            </div>
            <div v-if="feedback.comments">
              <span class="text-sm text-muted-foreground">{{
                t.shared.questionPreviewDialog.comments
              }}</span>
              <p class="mt-1 text-sm text-red-700 dark:text-red-300">{{ feedback.comments }}</p>
            </div>
            <div v-else>
              <span class="text-sm italic text-muted-foreground">{{
                t.shared.questionPreviewDialog.noComments
              }}</span>
            </div>
          </div>
        </div>

        <!-- Question Metadata (Breadcrumb hierarchy) -->
        <div class="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
          <span>{{ question.gradeLevelName }}</span>
          <span class="text-muted-foreground/50">/</span>
          <span>{{ question.subjectName }}</span>
          <span class="text-muted-foreground/50">/</span>
          <span>{{ question.topicName }}</span>
          <span class="text-muted-foreground/50">/</span>
          <span class="font-medium text-foreground">{{ question.subTopicName }}</span>
        </div>

        <!-- Question Text -->
        <div class="space-y-2">
          <h3 class="font-semibold">{{ t.shared.questionPreviewDialog.questionText }}</h3>
          <div
            class="text-foreground leading-relaxed"
            v-html="parseSimpleMarkdown(question.question)"
          />
        </div>

        <!-- Question Image -->
        <div v-if="question.imagePath" class="space-y-2">
          <h3 class="font-semibold">{{ t.shared.questionPreviewDialog.questionImage }}</h3>
          <img
            :src="questionsStore.getOptimizedQuestionImageUrl(question.imagePath)"
            alt="Question image"
            class="max-h-48 rounded-lg border object-contain"
          />
        </div>

        <!-- MCQ/MRQ Options -->
        <div v-if="question.type === 'mcq' || question.type === 'mrq'" class="space-y-2">
          <h3 class="font-semibold">{{ t.shared.questionPreviewDialog.options }}</h3>
          <div class="space-y-2">
            <div
              v-for="option in question.options"
              :key="option.id"
              class="space-y-2 rounded-lg border p-3 transition-colors"
              :class="{
                'border-green-500 bg-green-50 dark:bg-green-950/20': option.isCorrect,
              }"
            >
              <div class="flex items-center gap-3">
                <span
                  class="flex size-8 shrink-0 items-center justify-center rounded-full border font-medium"
                  :class="{
                    'border-green-500 bg-green-500 text-white': option.isCorrect,
                  }"
                >
                  {{ option.id.toUpperCase() }}
                </span>
                <div class="flex flex-1 items-center gap-2">
                  <span v-if="option.text">{{ option.text }}</span>
                  <img
                    v-if="option.imagePath"
                    :src="questionsStore.getThumbnailQuestionImageUrl(option.imagePath)"
                    :alt="`Option ${option.id.toUpperCase()}`"
                    class="max-h-16 rounded border object-contain"
                  />
                  <span
                    v-if="!option.text && !option.imagePath"
                    class="text-muted-foreground italic"
                  >
                    {{ t.shared.questionPreviewDialog.emptyOption }}
                  </span>
                </div>
                <CheckCircle2 v-if="option.isCorrect" class="size-5 shrink-0 text-green-500" />
              </div>
              <!-- Per-option tip: shown to a student who picks this option incorrectly -->
              <div
                v-if="option.tip"
                class="rounded border border-amber-200 bg-amber-50 p-2 text-sm text-amber-700 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300"
              >
                <span class="font-medium">{{ t.shared.questionPreviewDialog.tipLabel }}</span>
                {{ option.tip }}
              </div>
            </div>
          </div>
        </div>

        <!-- Short Answer -->
        <div v-if="question.type === 'short_answer'" class="space-y-2">
          <h3 class="font-semibold">{{ t.shared.questionPreviewDialog.correctAnswer }}</h3>
          <div class="rounded-lg border border-green-500 bg-green-50 p-3 dark:bg-green-950/20">
            <div class="flex items-center gap-2">
              <CheckCircle2 class="size-5 shrink-0 text-green-500" />
              <span class="font-medium">{{ question.answer || 'N/A' }}</span>
            </div>
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
