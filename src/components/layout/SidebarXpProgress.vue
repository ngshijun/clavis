<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { Progress } from '@/components/ui/progress'
import { SidebarGroup, SidebarGroupContent } from '@/components/ui/sidebar'

const authStore = useAuthStore()

const level = computed(() => authStore.currentLevel)
const currentXp = computed(() => authStore.currentLevelXp)
const xpNeeded = computed(() => authStore.xpToNextLevel)
const progress = computed(() => authStore.xpProgress)
</script>

<template>
  <SidebarGroup data-tour="sidebar-xp">
    <SidebarGroupContent>
      <div class="px-2 py-3">
        <!-- Level Progress -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <span class="text-sm font-medium">Level {{ level }}</span>
            <span class="text-xs text-muted-foreground">{{ currentXp }} / {{ xpNeeded }} XP</span>
          </div>
          <Progress :model-value="progress" class="h-2" />
        </div>
      </div>
    </SidebarGroupContent>
  </SidebarGroup>
</template>
