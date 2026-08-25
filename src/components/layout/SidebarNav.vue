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
import { useAuthStore } from '@/stores/auth'
import { useT } from '@/composables/useT'
import type { NavItem } from '@/types'

defineProps<{
  items: NavItem[]
}>()

const route = useRoute()
const authStore = useAuthStore()
const t = useT()

// Map nav paths to locale keys
const pathToNavKey: Record<string, string> = {
  '/admin/dashboard': 'dashboard',
  '/admin/organizations': 'organizations',
  '/admin/curriculum': 'curriculum',
  '/admin/question-bank': 'questionBank',
  '/admin/assessments': 'assessmentTemplates',
  '/admin/tags': 'learningPoints',
  '/manager/dashboard': 'dashboard',
  '/manager/teachers': 'teachers',
  '/manager/students': 'students',
  '/manager/classrooms': 'classrooms',
}

function getNavTitle(item: NavItem): string {
  // Dynamic paths (a teacher's classroom links) carry their key directly;
  // everything else is looked up by its fixed path.
  const key = item.navKey ?? pathToNavKey[item.path]
  if (!key) return item.title
  const userType = authStore.userType
  if (!userType) return item.title
  const navSection = t.value.shared.layout.sidebar.nav[
    userType as keyof typeof t.value.shared.layout.sidebar.nav
  ] as Record<string, string>
  return navSection?.[key] ?? item.title
}
</script>

<template>
  <SidebarGroup>
    <SidebarGroupLabel>{{ t.shared.layout.sidebar.navigation }}</SidebarGroupLabel>
    <SidebarGroupContent>
      <SidebarMenu>
        <SidebarMenuItem v-for="item in items" :key="item.path">
          <SidebarMenuButton as-child :is-active="route.path === item.path">
            <RouterLink :to="item.path" class="flex items-center gap-2">
              <component :is="item.icon" class="size-4" />
              <span>{{ getNavTitle(item) }}</span>
            </RouterLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>
</template>
