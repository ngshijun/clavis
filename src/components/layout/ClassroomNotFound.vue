<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { School } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { useT } from '@/composables/useT'

/**
 * Shown in place of the page when the URL names a classroom the user cannot
 * reach (decision 83). Authorization already happened in the DB — this exists
 * so a mistyped or shared-from-elsewhere link says so, instead of rendering a
 * page full of zeroes or, worse, a "you have no classroom yet" empty state
 * that is simply untrue.
 */
const t = useT()
const router = useRouter()
const authStore = useAuthStore()

const copy = computed(() =>
  authStore.isStudent ? t.value.student.classroomPicker : t.value.staff.classroomPicker,
)
</script>

<template>
  <div class="p-6">
    <div class="py-16 text-center">
      <School class="mx-auto size-16 text-muted-foreground/50" />
      <p class="mt-4 text-muted-foreground">{{ copy.unknown }}</p>
      <Button
        variant="outline"
        class="mt-4"
        @click="router.push(`/${authStore.userType}/classrooms`)"
      >
        {{ copy.backToPicker }}
      </Button>
    </div>
  </div>
</template>
