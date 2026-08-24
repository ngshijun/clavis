<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { sidebarNavConfig, teacherNavItems } from '@/lib/navigation'
import { useActiveClassroom } from '@/composables/useActiveClassroom'
import { Sidebar, SidebarContent } from '@/components/ui/sidebar'
import SidebarHeader from './SidebarHeader.vue'
import SidebarNav from './SidebarNav.vue'
import SidebarUser from './SidebarUser.vue'
import ClassroomSelector from './ClassroomSelector.vue'

const authStore = useAuthStore()
const { classroomId } = useActiveClassroom()

const navItems = computed(() => {
  if (!authStore.userType) return []
  // A teacher's links carry the active classroom (decision 83), so they are
  // built from the route rather than read from the static config.
  if (authStore.isTeacher) return teacherNavItems(classroomId.value)
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
    <SidebarUser />
  </Sidebar>
</template>
