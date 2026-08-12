<script setup lang="ts">
import { ref } from 'vue'
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  GripVertical,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { useT } from '@/composables/useT'
import type { SubTopic } from '@/stores/curriculum'

/**
 * The admin learning-path builder.
 *
 * Renders a topic's sub-topics as the ordered path students walk on their
 * learning map (`sub_topics.display_order`). Reordering is native HTML5
 * drag-and-drop, with move up/down buttons as the keyboard and touch path.
 * Clicking a row opens that sub-topic's question management (decision 42).
 * The parent owns persistence — this component only emits the new id order.
 */
const props = defineProps<{
  items: SubTopic[]
  getCoverImageUrl: (item: SubTopic) => string | null
  isSaving: boolean
  emptyTitle: string
  emptyDescription: string
  addLabel: string
}>()

const emit = defineEmits<{
  select: [item: SubTopic]
  reorder: [orderedIds: string[]]
  'edit-name': [item: SubTopic]
  'edit-image': [item: SubTopic]
  delete: [item: SubTopic]
  add: []
}>()

const t = useT()

const dragIndex = ref<number | null>(null)
const overIndex = ref<number | null>(null)

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
</script>

<template>
  <div>
    <template v-if="items.length > 0">
      <div class="mb-3 flex items-center justify-between gap-4">
        <div>
          <h2 class="text-sm font-semibold">{{ t.admin.curriculum.pathOrderTitle }}</h2>
          <p class="text-sm text-muted-foreground">{{ t.admin.curriculum.pathOrderDesc }}</p>
        </div>
        <p
          v-if="isSaving"
          class="flex shrink-0 items-center gap-2 text-sm text-muted-foreground"
          role="status"
        >
          <Loader2 class="size-4 animate-spin" />
          {{ t.admin.curriculum.pathOrderSaving }}
        </p>
      </div>

      <ol class="space-y-2" :class="isSaving && 'pointer-events-none opacity-60'">
        <li
          v-for="(item, index) in items"
          :key="item.id"
          :draggable="!isSaving"
          class="group flex cursor-pointer items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-accent/50"
          :class="[
            dragIndex === index && 'opacity-50',
            overIndex === index && dragIndex !== index && 'border-primary bg-accent',
          ]"
          @click="emit('select', item)"
          @dragstart="onDragStart(index, $event)"
          @dragover="onDragOver(index, $event)"
          @dragend="resetDrag"
          @drop.prevent="onDrop(index)"
        >
          <GripVertical
            class="size-5 shrink-0 cursor-grab text-muted-foreground"
            :aria-label="t.admin.curriculum.dragToReorder"
          />

          <span
            class="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
          >
            {{ index + 1 }}
          </span>

          <img
            v-if="getCoverImageUrl(item)"
            :src="getCoverImageUrl(item) ?? ''"
            :alt="item.name"
            class="hidden size-12 shrink-0 rounded-md object-cover sm:block"
          />

          <div class="min-w-0 flex-1">
            <p class="truncate font-medium">{{ item.name }}</p>
            <p class="text-sm text-muted-foreground">
              {{ t.admin.curriculum.questionCount(item.questionCount) }}
            </p>
          </div>

          <div class="flex shrink-0 items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              class="size-8"
              :disabled="index === 0"
              :aria-label="t.admin.curriculum.moveUp"
              @click.stop="move(index, -1)"
            >
              <ChevronUp class="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              class="size-8"
              :disabled="index === items.length - 1"
              :aria-label="t.admin.curriculum.moveDown"
              @click.stop="move(index, 1)"
            >
              <ChevronDown class="size-4" />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              class="size-8"
              :aria-label="t.admin.curriculum.editName"
              @click.stop="emit('edit-name', item)"
            >
              <Pencil class="size-4" />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              class="size-8"
              :aria-label="t.admin.curriculum.editImage"
              @click.stop="emit('edit-image', item)"
            >
              <ImagePlus class="size-4" />
            </Button>
            <Button
              variant="destructive"
              size="icon"
              class="size-8"
              :aria-label="t.shared.actions.delete"
              @click.stop="emit('delete', item)"
            >
              <Trash2 class="size-4" />
            </Button>
            <ChevronRight class="size-4 shrink-0 text-muted-foreground" />
          </div>
        </li>
      </ol>
    </template>

    <div v-else class="rounded-lg border border-dashed p-12 text-center">
      <div class="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
        <Plus class="size-6 text-muted-foreground" />
      </div>
      <h3 class="mt-4 text-lg font-medium">{{ emptyTitle }}</h3>
      <p class="mt-2 text-sm text-muted-foreground">{{ emptyDescription }}</p>
      <Button class="mt-4" @click="emit('add')">
        <Plus class="mr-2 size-4" />
        {{ addLabel }}
      </Button>
    </div>
  </div>
</template>
