<script setup lang="ts">
import { computed } from 'vue'
import { useT } from '@/composables/useT'
import { tierConfig } from '@/stores/badges'
import { Pencil, Plus } from 'lucide-vue-next'
import { cn } from '@/lib/utils'
import { getBadgeIconUrl } from '@/lib/storage'
import type { Database } from '@/types/database.types'

type BadgeTier = Database['public']['Enums']['badge_tier']

// Minimal shape needed for rendering — accepts both full Badge rows
// (useBadgesStore) and the lighter FeaturedBadgeData from the RPC response.
export interface FeaturedBadge {
  id: string
  slug: string
  tier: BadgeTier
  icon_path: string
}

const props = defineProps<{
  badges: FeaturedBadge[]
  editable?: boolean
  showLabel?: boolean
}>()

defineEmits<{
  edit: []
  selectBadge: [badge: FeaturedBadge]
}>()

const t = useT()

const slots = computed(() => {
  const arr: (FeaturedBadge | null)[] = [null, null, null]
  props.badges.slice(0, 3).forEach((b, i) => {
    arr[i] = b
  })
  return arr
})

function getStrings(slug: string) {
  const badges = t.value.student.badges as Record<
    string,
    { name: string; description: string } | undefined
  >
  return badges[slug] ?? { name: slug, description: '' }
}
</script>

<template>
  <div class="space-y-2">
    <div v-if="showLabel !== false" class="flex items-center justify-between">
      <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {{ t.student.profile.featuredBadgesLabel }}
      </p>
      <button
        v-if="editable"
        type="button"
        class="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        @click="$emit('edit')"
      >
        <Pencil class="size-3" />
        {{ t.student.profile.featuredBadgesEdit }}
      </button>
    </div>

    <div class="flex items-center justify-center gap-4">
      <template v-for="(badge, i) in slots" :key="i">
        <!-- Filled slot -->
        <button
          v-if="badge"
          type="button"
          :aria-label="getStrings(badge.slug).name"
          :title="getStrings(badge.slug).name"
          :class="
            cn(
              'size-20 shrink-0 overflow-hidden rounded-full border-2 transition-all',
              tierConfig[badge.tier].bgColor,
              tierConfig[badge.tier].borderColor,
              editable ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md' : 'cursor-default',
            )
          "
          :disabled="!editable"
          @click="editable && $emit('selectBadge', badge)"
        >
          <img
            :src="getBadgeIconUrl(badge.icon_path)"
            :alt="getStrings(badge.slug).name"
            loading="lazy"
            class="size-full select-none object-cover text-transparent"
          />
        </button>

        <!-- Empty slot -->
        <button
          v-else
          type="button"
          :disabled="!editable"
          :class="
            cn(
              'flex size-20 shrink-0 items-center justify-center rounded-full border-2 border-dashed transition-colors',
              editable
                ? 'cursor-pointer border-muted-foreground/30 text-muted-foreground hover:border-primary hover:text-primary'
                : 'cursor-default border-muted-foreground/20 text-muted-foreground/50',
            )
          "
          @click="editable && $emit('edit')"
        >
          <Plus class="size-5" />
        </button>
      </template>
    </div>
  </div>
</template>
