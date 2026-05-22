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
import { useLeaderboardStore } from '@/stores/leaderboard'
import { useFriendsStore } from '@/stores/friends'
import { useFeedbackStore } from '@/stores/feedback'
import { useBadgesStore } from '@/stores/badges'
import { useAuthStore } from '@/stores/auth'
import { useT } from '@/composables/useT'
import type { NavItem } from '@/types'

import { computed } from 'vue'

const PET_PATHS = new Set(['/student/my-pet', '/student/collections'])

const props = defineProps<{
  items: NavItem[]
}>()

const mainItems = computed(() => props.items.filter((item) => !PET_PATHS.has(item.path)))
const petItems = computed(() => props.items.filter((item) => PET_PATHS.has(item.path)))

const route = useRoute()
const announcementsStore = useAnnouncementsStore()
const leaderboardStore = useLeaderboardStore()
const friendsStore = useFriendsStore()
const feedbackStore = useFeedbackStore()
const badgesStore = useBadgesStore()
const authStore = useAuthStore()
const t = useT()

// Map nav paths to locale keys
const pathToNavKey: Record<string, string> = {
  '/admin/dashboard': 'dashboard',
  '/admin/announcements': 'announcements',
  '/admin/curriculum': 'curriculum',
  '/admin/question-bank': 'questionBank',
  '/admin/question-statistics': 'questionStatistics',
  '/admin/question-feedback': 'questionFeedback',
  '/admin/students': 'students',
  '/admin/payment-history': 'paymentHistory',
  '/admin/leaderboard': 'leaderboard',
  '/admin/pets': 'pets',
  '/student/dashboard': 'dashboard',
  '/student/announcements': 'announcements',
  '/student/practice': 'practice',
  '/student/statistics': 'statistics',
  '/student/leaderboard': 'leaderboard',
  '/student/friends': 'friends',
  '/student/my-pet': 'myPet',
  '/student/collections': 'collections',
  '/student/achievements': 'achievements',
  '/parent/dashboard': 'dashboard',
  '/parent/announcements': 'announcements',
  '/parent/children': 'children',
  '/parent/statistics': 'statistics',
  '/parent/subscription': 'subscription',
  '/parent/contact': 'contactUs',
}

function getNavTitle(item: NavItem): string {
  const key = pathToNavKey[item.path]
  if (!key) return item.title
  const userType = authStore.userType
  if (!userType) return item.title
  const navSection = t.value.shared.layout.sidebar.nav[userType] as Record<string, string>
  return navSection[key] ?? item.title
}

function shouldShowBadge(item: NavItem): boolean {
  if (item.path.includes('achievements') && badgesStore.unreadCount > 0) {
    return true
  }
  if (
    item.path.includes('announcements') &&
    authStore.userType !== 'admin' &&
    announcementsStore.unreadCount > 0
  ) {
    return true
  }
  if (item.path.includes('leaderboard') && leaderboardStore.hasUnseenReward) {
    return true
  }
  if (item.path.includes('friends') && friendsStore.pendingRequestCount > 0) {
    return true
  }
  if (item.path.includes('question-feedback') && feedbackStore.feedbacks.length > 0) {
    return true
  }
  return false
}

function getBadgeText(item: NavItem): string {
  if (item.path.includes('achievements')) {
    return badgesStore.unreadCount > 9 ? '9+' : String(badgesStore.unreadCount)
  }
  if (item.path.includes('announcements')) {
    return announcementsStore.unreadCount > 9 ? '9+' : String(announcementsStore.unreadCount)
  }
  if (item.path.includes('leaderboard')) {
    return '1'
  }
  if (item.path.includes('friends')) {
    return friendsStore.pendingRequestCount > 9 ? '9+' : String(friendsStore.pendingRequestCount)
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
        <SidebarMenuItem v-for="item in mainItems" :key="item.path">
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
        <div v-if="petItems.length" data-tour="sidebar-pets" class="flex flex-col gap-1">
          <SidebarMenuItem v-for="item in petItems" :key="item.path">
            <SidebarMenuButton as-child :is-active="route.path === item.path">
              <RouterLink :to="item.path" class="flex items-center justify-between w-full">
                <div class="flex items-center gap-2">
                  <component :is="item.icon" class="size-4" />
                  <span>{{ getNavTitle(item) }}</span>
                </div>
              </RouterLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </div>
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>
</template>
