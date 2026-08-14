<script setup lang="ts">
import type { RunnerItem } from '@/stores/student-assessments'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useT } from '@/composables/useT'

const t = useT()

/**
 * Matching input: one Select per left item over the right items. `right`
 * arrives pre-scrambled per attempt from the server — rendered as served,
 * never re-shuffled (resume must look identical). Right items may be reused
 * across prompts (many-to-one) and may include distractors, so every Select
 * always lists all of them.
 */
defineProps<{
  left: RunnerItem[]
  right: RunnerItem[]
  /** Selection keyed by left id; null = not matched yet. */
  modelValue: Record<string, string | null>
  disabled?: boolean
}>()

const emit = defineEmits<{
  select: [leftId: string, rightId: string]
}>()
</script>

<template>
  <div class="space-y-2">
    <p class="text-sm text-muted-foreground">{{ t.shared.matchingAnswerInput.hint }}</p>
    <div
      v-for="item in left"
      :key="item.id"
      class="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
      :class="{ 'border-primary/50 bg-primary/5': modelValue[item.id] }"
    >
      <span class="min-w-0 text-base">{{ item.text }}</span>
      <Select
        :model-value="modelValue[item.id] ?? ''"
        :disabled="disabled"
        @update:model-value="(value) => value && emit('select', item.id, value as string)"
      >
        <SelectTrigger class="w-full sm:w-56">
          <SelectValue :placeholder="t.shared.matchingAnswerInput.placeholder" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="target in right" :key="target.id" :value="target.id">
            {{ target.text }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  </div>
</template>
