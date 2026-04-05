<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { Button } from '@/components/ui/button'
import { Wrench } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

const authStore = useAuthStore()
const router = useRouter()
const isOpen = ref(false)
const isSigningIn = ref(false)

const TEST_PASSWORD = 'Test1234!'

const accounts = [
  { label: 'Student', email: 'student@clavis.test', color: 'bg-blue-500 hover:bg-blue-600' },
  { label: 'Parent', email: 'parent@clavis.test', color: 'bg-green-500 hover:bg-green-600' },
  { label: 'Admin', email: 'admin@clavis.test', color: 'bg-orange-500 hover:bg-orange-600' },
] as const

async function signInAs(email: string) {
  isSigningIn.value = true
  try {
    await authStore.signOut()
    const { error } = await authStore.signIn(email, TEST_PASSWORD)
    if (error) {
      toast.error(error)
      return
    }
    router.push('/')
  } finally {
    isSigningIn.value = false
  }
}

function testLevelUp() {
  authStore.levelUpInfo = { oldLevel: 4, newLevel: 5 }
}
</script>

<template>
  <div class="fixed bottom-4 right-4 z-[9999] flex flex-col items-end gap-2">
    <!-- Expanded panel -->
    <div
      v-if="isOpen"
      class="flex flex-col gap-1.5 rounded-lg border bg-background/90 p-2 shadow-lg backdrop-blur-sm"
    >
      <button
        v-for="account in accounts"
        :key="account.email"
        :disabled="isSigningIn"
        class="rounded px-3 py-1 text-xs font-medium text-white transition-colors disabled:opacity-50"
        :class="account.color"
        @click="signInAs(account.email)"
      >
        {{ account.label }}
      </button>
      <button
        class="rounded bg-purple-500 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-purple-600"
        @click="testLevelUp"
      >
        Level Up
      </button>
    </div>

    <!-- Toggle button -->
    <Button
      size="icon"
      variant="outline"
      class="size-8 rounded-full shadow-lg"
      @click="isOpen = !isOpen"
    >
      <Wrench class="size-4" />
    </Button>
  </div>
</template>
