<script setup lang="ts" generic="T extends QuestionCardItem">
import { ref, computed } from 'vue'
import { VueDraggable } from 'vue-draggable-plus'
import { Library, Plus } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import AssessmentQuestionCard from '@/components/staff/AssessmentQuestionCard.vue'
import { useT } from '@/composables/useT'
import { moveItem, refocusReorderHandle } from '@/lib/reorder'
import type { AdhocPayload, QuestionCardItem } from '@/lib/adhocPayload'

/**
 * The question composer as a master-detail split: the ordered list of
 * question rows on the left, the editor for the selected question on the
 * right. Reordering is vue-draggable-plus via a row's grip, with the parent
 * owning persistence (debounced + non-blocking, decision 72b) — this
 * component only emits intents and never locks dragging; `editable` reflects
 * edit permission, not save state.
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

/** The question open in the editor pane — v-model so the page can open a fresh add. */
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
// Arrow keys on a row's grip emit the SAME `reorder` event a drop does, so
// the page's apply/persist + autosave path covers both input methods. An
// upward move relocates the moved node itself and Chrome blurs it, so the
// grip is explicitly re-focused after the patch (refocusReorderHandle).

/** Screen-reader announcement for the latest keyboard move. */
const reorderAnnouncement = ref('')

function moveRow(index: number, delta: -1 | 1) {
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

// ── editor pane ────────────────────────────────────────────

const activeIndex = computed(() => {
  const activeId = expandedId.value
  return activeId ? props.items.findIndex((candidate) => candidate.id === activeId) : -1
})

const activeItem = computed(() =>
  activeIndex.value === -1 ? null : props.items[activeIndex.value]!,
)
</script>

<template>
  <div class="grid gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
    <!-- Announces keyboard moves to screen readers -->
    <p class="sr-only" role="status">{{ reorderAnnouncement }}</p>

    <!-- Left: the ordered list. Sticky on wide screens and scrolls on its own,
         so the editor can grow past the viewport while the list stays put. -->
    <div class="space-y-3 lg:sticky lg:top-6 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
      <div v-if="editable" class="flex flex-wrap items-center gap-2">
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

      <VueDraggable
        v-model="list"
        handle="[data-card-drag-handle]"
        ghost-class="opacity-50"
        :animation="150"
        :disabled="!editable"
        class="space-y-2"
      >
        <AssessmentQuestionCard
          v-for="(item, index) in items"
          :key="item.id"
          :item="item"
          :index="index"
          :expanded="false"
          :selected="expandedId === item.id"
          :editable="editable"
          :image-folder="imageFolderOf(item)"
          @select="expandedId = item.id"
          @move="(delta) => moveRow(index, delta)"
        />
      </VueDraggable>
    </div>

    <!-- Right: the editor for the selected question -->
    <div class="min-w-0">
      <template v-if="activeItem">
        <p class="mb-2 text-sm font-medium text-muted-foreground">
          {{ t.staff.builder.questionNumber(activeIndex + 1) }}
        </p>
        <AssessmentQuestionCard
          :key="activeItem.id"
          :item="activeItem"
          :index="activeIndex"
          expanded
          :editable="editable"
          :image-folder="imageFolderOf(activeItem)"
          :show-explanation="showExplanation"
          :reorderable="false"
          @payload-change="(payload) => emit('payload-change', activeItem!, payload)"
          @points-change="(points) => emit('points-change', activeItem!, points)"
          @image-orphaned="(path) => emit('image-orphaned', activeItem!, path)"
          @duplicate="emit('duplicate', activeItem!)"
          @remove="emit('remove', activeItem!)"
        >
          <template v-if="$slots.meta" #meta>
            <slot name="meta" :item="activeItem" />
          </template>
        </AssessmentQuestionCard>
      </template>
      <div
        v-else
        class="rounded-lg border border-dashed p-12 text-center text-sm text-muted-foreground"
      >
        {{ t.staff.builder.selectQuestionHint }}
      </div>
    </div>
  </div>
</template>
