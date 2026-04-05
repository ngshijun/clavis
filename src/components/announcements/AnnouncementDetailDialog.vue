<script setup lang="ts">
import { watch } from 'vue'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Pin } from 'lucide-vue-next'
import type { Announcement } from '@/stores/announcements'
import { audienceConfig, useAnnouncementsStore } from '@/stores/announcements'
import { useAuthStore } from '@/stores/auth'
import { formatLongDateTime, formatLongDate } from '@/lib/date'

const props = defineProps<{
  announcement: Announcement | null
}>()

const open = defineModel<boolean>('open', { default: false })

const announcementsStore = useAnnouncementsStore()
const authStore = useAuthStore()

// Mark as read when dialog opens
watch(
  () => open.value,
  async (isOpen) => {
    if (
      isOpen &&
      props.announcement &&
      !props.announcement.isRead &&
      authStore.userType !== 'admin'
    ) {
      await announcementsStore.markAsRead(props.announcement.id)
    }
  },
)
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
      <DialogHeader>
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-center gap-2">
            <Pin v-if="announcement?.isPinned" class="size-4 shrink-0 text-primary" />
            <DialogTitle class="text-xl">{{ announcement?.title }}</DialogTitle>
          </div>
          <Badge
            v-if="announcement"
            variant="outline"
            :class="audienceConfig[announcement.targetAudience].color"
            class="shrink-0"
          >
            {{ audienceConfig[announcement.targetAudience].label }}
          </Badge>
        </div>
        <p v-if="announcement" class="text-sm text-muted-foreground">
          {{ formatLongDateTime(announcement.createdAt) }}
        </p>
      </DialogHeader>

      <div v-if="announcement" class="space-y-4 py-4">
        <!-- Image -->
        <img
          v-if="announcement.imagePath"
          :src="announcementsStore.getOptimizedImageUrl(announcement.imagePath)"
          alt="Announcement image"
          class="w-full rounded-lg object-contain"
        />

        <!-- Content -->
        <div class="prose prose-sm max-w-none dark:prose-invert">
          <p class="whitespace-pre-wrap">{{ announcement.content }}</p>
        </div>

        <!-- Expiry info -->
        <div v-if="announcement.expiresAt" class="text-sm text-muted-foreground">
          <span v-if="new Date(announcement.expiresAt) > new Date()">
            Expires on {{ formatLongDate(announcement.expiresAt) }}
          </span>
          <span v-else class="text-destructive">
            Expired on {{ formatLongDate(announcement.expiresAt) }}
          </span>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
