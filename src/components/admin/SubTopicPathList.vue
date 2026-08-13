<script setup lang="ts">
import { computed } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import {
  ChevronRight,
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
 * learning map (`sub_topics.display_order`). Reordering is vue-draggable-plus
 * (SortableJS) via the grip handle, with built-in touch support.
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

/**
 * VueDraggable writes the post-drop order here; the getter keeps rendering
 * from props so the parent (via the store's optimistic apply) stays the
 * single source of truth for the list.
 */
const list = computed({
  get: () => props.items,
  set: (value: SubTopic[]) =>
    emit(
      'reorder',
      value.map((item) => item.id),
    ),
})
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

      <VueDraggable
        v-model="list"
        tag="ol"
        handle="[data-drag-handle]"
        ghost-class="opacity-50"
        :animation="150"
        :disabled="isSaving"
        class="space-y-2"
        :class="isSaving && 'pointer-events-none opacity-60'"
      >
        <li
          v-for="(item, index) in items"
          :key="item.id"
          class="group flex cursor-pointer items-center gap-3 rounded-lg border bg-card p-3 transition-colors hover:bg-accent/50"
          @click="emit('select', item)"
        >
          <GripVertical
            data-drag-handle
            class="size-5 shrink-0 cursor-grab text-muted-foreground"
            :aria-label="t.admin.curriculum.dragToReorder"
            @click.stop
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
      </VueDraggable>
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
