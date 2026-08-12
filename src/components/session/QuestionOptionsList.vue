<script setup lang="ts">
import { useQuestionsStore } from '@/stores/questions'
import { useT } from '@/composables/useT'

const t = useT()

/**
 * Option content for the in-session list. Correctness is deliberately not part
 * of this shape — feedback is deferred to the results screen (decision 40), so
 * the runner only ever renders the student's own selection.
 */
export interface DisplayOption {
  id: string
  text: string | null
  imagePath: string | null
}

defineProps<{
  options: DisplayOption[]
  questionId: string
  questionType: 'mcq' | 'mrq'
  selectedOptionIds: Set<string>
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
        'border-primary bg-primary/5': selectedOptionIds.has(option.id),
        'hover:border-primary/50 hover:bg-muted/50': !disabled && !selectedOptionIds.has(option.id),
        'cursor-not-allowed': disabled,
      }"
      :disabled="disabled"
      @click="emit('select', option.id)"
    >
      <!-- Image-only layout: vertical with centered content -->
      <div v-if="isImageOnly" class="flex flex-col items-center gap-2">
        <span
          class="flex size-8 shrink-0 items-center justify-center self-start rounded-full border font-medium"
          :class="{
            'border-primary bg-primary text-primary-foreground': selectedOptionIds.has(option.id),
          }"
        >
          {{ String.fromCharCode(65 + index) }}
        </span>
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
            'border-primary bg-primary text-primary-foreground': selectedOptionIds.has(option.id),
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
      </div>
    </button>
  </div>
</template>
