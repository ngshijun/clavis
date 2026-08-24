<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useT } from '@/composables/useT'
import { getAvatarUrl } from '@/lib/storage'
import { LogOut } from 'lucide-vue-next'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'vue-sonner'

/**
 * The account menu, in the header rather than the sidebar footer
 * (decision 84). The header is present on every screen — including the class
 * picker, which has no sidebar — so this is the one place it can live and
 * always be reachable.
 */
const authStore = useAuthStore()
const router = useRouter()
const t = useT()

const profilePath = computed(() =>
  authStore.userType ? `/${authStore.userType}/profile` : '/login',
)

const userName = computed(() => authStore.user?.name ?? '')
const userEmail = computed(() => authStore.user?.email ?? '')
const userAvatar = computed(() => getAvatarUrl(authStore.user?.avatarPath ?? null))

const userInitials = computed(() => {
  if (!authStore.user?.name) return '?'
  return authStore.user.name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
})

async function handleLogout() {
  const result = await authStore.signOut()
  if (result.error) {
    toast.error(result.error)
  }
  // Toast and navigation handled by App.vue auth watcher
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger
      data-tour="sidebar-profile"
      class="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
      :aria-label="userName"
    >
      <Avatar class="size-8">
        <AvatarImage :src="userAvatar" :alt="userName" />
        <AvatarFallback>{{ userInitials }}</AvatarFallback>
      </Avatar>
    </DropdownMenuTrigger>
    <DropdownMenuContent class="min-w-56 rounded-lg" align="end" :side-offset="6">
      <DropdownMenuItem class="p-0 font-normal" @click="router.push(profilePath)">
        <div class="flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm">
          <Avatar class="size-8 rounded-lg">
            <AvatarImage :src="userAvatar" :alt="userName" />
            <AvatarFallback class="rounded-lg">{{ userInitials }}</AvatarFallback>
          </Avatar>
          <div class="grid flex-1 leading-tight">
            <span class="truncate font-medium">{{ userName }}</span>
            <span class="truncate text-xs text-muted-foreground">{{ userEmail }}</span>
          </div>
        </div>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem @click="handleLogout">
        <LogOut class="mr-2 size-4" />
        {{ t.shared.layout.sidebar.logOut }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
