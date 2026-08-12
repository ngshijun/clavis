<script setup lang="ts">
import { computed } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { sidebarNavConfig } from '@/lib/navigation'
import { Sidebar, SidebarContent } from '@/components/ui/sidebar'
import SidebarHeader from './SidebarHeader.vue'
import SidebarNav from './SidebarNav.vue'
import SidebarUser from './SidebarUser.vue'

const authStore = useAuthStore()

const navItems = computed(() => {
  if (!authStore.userType) return []
  return sidebarNavConfig[authStore.userType]
})
</script>

<template>
  <Sidebar variant="inset">
    <SidebarHeader />
    <SidebarContent>
      <SidebarNav :items="navItems" />
    </SidebarContent>
    <SidebarUser />
  </Sidebar>
</template>
