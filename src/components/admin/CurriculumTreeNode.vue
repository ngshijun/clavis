<script lang="ts">
import type { CurriculumLevel } from '@/lib/curriculumEntityConfig'

/**
 * One node of the global curriculum tree. `children` is null for a leaf
 * (a topic — its stages and sub-topics are managed on the bank pages).
 */
export interface CurriculumTreeItem {
  id: string
  name: string
  level: CurriculumLevel
  coverImagePath: string | null
  /** Right-hand summary, e.g. "3 topics". */
  description: string
  children: CurriculumTreeItem[] | null
  /** Level a child of this node would be, and the label of the button that adds one. */
  childLevel: CurriculumLevel | null
  addChildLabel: string | null
}
</script>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import {
  ChevronDown,
  ChevronRight,
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
import { Field, FieldLabel } from '@/components/ui/field'
import { useT } from '@/composables/useT'
import { moveItem, refocusReorderHandle } from '@/lib/reorder'

/**
 * The curriculum tree, rendered recursively: grade level → subject → topic,
 * all visible at once (P19b). Reaching a topic is one disclosure click per
 * level instead of a page of navigation per level, and the whole trunk is
 * editable in place — the pencil turns a row into a name + cover-image
 * editor, the grip reorders siblings, and each expanded node ends with an
 * "add child" row.
 *
 * The component owns nothing: it emits intents (rename / reorder / add /
 * delete / image) and reads expansion from the parent, so the page keeps
 * being the single place that persists (background autosave).
 */
const props = defineProps<{
  nodes: CurriculumTreeItem[]
  /** Parent of `nodes` — '' at the root (the grade levels). */
  parentId: string
  /** 0-based depth, for indentation only. */
  depth: number
  isExpanded: (id: string) => boolean
  getCoverImageUrl: (path: string) => string
  /** Row id whose cover image upload is in flight. */
  uploadingImageId: string | null
}>()

const emit = defineEmits<{
  toggle: [id: string]
  rename: [level: CurriculumLevel, id: string, name: string]
  reorder: [level: CurriculumLevel, parentId: string, orderedIds: string[]]
  add: [level: CurriculumLevel, parentId: string]
  delete: [level: CurriculumLevel, id: string, name: string]
  'image-selected': [level: CurriculumLevel, id: string, file: File]
  'image-removed': [level: CurriculumLevel, id: string]
}>()

const t = useT()

/** The row currently open as an editor (one per sibling list). */
const editingId = ref<string | null>(null)
const nameDraft = ref('')
const nameIsBlank = ref(false)
let suppressNameEmit = false

function startEditing(node: CurriculumTreeItem) {
  if (editingId.value === node.id) {
    editingId.value = null
    return
  }
  suppressNameEmit = true
  editingId.value = node.id
  nameDraft.value = node.name
  nameIsBlank.value = false
  void nextTick(() => {
    suppressNameEmit = false
  })
}

watch(nameDraft, (value) => {
  if (suppressNameEmit) return
  const node = props.nodes.find((candidate) => candidate.id === editingId.value)
  if (!node) return
  const trimmed = value.trim()
  nameIsBlank.value = trimmed.length === 0
  if (!trimmed || trimmed === node.name) return
  emit('rename', node.level, node.id, trimmed)
})

const list = {
  get: () => props.nodes,
  set: (value: CurriculumTreeItem[]) => {
    const level = props.nodes[0]?.level
    if (!level) return
    emit(
      'reorder',
      level,
      props.parentId,
      value.map((node) => node.id),
    )
  },
}

/** Keyboard reorder (decision 77) — same emit a drop makes. */
function moveRow(index: number, delta: -1 | 1) {
  const moving = props.nodes[index]
  const next = moveItem(props.nodes, index, delta)
  if (!moving || !next) return
  emit(
    'reorder',
    moving.level,
    props.parentId,
    next.map((node) => node.id),
  )
  void refocusReorderHandle(moving.id)
}

// One hidden file input per sibling list; it acts on the open editor row.
const imageInput = ref<HTMLInputElement | null>(null)

function onImagePicked(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  const node = props.nodes.find((candidate) => candidate.id === editingId.value)
  if (file && node) emit('image-selected', node.level, node.id, file)
  input.value = ''
}
</script>

<template>
  <input ref="imageInput" type="file" accept="image/*" class="hidden" @change="onImagePicked" />

  <VueDraggable
    :model-value="list.get()"
    tag="ul"
    handle="[data-drag-handle]"
    ghost-class="opacity-50"
    :animation="150"
    class="space-y-1"
    @update:model-value="list.set"
  >
    <li v-for="(node, index) in nodes" :key="node.id">
      <div
        class="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60"
        :class="editingId === node.id ? 'bg-muted/60' : ''"
        :style="{ paddingLeft: `${depth * 20 + 8}px` }"
      >
        <button
          type="button"
          data-drag-handle
          :data-reorder-id="node.id"
          class="shrink-0 cursor-grab rounded text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
          :aria-label="`${node.name} — ${t.shared.reorder.handleLabel}`"
          @keydown.up.prevent="moveRow(index, -1)"
          @keydown.down.prevent="moveRow(index, 1)"
        >
          <GripVertical class="size-4" />
        </button>

        <!-- Disclosure. A leaf keeps the same slot empty so names stay aligned. -->
        <button
          v-if="node.children"
          type="button"
          class="shrink-0 rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          :aria-expanded="isExpanded(node.id)"
          :aria-label="node.name"
          @click="emit('toggle', node.id)"
        >
          <ChevronDown v-if="isExpanded(node.id)" class="size-4" />
          <ChevronRight v-else class="size-4" />
        </button>
        <span v-else class="size-4 shrink-0" />

        <img
          v-if="node.coverImagePath"
          :src="getCoverImageUrl(node.coverImagePath)"
          :alt="node.name"
          class="hidden size-7 shrink-0 rounded object-cover sm:block"
        />

        <button
          type="button"
          class="min-w-0 flex-1 truncate text-left text-sm font-medium"
          @click="node.children ? emit('toggle', node.id) : startEditing(node)"
        >
          {{ node.name }}
        </button>

        <span class="shrink-0 text-xs text-muted-foreground">{{ node.description }}</span>

        <Button
          variant="ghost"
          size="icon"
          class="size-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          :aria-label="t.admin.curriculum.edit"
          @click="startEditing(node)"
        >
          <Pencil class="size-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          class="size-7 shrink-0 text-destructive opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
          :aria-label="t.shared.actions.delete"
          @click="emit('delete', node.level, node.id, node.name)"
        >
          <Trash2 class="size-3.5" />
        </Button>
      </div>

      <!-- In-place editor: name + cover image, saved in the background -->
      <div
        v-if="editingId === node.id"
        class="mb-2 space-y-3 rounded-md border bg-card p-3"
        :style="{ marginLeft: `${depth * 20 + 32}px` }"
      >
        <Field>
          <FieldLabel :for="`curriculum-name-${node.id}`">
            {{ t.admin.curriculum.nameLabel }} <span class="text-destructive">*</span>
          </FieldLabel>
          <Input :id="`curriculum-name-${node.id}`" v-model="nameDraft" />
        </Field>

        <p v-if="nameIsBlank" class="text-sm text-destructive" role="alert">
          {{ t.admin.curriculum.notSavedName }}
        </p>

        <Field v-if="node.level !== 'grade'">
          <FieldLabel>{{ t.admin.curriculum.coverImageLabel }}</FieldLabel>
          <div v-if="node.coverImagePath" class="flex items-start gap-2">
            <img
              :src="getCoverImageUrl(node.coverImagePath)"
              :alt="node.name"
              class="max-h-28 rounded-md border object-cover"
            />
            <div class="flex flex-col gap-1">
              <Button
                variant="outline"
                size="sm"
                :disabled="uploadingImageId === node.id"
                @click="imageInput?.click()"
              >
                <Loader2 v-if="uploadingImageId === node.id" class="mr-2 size-4 animate-spin" />
                <ImagePlus v-else class="mr-2 size-4" />
                {{ t.admin.curriculum.replaceImage }}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                class="text-destructive hover:text-destructive"
                :disabled="uploadingImageId === node.id"
                @click="emit('image-removed', node.level, node.id)"
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
            :disabled="uploadingImageId === node.id"
            @click="imageInput?.click()"
          >
            <Loader2 v-if="uploadingImageId === node.id" class="mr-2 size-4 animate-spin" />
            <ImagePlus v-else class="mr-2 size-4" />
            {{ t.admin.curriculum.addImage }}
          </Button>
        </Field>
      </div>

      <!-- Children, plus the row that appends one -->
      <template v-if="node.children && isExpanded(node.id)">
        <CurriculumTreeNode
          v-if="node.children.length > 0"
          :nodes="node.children"
          :parent-id="node.id"
          :depth="depth + 1"
          :is-expanded="isExpanded"
          :get-cover-image-url="getCoverImageUrl"
          :uploading-image-id="uploadingImageId"
          @toggle="(id) => emit('toggle', id)"
          @rename="(level, id, name) => emit('rename', level, id, name)"
          @reorder="(level, parent, ids) => emit('reorder', level, parent, ids)"
          @add="(level, parent) => emit('add', level, parent)"
          @delete="(level, id, name) => emit('delete', level, id, name)"
          @image-selected="(level, id, file) => emit('image-selected', level, id, file)"
          @image-removed="(level, id) => emit('image-removed', level, id)"
        />
        <div
          v-if="node.addChildLabel && node.childLevel"
          :style="{ paddingLeft: `${(depth + 1) * 20 + 32}px` }"
        >
          <Button
            variant="ghost"
            size="sm"
            class="text-muted-foreground"
            @click="emit('add', node.childLevel, node.id)"
          >
            <Plus class="mr-2 size-4" />
            {{ node.addChildLabel }}
          </Button>
        </div>
      </template>
    </li>
  </VueDraggable>
</template>
