<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import type { RunnerItem } from '@/stores/student-assessments'
import { GripVertical } from 'lucide-vue-next'
import { moveItem, refocusReorderHandle } from '@/lib/reorder'
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

// ── keyboard reorder (decision 77) ─────────────────────────
// Arrow keys on the focused handle emit the SAME `change` a drop does. An
// upward move relocates the moved node itself and Chrome blurs it, so the
// handle is explicitly re-focused after the patch (refocusReorderHandle).

/** Screen-reader announcement for the latest keyboard move. */
const reorderAnnouncement = ref('')

function moveRow(index: number, delta: -1 | 1) {
  if (props.disabled) return
  const moving = rows.value[index]
  const next = moveItem(rows.value, index, delta)
  if (!next || !moving) return
  rows.value = next
  void refocusReorderHandle(moving.id)
  emit(
    'change',
    next.map((row) => row.id),
  )
  reorderAnnouncement.value = t.value.shared.reorder.movedTo(index + 1 + delta, rows.value.length)
}
</script>

<template>
  <div class="space-y-2">
    <p class="text-sm text-muted-foreground">{{ t.shared.orderingAnswerInput.hint }}</p>
    <!-- Announces keyboard moves to screen readers -->
    <p class="sr-only" role="status">{{ reorderAnnouncement }}</p>
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
        <button
          type="button"
          data-drag-handle
          :data-reorder-id="row.id"
          class="shrink-0 cursor-grab rounded text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          :disabled="disabled"
          :aria-label="`${row.text} — ${t.shared.reorder.handleLabel}`"
          @keydown.up.prevent="moveRow(index, -1)"
          @keydown.down.prevent="moveRow(index, 1)"
        >
          <GripVertical class="size-4" />
        </button>
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
