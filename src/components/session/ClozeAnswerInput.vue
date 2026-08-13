<script setup lang="ts">
import { computed } from 'vue'
import { clozeSegments } from '@/lib/attemptResponse'
import { useT } from '@/composables/useT'

const t = useT()

/**
 * Fill-in-the-blanks input: the cloze text rendered with an inline input per
 * `{{n}}` placeholder. `blankIndices` (the server's graded blank list) is the
 * source of truth — an index it carries that the text lacks still renders as
 * a labeled row below, so every graded blank stays answerable.
 */
const props = defineProps<{
  text: string
  blankIndices: number[]
  /** One value per blank index. */
  modelValue: Record<number, string>
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Record<number, string>]
}>()

const segments = computed(() => clozeSegments(props.text))

/** Graded blanks with no placeholder in the text (authoring drift guard). */
const detachedIndices = computed(() => {
  const inText = new Set(
    segments.value.filter((s) => s.kind === 'blank').map((s) => (s.kind === 'blank' ? s.index : 0)),
  )
  return props.blankIndices.filter((index) => !inText.has(index))
})

function setValue(index: number, value: string) {
  emit('update:modelValue', { ...props.modelValue, [index]: value })
}
</script>

<template>
  <div class="space-y-3">
    <p class="text-lg leading-loose">
      <template v-for="(segment, i) in segments" :key="i">
        <span v-if="segment.kind === 'text'" class="whitespace-pre-wrap">{{ segment.text }}</span>
        <input
          v-else
          :value="modelValue[segment.index] ?? ''"
          :disabled="disabled"
          :aria-label="t.shared.clozeAnswerInput.blankLabel(segment.index)"
          type="text"
          class="mx-1 inline-block w-32 rounded-md border border-input bg-transparent px-2 py-1 text-center text-base shadow-xs transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
          @input="setValue(segment.index, ($event.target as HTMLInputElement).value)"
        />
      </template>
    </p>

    <div
      v-for="index in detachedIndices"
      :key="`detached-${index}`"
      class="flex items-center gap-2"
    >
      <span class="text-sm text-muted-foreground">
        {{ t.shared.clozeAnswerInput.blankLabel(index) }}
      </span>
      <input
        :value="modelValue[index] ?? ''"
        :disabled="disabled"
        :aria-label="t.shared.clozeAnswerInput.blankLabel(index)"
        type="text"
        class="w-40 rounded-md border border-input bg-transparent px-2 py-1 text-base shadow-xs transition-colors focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
        @input="setValue(index, ($event.target as HTMLInputElement).value)"
      />
    </div>
  </div>
</template>
