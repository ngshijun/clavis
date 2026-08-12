<script setup lang="ts" generic="T extends { id: string; name: string }">
import { ref } from 'vue'
import { ChevronDown, ChevronUp, Plus, Trash2, ImagePlus, Pencil } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useT } from '@/composables/useT'

/**
 * One level of the curriculum cascade (grade levels, subjects, topics).
 *
 * Cards are reorderable via native HTML5 drag-and-drop (the same pattern as
 * SubTopicPathList), with move up/down buttons as the keyboard and touch path.
 * The parent owns persistence — this component only emits the new id order.
 */
const props = defineProps<{
  items: T[]
  clickable?: boolean
  hasImage?: boolean
  isSaving?: boolean
  getCoverImageUrl?: (item: T) => string | null
  getDescription: (item: T) => string
  emptyTitle: string
  emptyDescription: string
  addLabel: string
}>()

const emit = defineEmits<{
  select: [item: T]
  reorder: [orderedIds: string[]]
  'edit-name': [item: T]
  'edit-image': [item: T]
  delete: [item: T]
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
    <div
      class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
      :class="isSaving && 'pointer-events-none opacity-60'"
    >
      <Card
        v-for="(item, index) in items"
        :key="item.id"
        :draggable="!isSaving"
        class="group relative transition-shadow hover:shadow-lg"
        :class="[
          clickable && 'cursor-pointer',
          hasImage && 'flex h-full flex-col overflow-hidden',
          dragIndex === index && 'opacity-50',
          overIndex === index && dragIndex !== index && 'border-primary bg-accent',
        ]"
        @click="clickable && emit('select', item)"
        @dragstart="onDragStart(index, $event)"
        @dragover="onDragOver(index, $event)"
        @dragend="resetDrag"
        @drop.prevent="onDrop(index)"
      >
        <div
          v-if="hasImage && getCoverImageUrl?.(item)"
          class="aspect-video w-full overflow-hidden"
        >
          <img
            :src="getCoverImageUrl?.(item) ?? ''"
            :alt="item.name"
            class="size-full object-cover transition-transform group-hover:scale-105"
          />
        </div>
        <!-- 1-based display order badge -->
        <span
          class="absolute left-2 top-2 flex size-7 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary backdrop-blur-sm"
          :aria-label="t.admin.curriculum.dragToReorder"
        >
          {{ index + 1 }}
        </span>
        <CardContent :class="hasImage ? 'mt-auto px-4 pb-4 pt-2' : 'p-4'">
          <h3 class="text-lg font-semibold">{{ item.name }}</h3>
          <p class="text-sm text-muted-foreground">{{ getDescription(item) }}</p>
        </CardContent>
        <div
          class="absolute right-2 top-2 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100"
        >
          <Button
            variant="secondary"
            size="icon"
            class="size-8"
            :disabled="index === 0"
            :aria-label="t.admin.curriculum.moveUp"
            @click.stop="move(index, -1)"
          >
            <ChevronUp class="size-4" />
          </Button>
          <Button
            variant="secondary"
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
            @click.stop="emit('edit-name', item)"
          >
            <Pencil class="size-4" />
          </Button>
          <Button
            v-if="hasImage"
            variant="secondary"
            size="icon"
            class="size-8"
            @click.stop="emit('edit-image', item)"
          >
            <ImagePlus class="size-4" />
          </Button>
          <Button
            variant="destructive"
            size="icon"
            class="size-8"
            @click.stop="emit('delete', item)"
          >
            <Trash2 class="size-4" />
          </Button>
        </div>
      </Card>
    </div>

    <div v-if="items.length === 0" class="rounded-lg border border-dashed p-12 text-center">
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
