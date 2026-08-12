import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAuthStore } from './auth'
import { handleError, errorMessages } from '@/lib/errors'
import { uploadStorageFile, deleteStorageFile, createBucketImageHelpers } from '@/lib/storage'
import type { Database } from '@/types/database.types'
import { useLanguageStore } from '@/stores/language'

export type AnnouncementAudience = Database['public']['Enums']['announcement_audience']

export interface Announcement {
  id: string
  title: string
  content: string
  targetAudience: AnnouncementAudience
  imagePath: string | null
  expiresAt: string | null
  createdBy: string
  createdAt: string | null
  updatedAt: string | null
  isPinned: boolean
  isRead?: boolean
}

/**
 * Audiences an admin may choose when authoring. The DB enum still carries the
 * legacy `parents_only` value so pre-revamp rows keep rendering; it is not
 * offered as a choice. The enum value itself is dropped in P4.
 */
export const SELECTABLE_AUDIENCES = [
  'all',
  'students_only',
] as const satisfies readonly AnnouncementAudience[]

export type SelectableAudience = (typeof SELECTABLE_AUDIENCES)[number]

/**
 * Coerce a stored audience to an authorable one. Pre-revamp `parents_only`
 * rows fall back to `all` when reopened in the editor.
 */
export function toSelectableAudience(audience: AnnouncementAudience): SelectableAudience {
  return audience === 'students_only' ? 'students_only' : 'all'
}

export function getAudienceConfig(): Record<
  AnnouncementAudience,
  { label: string; color: string; bgColor: string }
> {
  const store = useLanguageStore()
  const labels = store.t.shared.announcements.audience
  return {
    all: {
      label: labels.all,
      color: 'text-blue-600 dark:text-blue-400',
      bgColor: 'bg-blue-100 dark:bg-blue-900/50',
    },
    students_only: {
      label: labels.studentsOnly,
      color: 'text-green-600 dark:text-green-400',
      bgColor: 'bg-green-100 dark:bg-green-900/50',
    },
    parents_only: {
      label: labels.parentsOnly,
      color: 'text-purple-600 dark:text-purple-400',
      bgColor: 'bg-purple-100 dark:bg-purple-900/50',
    },
  }
}

export const useAnnouncementsStore = defineStore('announcements', () => {
  const authStore = useAuthStore()

  // State
  const announcements = ref<Announcement[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Admin AnnouncementsPage state (persisted across navigation)
  const adminAnnouncementsFilters = ref({
    search: '',
  })

  // AnnouncementsPage pagination state (persisted across navigation)
  const announcementsPagination = ref({
    pageIndex: 0,
    pageSize: 5,
  })

  // Computed
  const unreadAnnouncements = computed(() => announcements.value.filter((a) => !a.isRead))

  // Single source of truth: derived from the fetched list (admins always read every
  // row as isRead=true, so this is 0 for them without a special case).
  const unreadCount = computed(() => unreadAnnouncements.value.length)

  const latestAnnouncements = computed(() => announcements.value.slice(0, 5))

  // Fetch announcements with read status
  async function fetchAnnouncements(): Promise<{ error: string | null }> {
    isLoading.value = true
    error.value = null

    try {
      const announcementsQuery = supabase
        .from('announcements')
        .select('*')
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false })

      const needsReadStatus = authStore.userType !== 'admin' && authStore.user?.id
      const readsQuery = needsReadStatus
        ? supabase
            .from('announcement_reads')
            .select('announcement_id')
            .eq('user_id', authStore.user!.id)
        : null

      const [announcementsResult, readsResult] = await Promise.all([announcementsQuery, readsQuery])

      if (announcementsResult.error) throw announcementsResult.error
      const announcementData = announcementsResult.data

      const readAnnouncementIds: Set<string> = new Set(
        (readsResult?.data || []).map((r) => r.announcement_id),
      )

      announcements.value = (announcementData || []).map((a) => ({
        id: a.id,
        title: a.title,
        content: a.content,
        targetAudience: a.target_audience,
        imagePath: a.image_path,
        expiresAt: a.expires_at,
        createdBy: a.created_by,
        createdAt: a.created_at,
        updatedAt: a.updated_at,
        isPinned: a.is_pinned,
        isRead: authStore.userType === 'admin' ? true : readAnnouncementIds.has(a.id),
      }))

      return { error: null }
    } catch (err) {
      const message = handleError(err, 'failedFetchAnnouncements')
      error.value = message
      return { error: message }
    } finally {
      isLoading.value = false
    }
  }

  // Mark announcement as read
  async function markAsRead(announcementId: string): Promise<{ error: string | null }> {
    if (authStore.userType === 'admin' || !authStore.user?.id) {
      return { error: null }
    }

    // Check if already read locally
    const announcement = announcements.value.find((a) => a.id === announcementId)
    if (announcement?.isRead) {
      return { error: null }
    }

    try {
      const { error: insertError } = await supabase.from('announcement_reads').insert({
        announcement_id: announcementId,
        user_id: authStore.user.id,
      })

      // Ignore duplicate key error
      if (insertError && !insertError.message.includes('duplicate')) {
        throw insertError
      }

      // Update local state (unreadCount is derived from isRead)
      if (announcement) {
        announcement.isRead = true
      }

      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedMarkAsRead') }
    }
  }

  // Mark all as read
  async function markAllAsRead(): Promise<{ error: string | null }> {
    if (authStore.userType === 'admin' || !authStore.user?.id) {
      return { error: null }
    }

    const unreadIds = announcements.value.filter((a) => !a.isRead).map((a) => a.id)

    if (unreadIds.length === 0) {
      return { error: null }
    }

    try {
      const inserts = unreadIds.map((id) => ({
        announcement_id: id,
        user_id: authStore.user!.id,
      }))

      const { error: insertError } = await supabase
        .from('announcement_reads')
        .upsert(inserts, { onConflict: 'announcement_id,user_id' })

      if (insertError) throw insertError

      // Update local state (unreadCount is derived from isRead)
      announcements.value.forEach((a) => {
        a.isRead = true
      })

      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedMarkAllAsRead') }
    }
  }

  const { getImageUrl, getOptimizedImageUrl, getThumbnailImageUrl } =
    createBucketImageHelpers('announcement-images')

  // ========== ADMIN FUNCTIONS ==========

  // Create announcement
  async function createAnnouncement(data: {
    title: string
    content: string
    targetAudience: AnnouncementAudience
    imagePath?: string | null
    expiresAt?: string | null
    isPinned?: boolean
  }): Promise<{ announcement: Announcement | null; error: string | null }> {
    try {
      const { data: newAnnouncement, error: insertError } = await supabase
        .from('announcements')
        .insert({
          title: data.title,
          content: data.content,
          target_audience: data.targetAudience,
          image_path: data.imagePath ?? null,
          expires_at: data.expiresAt ?? null,
          is_pinned: data.isPinned ?? false,
          created_by: authStore.user!.id,
        })
        .select()
        .single()

      if (insertError) throw insertError

      const announcement: Announcement = {
        id: newAnnouncement.id,
        title: newAnnouncement.title,
        content: newAnnouncement.content,
        targetAudience: newAnnouncement.target_audience,
        imagePath: newAnnouncement.image_path,
        expiresAt: newAnnouncement.expires_at,
        createdBy: newAnnouncement.created_by,
        createdAt: newAnnouncement.created_at,
        updatedAt: newAnnouncement.updated_at,
        isPinned: newAnnouncement.is_pinned,
        isRead: true,
      }

      announcements.value.unshift(announcement)

      return { announcement, error: null }
    } catch (err) {
      return {
        announcement: null,
        error: handleError(err, 'failedCreateAnnouncement'),
      }
    }
  }

  // Update announcement
  async function updateAnnouncement(
    id: string,
    updates: Partial<{
      title: string
      content: string
      targetAudience: AnnouncementAudience
      imagePath: string | null
      expiresAt: string | null
      isPinned: boolean
    }>,
  ): Promise<{ error: string | null }> {
    try {
      const updateData: Record<string, unknown> = {}
      if (updates.title !== undefined) updateData.title = updates.title
      if (updates.content !== undefined) updateData.content = updates.content
      if (updates.targetAudience !== undefined) updateData.target_audience = updates.targetAudience
      if (updates.imagePath !== undefined) updateData.image_path = updates.imagePath
      if (updates.expiresAt !== undefined) updateData.expires_at = updates.expiresAt
      if (updates.isPinned !== undefined) updateData.is_pinned = updates.isPinned

      const { data: updatedData, error: updateError } = await supabase
        .from('announcements')
        .update(updateData)
        .eq('id', id)
        .select('updated_at')
        .single()

      if (updateError) throw updateError

      // Update local state
      const index = announcements.value.findIndex((a) => a.id === id)
      if (index !== -1) {
        const announcement = announcements.value[index]
        if (announcement) {
          if (updates.title !== undefined) announcement.title = updates.title
          if (updates.content !== undefined) announcement.content = updates.content
          if (updates.targetAudience !== undefined)
            announcement.targetAudience = updates.targetAudience
          if (updates.imagePath !== undefined) announcement.imagePath = updates.imagePath
          if (updates.expiresAt !== undefined) announcement.expiresAt = updates.expiresAt
          if (updates.isPinned !== undefined) announcement.isPinned = updates.isPinned
          announcement.updatedAt = updatedData?.updated_at ?? new Date().toISOString()
        }
      }

      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedUpdateAnnouncement') }
    }
  }

  // Toggle pin status
  async function togglePin(id: string): Promise<{ error: string | null }> {
    const announcement = announcements.value.find((a) => a.id === id)
    if (!announcement) {
      return { error: errorMessages().announcementNotFound }
    }

    const newPinnedStatus = !announcement.isPinned

    try {
      const { error: updateError } = await supabase
        .from('announcements')
        .update({ is_pinned: newPinnedStatus })
        .eq('id', id)

      if (updateError) throw updateError

      // Update local state
      announcement.isPinned = newPinnedStatus

      // Re-sort announcements (pinned first, then by created_at desc)
      announcements.value.sort((a, b) => {
        if (a.isPinned !== b.isPinned) {
          return a.isPinned ? -1 : 1
        }
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      })

      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedTogglePin') }
    }
  }

  // Delete announcement
  async function deleteAnnouncement(id: string): Promise<{ error: string | null }> {
    try {
      const { error: deleteError } = await supabase.from('announcements').delete().eq('id', id)

      if (deleteError) throw deleteError

      // Remove from local state
      const index = announcements.value.findIndex((a) => a.id === id)
      if (index !== -1) {
        announcements.value.splice(index, 1)
      }

      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedDeleteAnnouncement') }
    }
  }

  function uploadImage(file: File) {
    return uploadStorageFile('announcement-images', file)
  }

  function deleteImage(path: string) {
    return deleteStorageFile('announcement-images', path)
  }

  // Admin AnnouncementsPage filter setters
  function setAdminAnnouncementsSearch(search: string) {
    adminAnnouncementsFilters.value.search = search
  }

  // AnnouncementsPage pagination setters
  function setAnnouncementsPageIndex(index: number) {
    announcementsPagination.value.pageIndex = index
  }

  function setAnnouncementsPageSize(size: number) {
    announcementsPagination.value.pageSize = size
    announcementsPagination.value.pageIndex = 0 // Reset to first page when page size changes
  }

  // Reset store state (call on logout)
  function $reset() {
    announcements.value = []
    isLoading.value = false
    error.value = null
    adminAnnouncementsFilters.value = { search: '' }
    announcementsPagination.value = { pageIndex: 0, pageSize: 5 }
  }

  return {
    // State
    announcements,
    isLoading,
    error,
    unreadCount,

    // Computed
    unreadAnnouncements,
    latestAnnouncements,

    // Admin AnnouncementsPage filters
    adminAnnouncementsFilters,
    setAdminAnnouncementsSearch,

    // AnnouncementsPage pagination
    announcementsPagination,
    setAnnouncementsPageIndex,
    setAnnouncementsPageSize,

    // Actions
    fetchAnnouncements,
    markAsRead,
    markAllAsRead,
    getImageUrl,
    getOptimizedImageUrl,
    getThumbnailImageUrl,
    $reset,

    // Admin actions
    createAnnouncement,
    updateAnnouncement,
    togglePin,
    deleteAnnouncement,
    uploadImage,
    deleteImage,
  }
})
