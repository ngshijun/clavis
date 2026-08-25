<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import {
  managerNavItems,
  sidebarNavConfig,
  studentNavItems,
  teacherNavItems,
} from '@/lib/navigation'
import { useActiveClassroom } from '@/composables/useActiveClassroom'
import { Sidebar, SidebarContent } from '@/components/ui/sidebar'
import SidebarHeader from './SidebarHeader.vue'
import SidebarNav from './SidebarNav.vue'
import ClassroomSelector from './ClassroomSelector.vue'

const authStore = useAuthStore()
const { classroomId } = useActiveClassroom()

const navItems = computed(() => {
  if (!authStore.userType) return []
  // Every role with classroom-scoped surfaces builds its links from the route
  // rather than from the static config (decision 83). A manager is the one
  // role that has links at both altitudes — see managerNavItems.
  if (authStore.isTeacher) return teacherNavItems(classroomId.value)
  if (authStore.isStudent) return studentNavItems(classroomId.value)
  if (authStore.isManager) return managerNavItems(classroomId.value)
  return sidebarNavConfig[authStore.userType]
})
</script>

<template>
  <Sidebar variant="inset">
    <SidebarHeader />
    <SidebarContent>
      <ClassroomSelector />
      <SidebarNav :items="navItems" />
    </SidebarContent>
  </Sidebar>
</template>
