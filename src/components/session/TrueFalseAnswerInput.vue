<script setup lang="ts">
import { useT } from '@/composables/useT'

const t = useT()

/**
 * True/false choice for the assessment runner. Neutral like every runner
 * input — feedback is deferred, so selection styling never hints correctness.
 */
defineProps<{
  modelValue: boolean | null
  disabled?: boolean
}>()

const emit = defineEmits<{
  select: [value: boolean]
}>()
</script>

<template>
  <div class="grid grid-cols-2 gap-3">
    <button
      v-for="value in [true, false]"
      :key="String(value)"
      class="rounded-lg border p-4 text-center text-lg font-medium transition-colors"
      :class="{
        'border-primary bg-primary/5': modelValue === value,
        'hover:border-primary/50 hover:bg-muted/50': !disabled && modelValue !== value,
        'cursor-not-allowed': disabled,
      }"
      :disabled="disabled"
      @click="emit('select', value)"
    >
      {{ value ? t.shared.answerBool.trueLabel : t.shared.answerBool.falseLabel }}
    </button>
  </div>
</template>
