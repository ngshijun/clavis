<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { Button } from '@/components/ui/button'
import { Loader2, CheckCheck } from 'lucide-vue-next'
import { useAnnouncementsStore, type Announcement } from '@/stores/announcements'
import AnnouncementCard from '@/components/announcements/AnnouncementCard.vue'
import AnnouncementDetailDialog from '@/components/announcements/AnnouncementDetailDialog.vue'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination'
import { toast } from 'vue-sonner'
import { useT } from '@/composables/useT'

const t = useT()
const announcementsStore = useAnnouncementsStore()

const showDetailDialog = ref(false)
const selectedAnnouncement = ref<Announcement | null>(null)
const isMarkingAllRead = ref(false)

// Pagination state (from store for persistence)
const currentPage = computed({
  get: () => announcementsStore.announcementsPagination.pageIndex + 1, // Convert 0-indexed to 1-indexed
  set: (val) => announcementsStore.setAnnouncementsPageIndex(val - 1),
})
const itemsPerPage = computed(() => announcementsStore.announcementsPagination.pageSize)

const totalPages = computed(() =>
  Math.ceil(announcementsStore.announcements.length / itemsPerPage.value),
)

const paginatedAnnouncements = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage.value
  const end = start + itemsPerPage.value
  return announcementsStore.announcements.slice(start, end)
})

onMounted(async () => {
  if (announcementsStore.announcements.length === 0) {
    await announcementsStore.fetchAnnouncements()
  }
})

function openAnnouncement(announcement: Announcement) {
  selectedAnnouncement.value = announcement
  showDetailDialog.value = true
}

async function handleMarkAllAsRead() {
  if (announcementsStore.unreadCount === 0) return

  isMarkingAllRead.value = true
  try {
    const { error } = await announcementsStore.markAllAsRead()
    if (error) {
      toast.error(t.value.shared.pages.announcements.toastMarkAllReadFailed(error))
    } else {
      toast.success(t.value.shared.pages.announcements.toastMarkedAllRead)
    }
  } finally {
    isMarkingAllRead.value = false
  }
}
</script>

<template>
  <div class="p-6">
    <div class="mb-6 flex items-center justify-end">
      <Button
        v-if="announcementsStore.unreadCount > 0"
        variant="outline"
        :disabled="isMarkingAllRead"
        @click="handleMarkAllAsRead"
      >
        <Loader2 v-if="isMarkingAllRead" class="mr-2 size-4 animate-spin" />
        <CheckCheck v-else class="mr-2 size-4" />
        {{ t.shared.pages.announcements.markAllAsRead }}
      </Button>
    </div>

    <!-- Loading State -->
    <div v-if="announcementsStore.isLoading" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <template v-else>
      <!-- Empty State -->
      <div v-if="announcementsStore.announcements.length === 0" class="py-12 text-center">
        <p class="text-muted-foreground">{{ t.shared.pages.announcements.noAnnouncements }}</p>
      </div>

      <template v-else>
        <!-- Announcements List (Full Width) -->
        <div class="space-y-4">
          <AnnouncementCard
            v-for="announcement in paginatedAnnouncements"
            :key="announcement.id"
            :announcement="announcement"
            show-unread-indicator
            @click="openAnnouncement"
          />
        </div>

        <!-- Pagination -->
        <div v-if="totalPages > 1" class="mt-6">
          <Pagination
            :total="announcementsStore.announcements.length"
            :items-per-page="itemsPerPage"
            :sibling-count="1"
            show-edges
            :default-page="1"
            :page="currentPage"
            @update:page="(page: number) => (currentPage = page)"
          >
            <PaginationContent v-slot="{ items }">
              <PaginationPrevious />

              <template v-for="(page, index) in items">
                <PaginationItem
                  v-if="page.type === 'page'"
                  :key="index"
                  :value="page.value"
                  :is-active="page.value === currentPage"
                >
                  {{ page.value }}
                </PaginationItem>
                <PaginationEllipsis v-else :key="page.type" :index="index" />
              </template>

              <PaginationNext />
            </PaginationContent>
          </Pagination>
        </div>
      </template>
    </template>

    <!-- Detail Dialog -->
    <AnnouncementDetailDialog
      v-model:open="showDetailDialog"
      :announcement="selectedAnnouncement"
    />
  </div>
</template>
