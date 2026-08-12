<script setup lang="ts">
import { ref, computed } from 'vue'
import { ChevronDown, ChevronUp, GripVertical, Loader2, Pencil, Trash2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { useT } from '@/composables/useT'
import type { AssessmentQuestionItem } from '@/stores/assessments'

/**
 * The assessment question composer list. Reordering is native HTML5
 * drag-and-drop with move up/down buttons as the keyboard and touch path
 * (same pattern as the admin SubTopicPathList). The parent owns persistence —
 * this component only emits intents.
 */
const props = defineProps<{
  items: AssessmentQuestionItem[]
  isSaving: boolean
  disabled: boolean
}>()

const emit = defineEmits<{
  reorder: [orderedIds: string[]]
  edit: [item: AssessmentQuestionItem]
  remove: [item: AssessmentQuestionItem]
  'update-points': [item: AssessmentQuestionItem, points: number]
}>()

const t = useT()

const dragIndex = ref<number | null>(null)
const overIndex = ref<number | null>(null)

const interactive = computed(() => !props.disabled && !props.isSaving)

function resetDrag() {
  dragIndex.value = null
  overIndex.value = null
}

function emitMove(from: number, to: number) {
  const ids = props.items.map((item) => item.id)
  const [moved] = ids.splice(from, 1)
  if (moved === undefined) return
  ids.splice(to, 0, moved)
  emit('reorder', ids)
}

function onDragStart(index: number, event: DragEvent) {
  if (!interactive.value) return
  dragIndex.value = index
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    // Firefox requires payload on the transfer for the drag to start at all.
    event.dataTransfer.setData('text/plain', props.items[index]?.id ?? '')
  }
}

function onDragOver(index: number, event: DragEvent) {
  if (dragIndex.value === null) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
  overIndex.value = index
}

function onDrop(index: number) {
  const from = dragIndex.value
  resetDrag()
  if (from === null || from === index) return
  emitMove(from, index)
}

function move(index: number, delta: number) {
  const target = index + delta
  if (target < 0 || target >= props.items.length) return
  emitMove(index, target)
}

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
    <div
      v-if="isSaving"
      class="mb-3 flex items-center gap-2 text-sm text-muted-foreground"
      role="status"
    >
      <Loader2 class="size-4 animate-spin" />
      {{ t.staff.builder.savingOrder }}
    </div>

    <ol class="space-y-2" :class="isSaving && 'pointer-events-none opacity-60'">
      <li
        v-for="(item, index) in items"
        :key="item.id"
        :draggable="interactive"
        class="group flex items-center gap-3 rounded-lg border bg-card p-3 transition-colors"
        :class="[
          dragIndex === index && 'opacity-50',
          overIndex === index && dragIndex !== index && 'border-primary bg-accent',
        ]"
        @dragstart="onDragStart(index, $event)"
        @dragover="onDragOver(index, $event)"
        @dragend="resetDrag"
        @drop.prevent="onDrop(index)"
      >
        <GripVertical
          v-if="!disabled"
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
            variant="ghost"
            size="icon"
            class="size-8"
            :disabled="index === 0 || !interactive"
            :aria-label="t.staff.builder.moveUp"
            @click="move(index, -1)"
          >
            <ChevronUp class="size-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="size-8"
            :disabled="index === items.length - 1 || !interactive"
            :aria-label="t.staff.builder.moveDown"
            @click="move(index, 1)"
          >
            <ChevronDown class="size-4" />
          </Button>
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
    </ol>
  </div>
</template>
