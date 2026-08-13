<script setup lang="ts">
import { Input } from '@/components/ui/input'
import { useT } from '@/composables/useT'

const t = useT()

/**
 * Numeric answer input. Plain decimal text — the server grader parses and
 * tolerance-checks it, so no client validation beyond the decimal inputmode.
 * The unit (if the question carries one) renders as a suffix.
 */
defineProps<{
  modelValue: string
  unit: string | null
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  submit: []
}>()
</script>

<template>
  <div class="flex items-center gap-2">
    <Input
      :model-value="modelValue"
      :placeholder="t.shared.numericAnswerInput.placeholder"
      :disabled="disabled"
      inputmode="decimal"
      class="max-w-xs text-lg"
      @update:model-value="emit('update:modelValue', $event as string)"
      @keyup.enter="!disabled && emit('submit')"
    />
    <span v-if="unit" class="text-lg text-muted-foreground">{{ unit }}</span>
  </div>
</template>
