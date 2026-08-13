<script setup lang="ts">
import { computed } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import { GripVertical, Pencil, Trash2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useT } from '@/composables/useT'
import type { AssessmentQuestionItem } from '@/stores/assessments'

/**
 * The assessment question composer list. Reordering is vue-draggable-plus
 * (SortableJS) via the grip handle, with built-in touch support (same pattern
 * as the admin SubTopicPathList). The parent owns persistence (debounced +
 * non-blocking, decision 72b) — this component only emits intents and never
 * locks dragging; `disabled` reflects edit permission, not save state.
 */
const props = defineProps<{
  items: AssessmentQuestionItem[]
  disabled: boolean
}>()

const emit = defineEmits<{
  reorder: [orderedIds: string[]]
  edit: [item: AssessmentQuestionItem]
  remove: [item: AssessmentQuestionItem]
  'update-points': [item: AssessmentQuestionItem, points: number]
}>()

const t = useT()

const interactive = computed(() => !props.disabled)

/**
 * VueDraggable writes the post-drop order here; the getter keeps rendering
 * from props so the parent (via the store's optimistic apply) stays the
 * single source of truth for the list.
 */
const list = computed({
  get: () => props.items,
  set: (value: AssessmentQuestionItem[]) =>
    emit(
      'reorder',
      value.map((item) => item.id),
    ),
})

function typeLabel(item: AssessmentQuestionItem): string {
  if (item.type === 'mcq') return t.value.shared.questionBankTable.typeMultipleChoice
  if (item.type === 'mrq') return t.value.shared.questionBankTable.typeMultipleResponse
  return t.value.shared.questionBankTable.typeShortAnswer
}

function onPointsChange(item: AssessmentQuestionItem, event: Event) {
  const input = event.target as HTMLInputElement
  const points = Number.parseInt(input.value, 10)
  if (!Number.isInteger(points) || points < 1) {
    input.value = String(item.points)
    return
  }
  if (points !== item.points) emit('update-points', item, points)
}
</script>

<template>
  <div>
    <VueDraggable
      v-model="list"
      tag="ol"
      handle="[data-drag-handle]"
      ghost-class="opacity-50"
      :animation="150"
      :disabled="!interactive"
      class="space-y-2"
    >
      <li
        v-for="(item, index) in items"
        :key="item.id"
        class="group flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors"
      >
        <GripVertical
          v-if="!disabled"
          data-drag-handle
          class="size-5 shrink-0 cursor-grab text-muted-foreground"
          :aria-label="t.staff.builder.dragToReorder"
        />

        <span
          class="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
        >
          {{ index + 1 }}
        </span>

        <div class="min-w-0 flex-1">
          <p class="truncate font-medium" :title="item.question">{{ item.question }}</p>
          <div class="mt-1 flex items-center gap-2">
            <Badge variant="secondary">{{ typeLabel(item) }}</Badge>
            <Badge variant="outline">
              {{ item.source === 'bank' ? t.staff.builder.bankBadge : t.staff.builder.adhocBadge }}
            </Badge>
          </div>
        </div>

        <label class="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
          <span class="hidden sm:inline">{{ t.staff.builder.pointsLabel }}</span>
          <Input
            type="number"
            min="1"
            step="1"
            class="w-16"
            :model-value="item.points"
            :disabled="!interactive"
            @change="onPointsChange(item, $event)"
          />
        </label>

        <div v-if="!disabled" class="flex shrink-0 items-center gap-1">
          <Button
            v-if="item.source === 'adhoc'"
            variant="secondary"
            size="icon"
            class="size-8"
            :disabled="!interactive"
            :aria-label="t.staff.builder.editQuestion"
            @click="emit('edit', item)"
          >
            <Pencil class="size-4" />
          </Button>
          <Button
            variant="destructive"
            size="icon"
            class="size-8"
            :disabled="!interactive"
            :aria-label="t.staff.builder.removeQuestion"
            @click="emit('remove', item)"
          >
            <Trash2 class="size-4" />
          </Button>
        </div>
      </li>
    </VueDraggable>
  </div>
</template>
