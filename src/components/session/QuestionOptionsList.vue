<script setup lang="ts">
import type { MCQOption } from '@/stores/questions'
import { useQuestionsStore } from '@/stores/questions'
import { CheckCircle2, XCircle } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { useT } from '@/composables/useT'

const t = useT()

defineProps<{
  options: MCQOption[]
  questionId: string
  questionType: 'mcq' | 'mrq'
  selectedOptionIds: Set<string>
  isAnswered: boolean
  answeredOptionIds: string[]
  isImageOnly: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  select: [optionId: string]
}>()

const questionsStore = useQuestionsStore()
</script>

<template>
  <div :class="isImageOnly ? 'grid grid-cols-2 gap-3' : 'space-y-2'">
    <!-- Hint for MRQ -->
    <p
      v-if="questionType === 'mrq'"
      class="text-sm text-muted-foreground"
      :class="{ 'col-span-2': isImageOnly }"
    >
      {{ t.shared.questionOptionsList.selectAllCorrect }}
    </p>

    <button
      v-for="(option, index) in options"
      :key="option.id"
      class="w-full rounded-lg border p-4 transition-colors"
      :class="{
        'text-left': !isImageOnly,
        'border-primary bg-primary/5': selectedOptionIds.has(option.id) && !isAnswered,
        'hover:border-primary/50 hover:bg-muted/50':
          !isAnswered && !disabled && !selectedOptionIds.has(option.id),
        'cursor-not-allowed': isAnswered || disabled,
        'opacity-60': disabled && !isAnswered,
        'border-green-500 bg-green-50 dark:bg-green-950/20':
          isAnswered &&
          option.isCorrect &&
          (questionType === 'mcq' || answeredOptionIds.includes(option.id)),
        'border-red-500 bg-red-50 dark:bg-red-950/20':
          isAnswered &&
          ((answeredOptionIds.includes(option.id) && !option.isCorrect) ||
            (questionType === 'mrq' && option.isCorrect && !answeredOptionIds.includes(option.id))),
      }"
      :disabled="isAnswered || disabled"
      @click="emit('select', option.id)"
    >
      <!-- Image-only layout: vertical with centered content -->
      <div v-if="isImageOnly" class="flex flex-col items-center gap-2">
        <div class="flex w-full items-center justify-between">
          <span
            class="flex size-8 shrink-0 items-center justify-center rounded-full border font-medium"
            :class="{
              'border-primary bg-primary text-primary-foreground':
                selectedOptionIds.has(option.id) && !isAnswered,
              'border-green-500 bg-green-500 text-white':
                isAnswered &&
                option.isCorrect &&
                (questionType === 'mcq' || answeredOptionIds.includes(option.id)),
              'border-red-500 bg-red-500 text-white':
                isAnswered &&
                ((answeredOptionIds.includes(option.id) && !option.isCorrect) ||
                  (questionType === 'mrq' &&
                    option.isCorrect &&
                    !answeredOptionIds.includes(option.id))),
            }"
          >
            {{ String.fromCharCode(65 + index) }}
          </span>
          <div class="flex items-center gap-1">
            <!-- Correct and selected -->
            <template
              v-if="isAnswered && option.isCorrect && answeredOptionIds.includes(option.id)"
            >
              <CheckCircle2 class="size-5 text-green-500" />
              <Badge
                variant="outline"
                class="border-green-500 text-xs text-green-600 dark:border-green-600 dark:text-green-400"
              >
                {{ t.shared.questionOptionsList.yourAnswer }}
              </Badge>
            </template>
            <!-- MCQ: Correct but NOT selected (show correct answer) -->
            <template
              v-else-if="
                isAnswered &&
                questionType === 'mcq' &&
                option.isCorrect &&
                !answeredOptionIds.includes(option.id)
              "
            >
              <CheckCircle2 class="size-5 text-green-500" />
              <Badge
                variant="outline"
                class="border-green-500 text-xs text-green-600 dark:border-green-600 dark:text-green-400"
              >
                {{ t.shared.questionOptionsList.correctAnswer }}
              </Badge>
            </template>
            <!-- MRQ: Correct but NOT selected (missed - show as error) -->
            <template
              v-else-if="
                isAnswered &&
                questionType === 'mrq' &&
                option.isCorrect &&
                !answeredOptionIds.includes(option.id)
              "
            >
              <XCircle class="size-5 text-red-500" />
              <Badge
                variant="outline"
                class="border-red-500 text-xs text-red-600 dark:border-red-600 dark:text-red-400"
              >
                {{ t.shared.questionOptionsList.correctAnswer }}
              </Badge>
            </template>
            <!-- Incorrect and selected -->
            <template
              v-if="isAnswered && answeredOptionIds.includes(option.id) && !option.isCorrect"
            >
              <XCircle class="size-5 text-red-500" />
              <Badge
                variant="outline"
                class="border-red-500 text-xs text-red-600 dark:border-red-600 dark:text-red-400"
              >
                {{ t.shared.questionOptionsList.yourAnswer }}
              </Badge>
            </template>
          </div>
        </div>
        <img
          v-if="option.imagePath"
          :key="`${questionId}-${option.id}`"
          :src="questionsStore.getThumbnailQuestionImageUrl(option.imagePath)"
          :alt="`Option ${String.fromCharCode(65 + index)}`"
          class="max-h-32 rounded border object-contain"
          loading="lazy"
        />
      </div>

      <!-- Text/mixed layout: horizontal -->
      <div v-else class="flex items-center gap-3">
        <span
          class="flex size-8 shrink-0 items-center justify-center rounded-full border font-medium"
          :class="{
            'border-primary bg-primary text-primary-foreground':
              selectedOptionIds.has(option.id) && !isAnswered,
            'border-green-500 bg-green-500 text-white':
              isAnswered &&
              option.isCorrect &&
              (questionType === 'mcq' || answeredOptionIds.includes(option.id)),
            'border-red-500 bg-red-500 text-white':
              isAnswered &&
              ((answeredOptionIds.includes(option.id) && !option.isCorrect) ||
                (questionType === 'mrq' &&
                  option.isCorrect &&
                  !answeredOptionIds.includes(option.id))),
          }"
        >
          {{ String.fromCharCode(65 + index) }}
        </span>
        <div class="flex flex-1 items-center gap-2">
          <span v-if="option.text">{{ option.text }}</span>
          <img
            v-if="option.imagePath"
            :key="`${questionId}-${option.id}`"
            :src="questionsStore.getThumbnailQuestionImageUrl(option.imagePath)"
            :alt="`Option ${String.fromCharCode(65 + index)}`"
            class="max-h-16 rounded border object-contain"
            loading="lazy"
          />
        </div>
        <!-- Correct and selected -->
        <div
          v-if="isAnswered && option.isCorrect && answeredOptionIds.includes(option.id)"
          class="ml-auto flex items-center gap-1"
        >
          <CheckCircle2 class="size-5 text-green-500" />
          <Badge
            variant="outline"
            class="border-green-500 text-xs text-green-600 dark:border-green-600 dark:text-green-400"
          >
            {{ t.shared.questionOptionsList.yourAnswer }}
          </Badge>
        </div>
        <!-- MCQ: Correct but NOT selected (show correct answer) -->
        <div
          v-else-if="
            isAnswered &&
            questionType === 'mcq' &&
            option.isCorrect &&
            !answeredOptionIds.includes(option.id)
          "
          class="ml-auto flex items-center gap-1"
        >
          <CheckCircle2 class="size-5 text-green-500" />
          <Badge
            variant="outline"
            class="border-green-500 text-xs text-green-600 dark:border-green-600 dark:text-green-400"
          >
            {{ t.shared.questionOptionsList.correctAnswer }}
          </Badge>
        </div>
        <!-- MRQ: Correct but NOT selected (missed - show as error) -->
        <div
          v-else-if="
            isAnswered &&
            questionType === 'mrq' &&
            option.isCorrect &&
            !answeredOptionIds.includes(option.id)
          "
          class="ml-auto flex items-center gap-1"
        >
          <XCircle class="size-5 text-red-500" />
          <Badge
            variant="outline"
            class="border-red-500 text-xs text-red-600 dark:border-red-600 dark:text-red-400"
          >
            {{ t.shared.questionOptionsList.correctAnswer }}
          </Badge>
        </div>
        <!-- Incorrect and selected -->
        <div
          v-if="isAnswered && answeredOptionIds.includes(option.id) && !option.isCorrect"
          class="ml-auto flex items-center gap-1"
        >
          <XCircle class="size-5 text-red-500" />
          <Badge
            variant="outline"
            class="border-red-500 text-xs text-red-600 dark:border-red-600 dark:text-red-400"
          >
            {{ t.shared.questionOptionsList.yourAnswer }}
          </Badge>
        </div>
      </div>
    </button>
  </div>
</template>
