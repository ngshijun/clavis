<script setup lang="ts" generic="T extends QuestionCardItem">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import { ImagePlus, Library, Plus } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import AssessmentQuestionCard from '@/components/staff/AssessmentQuestionCard.vue'
import { useT } from '@/composables/useT'
import { moveItem, refocusReorderHandle } from '@/lib/reorder'
import type { AdhocPayload, QuestionCardItem } from '@/lib/adhocPayload'

/**
 * The Google-Forms-style question composer: a vertical stack of
 * `AssessmentQuestionCard`s (one expanded at a time) with a floating action
 * toolbar anchored beside the active card. Reordering is vue-draggable-plus
 * via the card's top grip, with the parent owning persistence (debounced +
 * non-blocking, decision 72b) — this component only emits intents and never
 * locks dragging; `editable` reflects edit permission, not save state.
 *
 * Generic over the item: an assessment's own questions and a template's bank
 * questions render through the same list, each parent keeping its own type.
 */
const props = defineProps<{
  items: T[]
  editable: boolean
  /**
   * Storage folder for a card's image uploads (the bucket RLS reads the first
   * segment): `{assessmentId}` for an assessment, `bank/{id}` for a bank row.
   */
  imageFolderOf: (item: T) => string
  /** Offer the admin question bank — a template's composer only. */
  showQuestionBank?: boolean
  /** Bank questions carry no explanation; a template's list hides the field. */
  showExplanation?: boolean
}>()

const showQuestionBank = computed(() => props.showQuestionBank === true)

const emit = defineEmits<{
  reorder: [orderedIds: string[]]
  'payload-change': [item: T, payload: AdhocPayload]
  'points-change': [item: T, points: number]
  /** A replaced/removed image object awaiting confirmed-save deletion (decision 78). */
  'image-orphaned': [item: T, path: string]
  duplicate: [item: T]
  remove: [item: T]
  'add-question': []
  'add-from-question-bank': []
}>()

defineSlots<{
  /** Card footer extras (difficulty, tags, filing) beside the points input. */
  meta?: (props: { item: T }) => unknown
}>()

const t = useT()

/** One card expanded at a time — v-model so the page can expand a fresh add. */
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

// ── keyboard reorder (decision 77) ─────────────────────────
// Arrow keys on a card's grip emit the SAME `reorder` event a drop does, so
// the page's apply/persist + autosave path covers both input methods. The
// An upward move relocates the moved node itself and Chrome blurs it, so the
// grip is explicitly re-focused after the patch (refocusReorderHandle).

/** Screen-reader announcement for the latest keyboard move. */
const reorderAnnouncement = ref('')

function moveCard(index: number, delta: -1 | 1) {
  const moving = props.items[index]
  const next = moveItem(props.items, index, delta)
  if (!next || !moving) return
  emit(
    'reorder',
    next.map((item) => item.id),
  )
  reorderAnnouncement.value = t.value.shared.reorder.movedTo(index + 1 + delta, props.items.length)
  void refocusReorderHandle(moving.id)
}

// ── floating toolbar anchoring ─────────────────────────────

const containerEl = ref<HTMLElement | null>(null)
type CardInstance = InstanceType<typeof AssessmentQuestionCard>
const cardRefs = new Map<string, CardInstance>()

function setCardRef(id: string, instance: unknown) {
  if (instance) cardRefs.set(id, instance as CardInstance)
  else cardRefs.delete(id)
}

const toolbarTop = ref(0)

function updateToolbarTop() {
  const activeId = expandedId.value
  const active = activeId ? cardRefs.get(activeId) : undefined
  const el = (active?.$el ?? null) as HTMLElement | null
  if (!el || !containerEl.value) {
    toolbarTop.value = 0
    return
  }
  const max = Math.max(0, containerEl.value.offsetHeight - 40)
  toolbarTop.value = Math.min(el.offsetTop, max)
}

// The active card's position shifts as cards expand/collapse, type editors
// change height, or the list reorders — observe the container instead of
// chasing every cause.
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

/** The expanded card, if any — the "add image" target. */
const activeCard = computed(() => {
  const activeId = expandedId.value
  if (!activeId) return null
  return props.items.find((candidate) => candidate.id === activeId) ?? null
})

function addImageToActiveCard() {
  const activeId = expandedId.value
  if (activeId) cardRefs.get(activeId)?.openImagePicker()
}
</script>

<template>
  <div ref="containerEl" class="relative" :class="editable ? 'lg:pr-14' : ''">
    <!-- Announces keyboard moves to screen readers -->
    <p class="sr-only" role="status">{{ reorderAnnouncement }}</p>
    <VueDraggable
      v-model="list"
      handle="[data-card-drag-handle]"
      ghost-class="opacity-50"
      :animation="150"
      :disabled="!editable"
      class="space-y-3"
    >
      <AssessmentQuestionCard
        v-for="(item, index) in items"
        :key="item.id"
        :ref="(instance) => setCardRef(item.id, instance)"
        :item="item"
        :index="index"
        :expanded="expandedId === item.id"
        :editable="editable"
        :image-folder="imageFolderOf(item)"
        :show-explanation="showExplanation"
        @select="expandedId = item.id"
        @payload-change="(payload) => emit('payload-change', item, payload)"
        @points-change="(points) => emit('points-change', item, points)"
        @image-orphaned="(path) => emit('image-orphaned', item, path)"
        @move="(delta) => moveCard(index, delta)"
        @duplicate="emit('duplicate', item)"
        @remove="emit('remove', item)"
      >
        <template v-if="$slots.meta" #meta>
          <slot name="meta" :item="item" />
        </template>
      </AssessmentQuestionCard>
    </VueDraggable>

    <!-- Floating action toolbar — moves with the active card (Forms model) -->
    <div
      v-if="editable"
      class="absolute right-0 hidden w-11 flex-col items-center gap-1 rounded-lg border bg-card p-1 shadow-sm transition-[top] duration-200 lg:flex"
      :style="{ top: `${toolbarTop}px` }"
    >
      <Button
        variant="ghost"
        size="icon"
        class="size-8"
        :aria-label="t.staff.builder.addAdhoc"
        :title="t.staff.builder.addAdhoc"
        @click="emit('add-question')"
      >
        <Plus class="size-4" />
      </Button>
      <Button
        v-if="showQuestionBank"
        variant="ghost"
        size="icon"
        class="size-8"
        :aria-label="t.staff.builder.addFromQuestionBank"
        :title="t.staff.builder.addFromQuestionBank"
        @click="emit('add-from-question-bank')"
      >
        <Library class="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        class="size-8"
        :disabled="!activeCard"
        :aria-label="t.staff.adhocForm.addImage"
        :title="t.staff.adhocForm.addImage"
        @click="addImageToActiveCard"
      >
        <ImagePlus class="size-4" />
      </Button>
    </div>

    <!-- Small screens: the same actions as a static bar under the list -->
    <div v-if="editable" class="mt-3 flex items-center gap-2 lg:hidden">
      <Button variant="outline" size="sm" @click="emit('add-question')">
        <Plus class="mr-2 size-4" />
        {{ t.staff.builder.addAdhoc }}
      </Button>
      <Button
        v-if="showQuestionBank"
        variant="outline"
        size="sm"
        @click="emit('add-from-question-bank')"
      >
        <Library class="mr-2 size-4" />
        {{ t.staff.builder.addFromQuestionBank }}
      </Button>
    </div>
  </div>
</template>
