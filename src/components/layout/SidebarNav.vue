<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar'
import { Badge } from '@/components/ui/badge'
import { useAnnouncementsStore } from '@/stores/announcements'
import { useFeedbackStore } from '@/stores/feedback'
import { useAuthStore } from '@/stores/auth'
import { useT } from '@/composables/useT'
import type { NavItem } from '@/types'

defineProps<{
  items: NavItem[]
}>()

const route = useRoute()
const announcementsStore = useAnnouncementsStore()
const feedbackStore = useFeedbackStore()
const authStore = useAuthStore()
const t = useT()

// Map nav paths to locale keys
const pathToNavKey: Record<string, string> = {
  '/admin/dashboard': 'dashboard',
  '/admin/announcements': 'announcements',
  '/admin/organizations': 'organizations',
  '/admin/curriculum': 'curriculum',
  '/admin/question-bank': 'questionBank',
  '/admin/question-statistics': 'questionStatistics',
  '/admin/question-feedback': 'questionFeedback',
  '/admin/students': 'students',
  '/manager/dashboard': 'teachers',
  '/manager/classes': 'classes',
  '/manager/assessments': 'assessments',
  '/teacher/dashboard': 'students',
  '/teacher/classes': 'classes',
  '/teacher/assessments': 'assessments',
  '/student/dashboard': 'dashboard',
  '/student/announcements': 'announcements',
  '/student/practice': 'practice',
  '/student/assessments': 'assessments',
  '/student/statistics': 'statistics',
}

function getNavTitle(item: NavItem): string {
  const key = pathToNavKey[item.path]
  if (!key) return item.title
  const userType = authStore.userType
  if (!userType) return item.title
  const navSection = t.value.shared.layout.sidebar.nav[
    userType as keyof typeof t.value.shared.layout.sidebar.nav
  ] as Record<string, string>
  return navSection?.[key] ?? item.title
}

function shouldShowBadge(item: NavItem): boolean {
  if (
    item.path.includes('announcements') &&
    authStore.userType !== 'admin' &&
    announcementsStore.unreadCount > 0
  ) {
    return true
  }
  if (item.path.includes('question-feedback') && feedbackStore.feedbacks.length > 0) {
    return true
  }
  return false
}

function getBadgeText(item: NavItem): string {
  if (item.path.includes('announcements')) {
    return announcementsStore.unreadCount > 9 ? '9+' : String(announcementsStore.unreadCount)
  }
  if (item.path.includes('question-feedback')) {
    return feedbackStore.feedbacks.length > 9 ? '9+' : String(feedbackStore.feedbacks.length)
  }
  return ''
}
</script>

<template>
  <SidebarGroup data-tour="sidebar-nav">
    <SidebarGroupLabel>{{ t.shared.layout.sidebar.navigation }}</SidebarGroupLabel>
    <SidebarGroupContent>
      <SidebarMenu>
        <SidebarMenuItem v-for="item in items" :key="item.path">
          <SidebarMenuButton as-child :is-active="route.path === item.path">
            <RouterLink :to="item.path" class="flex items-center justify-between w-full">
              <div class="flex items-center gap-2">
                <component :is="item.icon" class="size-4" />
                <span>{{ getNavTitle(item) }}</span>
              </div>
              <Badge
                v-if="shouldShowBadge(item)"
                variant="default"
                class="size-5 justify-center rounded-full p-0 text-xs"
              >
                {{ getBadgeText(item) }}
              </Badge>
            </RouterLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>
</template>
