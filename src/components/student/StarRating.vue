<script setup lang="ts">
import { computed } from 'vue'
import { Star } from 'lucide-vue-next'

/**
 * The 3-star rating used across the learning map (nodes, node dialog,
 * session results). Decorative only — callers provide the accessible text.
 */
const props = withDefaults(
  defineProps<{
    stars: number
    size?: 'sm' | 'md' | 'lg'
    /** Arch the stars (raised middle, tilted sides) — the map-node look. */
    arc?: boolean
  }>(),
  {
    size: 'sm',
    arc: true,
  },
)

const sideClass = computed(() => ({ sm: 'size-4', md: 'size-6', lg: 'size-8' })[props.size])
const middleClass = computed(() => ({ sm: 'size-5', md: 'size-7', lg: 'size-10' })[props.size])

function starClass(position: number): string {
  return position <= props.stars
    ? 'fill-yellow-400 text-yellow-500 drop-shadow-sm'
    : 'fill-muted text-muted-foreground/30'
}
</script>

<template>
  <div class="flex items-end" :class="arc ? 'gap-0' : 'gap-0.5'" aria-hidden="true">
    <Star :class="[sideClass, starClass(1), arc ? '-rotate-12 translate-y-px' : '']" />
    <Star :class="[middleClass, starClass(2), arc ? '-translate-y-0.5' : '']" />
    <Star :class="[sideClass, starClass(3), arc ? 'rotate-12 translate-y-px' : '']" />
  </div>
</template>
