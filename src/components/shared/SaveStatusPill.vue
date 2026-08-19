<script setup lang="ts">
import { Check, Loader2 } from 'lucide-vue-next'
import { useT } from '@/composables/useT'
import type { SaveStatus } from '@/composables/useAutosave'

/**
 * Google-style inline save affordance for autosaving surfaces (reorder,
 * inline question editing): "Saving…" while a (debounced or in-flight) save
 * exists, "Saved" briefly after it settles, then fades out. Driven by
 * `useAutosave().status`.
 */
defineProps<{ status: SaveStatus }>()

const t = useT()
</script>

<template>
  <Transition
    enter-active-class="transition-opacity duration-150"
    enter-from-class="opacity-0"
    leave-active-class="transition-opacity duration-500"
    leave-to-class="opacity-0"
  >
    <span
      v-if="status !== 'idle'"
      class="inline-flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground"
      role="status"
    >
      <Loader2 v-if="status === 'saving'" class="size-3.5 animate-spin" />
      <Check v-else class="size-3.5" />
      {{ status === 'saving' ? t.shared.orderStatus.saving : t.shared.orderStatus.saved }}
    </span>
  </Transition>
</template>
