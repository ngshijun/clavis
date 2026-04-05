<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useHead } from '@unhead/vue'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'
import { Toaster } from '@/components/ui/sonner'
import { toast } from 'vue-sonner'
import { SpeedInsights } from '@vercel/speed-insights/vue'
import { defineAsyncComponent } from 'vue'
import 'vue-sonner/style.css'

const DevToolbox = import.meta.env.DEV
  ? defineAsyncComponent(() => import('@/components/layout/DevToolbox.vue'))
  : null

const router = useRouter()
const authStore = useAuthStore()
const themeStore = useThemeStore()

useHead({
  titleTemplate: (title) =>
    title ? `${title} — Clavis` : 'Clavis — Where Learning Feels Like Play',
})

const showUpdateNotice = ref(false)

function reloadPage() {
  window.location.reload()
}

// Notify user when a new version is deployed
onMounted(() => {
  document.addEventListener('plugin_web_update_notice', () => {
    showUpdateNotice.value = true
  })

  // Safety net: if a lazy-loaded chunk fails to load after a deploy,
  // reload the page so the user gets the latest assets
  window.addEventListener('vite:preloadError', () => {
    window.location.reload()
  })
})

// Track previous auth state to detect actual sign-out events
let previousAuthState: boolean | undefined = undefined

// React to auth state changes for automatic navigation
watch(
  () => authStore.isAuthenticated,
  (isAuthenticated) => {
    // Skip initial load (when previousAuthState is undefined)
    if (previousAuthState === undefined) {
      previousAuthState = isAuthenticated
      return
    }

    // User was signed out (session expired, revoked, manually signed out, etc.)
    if (!isAuthenticated && previousAuthState) {
      toast.info('You have been signed out')
      router.replace('/login')
    }

    previousAuthState = isAuthenticated
  },
  { immediate: true },
)
</script>

<template>
  <router-view />
  <Toaster rich-colors position="top-center" :theme="themeStore.isDark ? 'dark' : 'light'" />
  <SpeedInsights />
  <DevToolbox v-if="DevToolbox" />

  <!-- New version available notification -->
  <Transition
    enter-active-class="transition duration-300 ease-out"
    enter-from-class="translate-y-2 opacity-0"
    enter-to-class="translate-y-0 opacity-100"
    leave-active-class="transition duration-200 ease-in"
    leave-from-class="translate-y-0 opacity-100"
    leave-to-class="translate-y-2 opacity-0"
  >
    <div
      v-if="showUpdateNotice"
      class="fixed bottom-6 right-6 z-[999] w-80 rounded-lg border bg-background p-4 shadow-lg"
    >
      <div class="flex items-start gap-3">
        <div
          class="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="size-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path
              d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"
            />
            <path
              d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"
            />
            <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
            <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
          </svg>
        </div>
        <div class="flex-1 space-y-1">
          <p class="text-sm font-medium">New version available</p>
          <p class="text-xs text-muted-foreground">Refresh the page to get the latest updates.</p>
        </div>
        <button
          class="shrink-0 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
          @click="showUpdateNotice = false"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="size-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
      <button
        class="mt-3 w-full rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        @click="reloadPage"
      >
        Refresh
      </button>
    </div>
  </Transition>
</template>
