<script setup lang="ts" generic="T extends { id: string; name: string }">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import {
  ChevronRight,
  ChevronUp,
  GripVertical,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Field, FieldLabel } from '@/components/ui/field'
import { useT } from '@/composables/useT'

/**
 * One level of the curriculum hierarchy as a Google-Forms-style card list
 * (all four levels render through this component). Each row is: drag grip ·
 * order chip · optional cover thumbnail · name + description · edit · drill.
 * Clicking a row drills DOWN the hierarchy; the pencil expands the row IN
 * PLACE into the editor (name + cover image) — no dialogs. The parent owns
 * persistence (background autosave, decision 72b): this component only emits
 * intents and never blocks dragging or editing.
 */
const props = defineProps<{
  items: T[]
  /** Rows with a cover image show the thumbnail + image controls when expanded. */
  hasImage?: boolean
  getCoverImageUrl?: (item: T) => string | null
  getDescription: (item: T) => string
  /** Row id whose cover image upload is currently in flight (spinner). */
  uploadingImageId?: string | null
  /** Optional heading above the list (the level-4 learning-path explainer). */
  listTitle?: string
  listDescription?: string
  emptyTitle: string
  emptyDescription: string
  addLabel: string
}>()

const emit = defineEmits<{
  select: [item: T]
  reorder: [orderedIds: string[]]
  /** A non-empty, changed name typed in the expanded editor (autosaved by the parent). */
  rename: [item: T, name: string]
  'image-selected': [item: T, file: File]
  'image-removed': [item: T]
  delete: [item: T]
  add: []
}>()

const t = useT()

/** One row expanded at a time — owned by the page so navigation can collapse it. */
const expandedId = defineModel<string | null>('expandedId', { default: null })

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

// ── expanded editor state (single editor — one row expanded at a time) ─────

const nameDraft = ref('')
let suppressNameEmit = false

const expandedItem = (): T | null =>
  props.items.find((item) => item.id === expandedId.value) ?? null

watch(
  expandedId,
  (id) => {
    if (!id) return
    const item = props.items.find((candidate) => candidate.id === id)
    if (!item) return
    suppressNameEmit = true
    nameDraft.value = item.name
    void nextTick(() => {
      suppressNameEmit = false
    })
  },
  { immediate: true },
)

const nameIsBlank = ref(false)

watch(nameDraft, (value) => {
  if (suppressNameEmit) return
  const item = expandedItem()
  if (!item) return
  const trimmed = value.trim()
  nameIsBlank.value = trimmed.length === 0
  if (!trimmed || trimmed === item.name) return
  emit('rename', item, trimmed)
})

function toggleExpand(item: T) {
  nameIsBlank.value = false
  expandedId.value = expandedId.value === item.id ? null : item.id
}

// ── cover image picking (one hidden input, acts on the expanded row) ───────

const imageInput = ref<HTMLInputElement | null>(null)

function onImagePicked(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  const item = expandedItem()
  if (file && item) emit('image-selected', item, file)
  input.value = ''
}

// ── floating toolbar anchoring (P10b pattern) ──────────────────────────────

const containerEl = ref<HTMLElement | null>(null)
const rowEls = new Map<string, HTMLElement>()

function setRowRef(id: string, el: unknown) {
  if (el) rowEls.set(id, el as HTMLElement)
  else rowEls.delete(id)
}

const toolbarTop = ref(0)

function updateToolbarTop() {
  const activeId = expandedId.value
  const el = activeId ? (rowEls.get(activeId) ?? null) : null
  if (!el || !containerEl.value) {
    toolbarTop.value = 0
    return
  }
  const max = Math.max(0, containerEl.value.offsetHeight - 40)
  toolbarTop.value = Math.min(el.offsetTop, max)
}

let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  resizeObserver = new ResizeObserver(() => updateToolbarTop())
  if (containerEl.value) resizeObserver.observe(containerEl.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})

watch([expandedId, () => props.items], () => void nextTick(updateToolbarTop), {
  deep: false,
  immediate: true,
})
</script>

<template>
  <div v-if="items.length > 0">
    <div v-if="listTitle" class="mb-3">
      <h2 class="text-sm font-semibold">{{ listTitle }}</h2>
      <p v-if="listDescription" class="text-sm text-muted-foreground">{{ listDescription }}</p>
    </div>

    <input ref="imageInput" type="file" accept="image/*" class="hidden" @change="onImagePicked" />

    <div ref="containerEl" class="relative lg:pr-14">
      <VueDraggable
        v-model="list"
        tag="ol"
        handle="[data-drag-handle]"
        ghost-class="opacity-50"
        :animation="150"
        class="space-y-3"
      >
        <li
          v-for="(item, index) in items"
          :key="item.id"
          :ref="(el) => setRowRef(item.id, el)"
          class="rounded-lg border bg-card transition-shadow"
          :class="
            expandedId === item.id
              ? 'border-l-4 border-l-primary shadow-md'
              : 'hover:border-primary/40'
          "
        >
          <!-- Collapsed row: click drills down; the pencil expands in place -->
          <div
            v-if="expandedId !== item.id"
            class="group flex cursor-pointer items-center gap-3 p-3"
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
              v-if="hasImage && getCoverImageUrl?.(item)"
              :src="getCoverImageUrl?.(item) ?? ''"
              :alt="item.name"
              class="hidden size-12 shrink-0 rounded-md object-cover sm:block"
            />

            <div class="min-w-0 flex-1">
              <p class="truncate font-medium">{{ item.name }}</p>
              <p class="text-sm text-muted-foreground">{{ getDescription(item) }}</p>
            </div>

            <div class="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                class="size-8"
                :aria-label="t.admin.curriculum.edit"
                @click.stop="toggleExpand(item)"
              >
                <Pencil class="size-4" />
              </Button>
              <ChevronRight class="size-4 shrink-0 text-muted-foreground" />
            </div>
          </div>

          <!-- Expanded in-place editor: name + cover image, background autosave -->
          <div v-else class="space-y-4 p-4">
            <div class="flex items-start justify-between gap-3">
              <div class="flex items-center gap-3">
                <GripVertical
                  data-drag-handle
                  class="size-5 shrink-0 cursor-grab text-muted-foreground"
                  :aria-label="t.admin.curriculum.dragToReorder"
                />
                <span
                  class="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
                >
                  {{ index + 1 }}
                </span>
              </div>
              <Button
                variant="ghost"
                size="icon"
                class="size-8"
                :aria-label="t.admin.curriculum.collapseEditor"
                @click="toggleExpand(item)"
              >
                <ChevronUp class="size-4" />
              </Button>
            </div>

            <Field>
              <FieldLabel :for="`curriculum-name-${item.id}`">
                {{ t.admin.curriculum.nameLabel }} <span class="text-destructive">*</span>
              </FieldLabel>
              <Input :id="`curriculum-name-${item.id}`" v-model="nameDraft" />
            </Field>

            <!-- A blank name is simply not saved yet — no blocking dialog -->
            <p v-if="nameIsBlank" class="text-sm text-destructive" role="alert">
              {{ t.admin.curriculum.notSavedName }}
            </p>

            <Field v-if="hasImage">
              <FieldLabel>{{ t.admin.curriculum.coverImageLabel }}</FieldLabel>
              <div v-if="getCoverImageUrl?.(item)" class="flex items-start gap-2">
                <img
                  :src="getCoverImageUrl?.(item) ?? ''"
                  :alt="item.name"
                  class="max-h-40 rounded-md border object-cover"
                />
                <div class="flex flex-col gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    :disabled="uploadingImageId === item.id"
                    @click="imageInput?.click()"
                  >
                    <Loader2 v-if="uploadingImageId === item.id" class="mr-2 size-4 animate-spin" />
                    <ImagePlus v-else class="mr-2 size-4" />
                    {{ t.admin.curriculum.replaceImage }}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    class="text-destructive hover:text-destructive"
                    :disabled="uploadingImageId === item.id"
                    @click="emit('image-removed', item)"
                  >
                    <X class="mr-2 size-4" />
                    {{ t.admin.curriculum.removeImage }}
                  </Button>
                </div>
              </div>
              <Button
                v-else
                variant="outline"
                size="sm"
                class="w-fit"
                :disabled="uploadingImageId === item.id"
                @click="imageInput?.click()"
              >
                <Loader2 v-if="uploadingImageId === item.id" class="mr-2 size-4 animate-spin" />
                <ImagePlus v-else class="mr-2 size-4" />
                {{ t.admin.curriculum.addImage }}
              </Button>
            </Field>

            <Separator />

            <!-- Card footer: open · delete -->
            <div class="flex items-center justify-end gap-1">
              <Button variant="ghost" size="sm" @click="emit('select', item)">
                {{ t.admin.curriculum.open }}
                <ChevronRight class="ml-1 size-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                class="size-8 text-destructive hover:text-destructive"
                :aria-label="t.shared.actions.delete"
                @click="emit('delete', item)"
              >
                <Trash2 class="size-4" />
              </Button>
            </div>
          </div>
        </li>
      </VueDraggable>

      <!-- Floating action toolbar — moves with the active card (Forms model) -->
      <div
        class="absolute right-0 hidden w-11 flex-col items-center gap-1 rounded-lg border bg-card p-1 shadow-sm transition-[top] duration-200 lg:flex"
        :style="{ top: `${toolbarTop}px` }"
      >
        <Button
          variant="ghost"
          size="icon"
          class="size-8"
          :aria-label="addLabel"
          :title="addLabel"
          @click="emit('add')"
        >
          <Plus class="size-4" />
        </Button>
      </div>
    </div>

    <!-- Small screens: the same action as a static bar under the list -->
    <div class="mt-3 lg:hidden">
      <Button variant="outline" size="sm" @click="emit('add')">
        <Plus class="mr-2 size-4" />
        {{ addLabel }}
      </Button>
    </div>
  </div>

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
</template>
