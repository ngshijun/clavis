<script setup lang="ts" generic="T extends { id: string; name: string }">
import { computed } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import { Plus, Trash2, ImagePlus, Pencil } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useT } from '@/composables/useT'

/**
 * One level of the curriculum cascade (grade levels, subjects, topics).
 *
 * Cards are reorderable via vue-draggable-plus (SortableJS) — drag anywhere
 * on a card; a touch-only hold delay keeps page scrolling working on touch.
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

/**
 * VueDraggable writes the post-drop order here; the getter keeps rendering
 * from props so the parent (via the store's optimistic apply) stays the
 * single source of truth for the list.
 */
const list = computed({
  get: () => props.items,
  set: (value: T[]) =>
    emit(
      'reorder',
      value.map((item) => item.id),
    ),
})
</script>

<template>
  <div>
    <VueDraggable
      v-model="list"
      ghost-class="opacity-50"
      :animation="150"
      :delay="150"
      :delay-on-touch-only="true"
      :disabled="isSaving"
      class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
      :class="isSaving && 'pointer-events-none opacity-60'"
    >
      <Card
        v-for="(item, index) in items"
        :key="item.id"
        class="group relative transition-shadow hover:shadow-lg"
        :class="[clickable && 'cursor-pointer', hasImage && 'flex h-full flex-col overflow-hidden']"
        @click="clickable && emit('select', item)"
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
    </VueDraggable>

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
