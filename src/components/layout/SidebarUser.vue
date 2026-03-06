<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { ChevronsUpDown, LogOut, Users } from 'lucide-vue-next'
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
} from '@/components/ui/sidebar'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'vue-sonner'

const authStore = useAuthStore()
const router = useRouter()

const isStudent = computed(() => authStore.userType === 'student')

const profilePath = computed(() => {
  if (!authStore.userType) return '/login'
  return `/${authStore.userType}/profile`
})

const userInitials = computed(() => {
  if (!authStore.user?.name) return '?'
  return authStore.user.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
})

const userName = computed(() => authStore.user?.name ?? '')
const userEmail = computed(() => authStore.user?.email ?? '')

// Generate avatar URL from storage path
const userAvatar = computed(() => {
  return authStore.getAvatarUrl(authStore.user?.avatarPath ?? null)
})

async function handleLogout() {
  const result = await authStore.signOut()
  if (result.error) {
    toast.error('Failed to log out')
    return
  }
  // Toast and navigation handled by App.vue auth watcher
}
</script>

<template>
  <SidebarFooter>
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <SidebarMenuButton
              data-tour="sidebar-profile"
              size="lg"
              class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar class="size-8 rounded-lg">
                <AvatarImage :src="userAvatar" :alt="userName" />
                <AvatarFallback class="rounded-lg">{{ userInitials }}</AvatarFallback>
              </Avatar>
              <div class="grid flex-1 text-left text-sm leading-tight">
                <span class="truncate font-medium">{{ userName }}</span>
                <span class="truncate text-xs text-muted-foreground">{{ userEmail }}</span>
              </div>
              <ChevronsUpDown class="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            class="w-[--reka-popper-anchor-width] min-w-56 rounded-lg"
            side="bottom"
            align="end"
            :side-offset="4"
          >
            <DropdownMenuItem class="p-0 font-normal" @click="router.push(profilePath)">
              <div class="flex items-center gap-2 px-2 py-1.5 text-left text-sm">
                <Avatar class="size-8 rounded-lg">
                  <AvatarImage :src="userAvatar" :alt="userName" />
                  <AvatarFallback class="rounded-lg">{{ userInitials }}</AvatarFallback>
                </Avatar>
                <div class="grid flex-1 text-left text-sm leading-tight">
                  <span class="truncate font-medium">{{ userName }}</span>
                  <span class="truncate text-xs text-muted-foreground">{{ userEmail }}</span>
                </div>
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator v-if="isStudent" />
            <DropdownMenuItem v-if="isStudent" @click="router.push('/student/parent')">
              <Users class="mr-2 size-4" />
              My Parent
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem @click="handleLogout">
              <LogOut class="mr-2 size-4" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  </SidebarFooter>
</template>
