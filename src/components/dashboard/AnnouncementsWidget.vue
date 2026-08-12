<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Megaphone, ChevronRight, Pin } from 'lucide-vue-next'
import { useAnnouncementsStore, getAudienceConfig, type Announcement } from '@/stores/announcements'
import { formatTimeAgoCompact } from '@/lib/date'
import AnnouncementDetailDialog from '@/components/announcements/AnnouncementDetailDialog.vue'
import { useT } from '@/composables/useT'

const t = useT()

const router = useRouter()
const announcementsStore = useAnnouncementsStore()

const showDetailDialog = ref(false)
const selectedAnnouncement = ref<Announcement | null>(null)

function openAnnouncement(announcement: Announcement) {
  selectedAnnouncement.value = announcement
  showDetailDialog.value = true
}

function goToAnnouncementsPage() {
  router.push('/student/announcements')
}
</script>

<template>
  <Card>
    <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle class="text-sm font-medium">{{ t.shared.announcementsWidget.title }}</CardTitle>
      <Megaphone class="size-4 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      <div v-if="announcementsStore.unreadAnnouncements.length === 0" class="py-4 text-center">
        <p class="text-sm text-muted-foreground">{{ t.shared.announcementsWidget.noUnread }}</p>
      </div>

      <div v-else class="space-y-3">
        <!-- Unread announcements (up to 3) -->
        <div
          v-for="announcement in announcementsStore.unreadAnnouncements.slice(0, 3)"
          :key="announcement.id"
          class="cursor-pointer rounded-lg border p-3 transition-colors hover:bg-muted/50"
          @click="openAnnouncement(announcement)"
        >
          <div class="flex items-start gap-2">
            <div class="min-w-0 flex-1">
              <p class="flex items-center gap-1.5 truncate text-sm font-medium">
                <Pin v-if="announcement.isPinned" class="size-3 shrink-0 text-primary" />
                {{ announcement.title }}
              </p>
              <div class="mt-1 flex items-center gap-2">
                <Badge
                  variant="outline"
                  class="text-xs"
                  :class="getAudienceConfig()[announcement.targetAudience].color"
                >
                  {{ getAudienceConfig()[announcement.targetAudience].label }}
                </Badge>
                <span class="text-xs text-muted-foreground">
                  {{ formatTimeAgoCompact(announcement.createdAt, t.shared.timeAgoCompact) }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- View All button -->
        <Button variant="ghost" size="sm" class="w-full" @click="goToAnnouncementsPage">
          {{ t.shared.announcementsWidget.viewAll }}
          <ChevronRight class="ml-1 size-4" />
        </Button>
      </div>
    </CardContent>
  </Card>

  <!-- Detail Dialog -->
  <AnnouncementDetailDialog v-model:open="showDetailDialog" :announcement="selectedAnnouncement" />
</template>
