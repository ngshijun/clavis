<script setup lang="ts">
import { getScoreBarColor, getScoreTextColor, MEDAL_EMOJIS } from '@/lib/utils'

interface BestSubject {
  gradeLevelName: string
  subjectName: string
  averageScore: number
}

const props = defineProps<{
  subjects: BestSubject[]
  emptyLabel: string
  formatScore?: (score: number) => string
}>()

function displayScore(score: number): string {
  return props.formatScore ? props.formatScore(score) : `${score}%`
}
</script>

<template>
  <div class="space-y-2">
    <div v-for="index in 3" :key="index" class="flex items-center gap-2">
      <span class="text-lg leading-none">{{ MEDAL_EMOJIS[index - 1] }}</span>
      <template v-if="subjects[index - 1]">
        <div class="min-w-0 flex-1">
          <div class="flex items-baseline justify-between gap-2">
            <p class="truncate text-sm font-medium">
              {{ subjects[index - 1]!.gradeLevelName }} · {{ subjects[index - 1]!.subjectName }}
            </p>
            <span
              class="shrink-0 text-sm font-bold"
              :class="getScoreTextColor(subjects[index - 1]!.averageScore)"
            >
              {{ displayScore(subjects[index - 1]!.averageScore) }}
            </span>
          </div>
          <div class="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-sky-100 dark:bg-sky-900/30">
            <div
              class="h-full rounded-full transition-all"
              :class="getScoreBarColor(subjects[index - 1]!.averageScore)"
              :style="{ width: `${subjects[index - 1]!.averageScore}%` }"
            />
          </div>
        </div>
      </template>
      <template v-else>
        <div class="min-w-0 flex-1">
          <p class="text-sm text-muted-foreground/60">{{ emptyLabel }}</p>
          <div
            class="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-sky-100 dark:bg-sky-900/30"
          />
        </div>
      </template>
    </div>
  </div>
</template>
