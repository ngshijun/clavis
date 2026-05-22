<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useT } from '@/composables/useT'
import { useBadgesStore } from '@/stores/badges'
import { Loader2 } from 'lucide-vue-next'
import BadgeGridByTier from '@/components/student/BadgeGridByTier.vue'

const t = useT()
const badgesStore = useBadgesStore()

const totalBadges = computed(() => badgesStore.catalog.length)
const unlockedCount = computed(() => badgesStore.unlocked.length)

onMounted(async () => {
  if (!badgesStore.hasLoaded) {
    await badgesStore.loadAll()
  } else {
    await badgesStore.refreshProgress()
  }
  // Per-badge dismissal: seen state flips when the student opens each
  // badge's detail dialog (see BadgeGridByTier.openDetail).
})
</script>

<template>
  <div class="space-y-6 p-6">
    <div v-if="badgesStore.isLoading" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <template v-else>
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold">{{ t.student.achievements.title }}</h1>
          <p class="text-muted-foreground">{{ t.student.achievements.subtitle }}</p>
        </div>
        <div class="text-right">
          <p class="text-2xl font-bold">{{ unlockedCount }} / {{ totalBadges }}</p>
          <p class="text-sm text-muted-foreground">{{ t.student.achievements.badgesEarned }}</p>
        </div>
      </div>

      <BadgeGridByTier />
    </template>
  </div>
</template>
