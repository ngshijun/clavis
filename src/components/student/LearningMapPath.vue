<script setup lang="ts">
import { computed } from 'vue'
import { Check } from 'lucide-vue-next'
import type { LearningMapNode } from '@/lib/learningMap'
import StarRating from './StarRating.vue'
import { useT } from '@/composables/useT'

/**
 * The learning map: sub-topics of one topic rendered as stops along a
 * winding path, in `display_order`. Presentational — every node is always
 * tappable (no gating); tapping emits `select` with the sub-topic id.
 */
const props = defineProps<{
  nodes: LearningMapNode[]
  /** The "continue here" hint node — a highlight, never a lock. */
  recommendedId: string | null
}>()

const emit = defineEmits<{
  select: [subTopicId: string]
}>()

const t = useT()

// Path geometry. The SVG trail is drawn in a fixed 400-unit-wide space and
// stretched to the container (preserveAspectRatio="none"); node buttons are
// positioned with the same percentages, so trail and nodes stay aligned at
// any width. Vertical distances are real pixels (y scale is always 1).
const SVG_WIDTH = 400
const ROW_HEIGHT = 122
const PAD_TOP = 48
const PAD_BOTTOM = 56
const CIRCLE = 64
/** Serpentine x positions (percent of container width), cycling per row. */
const X_PERCENTS = [50, 80, 50, 20] as const

function xPercent(index: number): number {
  return X_PERCENTS[index % X_PERCENTS.length]!
}

function centerY(index: number): number {
  return PAD_TOP + CIRCLE / 2 + index * ROW_HEIGHT
}

const totalHeight = computed(
  () => PAD_TOP + CIRCLE + (props.nodes.length - 1) * ROW_HEIGHT + PAD_BOTTOM,
)

/** Smooth cubic-bezier trail through every node center. */
const trailPath = computed(() => {
  const points = props.nodes.map((_, i) => ({
    x: (xPercent(i) / 100) * SVG_WIDTH,
    y: centerY(i),
  }))
  const first = points[0]
  if (!first) return ''

  let d = `M ${first.x} ${first.y}`
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!
    const curr = points[i]!
    const midY = (prev.y + curr.y) / 2
    d += ` C ${prev.x} ${midY}, ${curr.x} ${midY}, ${curr.x} ${curr.y}`
  }
  return d
})

const circleStateClasses: Record<LearningMapNode['state'], string> = {
  'not-started': 'border-border bg-card text-muted-foreground',
  'in-progress': 'border-primary/70 bg-card text-primary',
  completed: 'border-primary bg-primary text-primary-foreground shadow-md',
}
</script>

<template>
  <div class="relative mx-auto w-full max-w-md" :style="{ height: `${totalHeight}px` }">
    <!-- Dotted trail connecting the stops -->
    <svg
      class="absolute inset-0 size-full"
      :viewBox="`0 0 ${SVG_WIDTH} ${totalHeight}`"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        :d="trailPath"
        fill="none"
        class="stroke-border"
        stroke-width="5"
        stroke-linecap="round"
        stroke-dasharray="0.1 16"
        vector-effect="non-scaling-stroke"
      />
    </svg>

    <!-- Stops -->
    <button
      v-for="(node, index) in nodes"
      :key="node.id"
      type="button"
      class="group absolute flex w-28 -translate-x-1/2 flex-col items-center focus-visible:outline-none"
      :style="{ left: `${xPercent(index)}%`, top: `${centerY(index) - CIRCLE / 2}px` }"
      :aria-label="t.student.learningMap.nodeAria(node.name, node.stars)"
      @click="emit('select', node.id)"
    >
      <!-- "Continue here" hint -->
      <span
        v-if="node.id === recommendedId"
        class="absolute -top-9 z-10 animate-bounce-slow whitespace-nowrap rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-semibold text-primary-foreground shadow-md"
      >
        {{ t.student.learningMap.continueHere }}
      </span>

      <!-- Stars appear once the stop has been attempted -->
      <StarRating
        v-if="node.state !== 'not-started'"
        :stars="node.stars"
        size="sm"
        class="absolute -top-3.5 z-10"
      />

      <!-- Node circle -->
      <span
        class="flex size-16 items-center justify-center rounded-full border-4 shadow-sm transition-transform duration-150 group-hover:scale-110 group-focus-visible:ring-4 group-focus-visible:ring-ring/50 group-active:scale-95"
        :class="[
          circleStateClasses[node.state],
          node.id === recommendedId ? 'ring-4 ring-primary/25' : '',
        ]"
      >
        <Check v-if="node.state === 'completed'" class="size-7" stroke-width="3" />
        <span v-else class="text-lg font-bold">{{ index + 1 }}</span>
      </span>

      <!-- Sub-topic name -->
      <span
        class="mt-1.5 line-clamp-2 max-w-full break-words text-center text-xs font-medium leading-tight text-foreground/80"
      >
        {{ node.name }}
      </span>
    </button>
  </div>
</template>
