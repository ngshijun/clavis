<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import type { RunnerItem } from '@/stores/student-assessments'
import { GripVertical } from 'lucide-vue-next'
import { useT } from '@/composables/useT'

const t = useT()

/**
 * Ordering input: drag the items into sequence (P9c drag pattern — stable id
 * keys, grip handle, position chips). Items arrive pre-scrambled per attempt;
 * the parent owns the current id order and persists it on each drop.
 */
const props = defineProps<{
  items: RunnerItem[]
  /** Current arrangement as item ids, position 1 first. */
  modelValue: string[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  change: [ids: string[]]
}>()

const textById = computed(() => new Map(props.items.map((item) => [item.id, item.text])))

/** Local rows for VueDraggable, rebuilt whenever the parent order changes. */
const rows = ref<RunnerItem[]>([])
watch(
  () => [props.modelValue, props.items] as const,
  ([ids]) => {
    rows.value = ids.map((id) => ({ id, text: textById.value.get(id) ?? '' }))
  },
  { immediate: true, deep: true },
)
</script>

<template>
  <div class="space-y-2">
    <p class="text-sm text-muted-foreground">{{ t.shared.orderingAnswerInput.hint }}</p>
    <VueDraggable
      v-model="rows"
      handle="[data-drag-handle]"
      ghost-class="opacity-50"
      :animation="150"
      :disabled="disabled"
      class="space-y-2"
      @end="
        emit(
          'change',
          rows.map((row) => row.id),
        )
      "
    >
      <div
        v-for="(row, index) in rows"
        :key="row.id"
        class="flex items-center gap-3 rounded-lg border bg-background p-3"
      >
        <GripVertical
          data-drag-handle
          class="size-4 shrink-0 cursor-grab text-muted-foreground"
          :aria-label="t.shared.orderingAnswerInput.dragHandleLabel"
        />
        <span
          class="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
        >
          {{ index + 1 }}
        </span>
        <span class="min-w-0 text-base">{{ row.text }}</span>
      </div>
    </VueDraggable>
  </div>
</template>
