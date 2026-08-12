<script setup lang="ts">
import { Input } from '@/components/ui/input'
import { useT } from '@/composables/useT'

const t = useT()

/**
 * Free-text answer input. Feedback is deferred to the results screen
 * (decision 40) — this component never shows correctness or the answer key.
 */
defineProps<{
  modelValue: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  submit: []
}>()
</script>

<template>
  <Input
    :model-value="modelValue"
    :placeholder="t.shared.shortAnswerInput.placeholder"
    :disabled="disabled"
    class="text-lg"
    @update:model-value="emit('update:modelValue', $event as string)"
    @keyup.enter="!disabled && emit('submit')"
  />
</template>
