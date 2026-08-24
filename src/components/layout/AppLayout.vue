<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import { SidebarProvider, SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth'
import { useCurriculumStore } from '@/stores/curriculum'
import { toast } from 'vue-sonner'
import { Skeleton } from '@/components/ui/skeleton'
import { Loader2 } from 'lucide-vue-next'
import { useT } from '@/composables/useT'
import AppSidebar from './AppSidebar.vue'
import AppBreadcrumbs from './AppBreadcrumbs.vue'
import HeaderUser from './HeaderUser.vue'
import ClassroomNotFound from './ClassroomNotFound.vue'
import ThemeToggle from './ThemeToggle.vue'
import LanguageToggle from './LanguageToggle.vue'
import PreferencesDialog from './PreferencesDialog.vue'
import { useLanguageStore } from '@/stores/language'
import { useActiveClassroom } from '@/composables/useActiveClassroom'
import { useRoute } from 'vue-router'
const authStore = useAuthStore()
const route = useRoute()
const curriculumStore = useCurriculumStore()
const t = useT()
const languageStore = useLanguageStore()
/**
 * Guarded once here rather than in every classroom-scoped page: the check is
 * identical for students and teachers, and a page that renders its own empty
 * state instead would claim the user has no classroom at all.
 */
const { isUnknown: isUnknownClassroom, classroomId } = useActiveClassroom()

/**
 * The class PICKER has no sidebar (decision 84). It is the screen you use to
 * choose a classroom, and every sidebar link below it belongs to a classroom
 * you have not chosen yet — so the nav would either be empty or point
 * somewhere you are not.
 *
 * Named explicitly rather than matched on a `-classrooms` suffix: that also
 * caught `manager-classrooms`, which is the org's classroom MANAGEMENT page
 * and needs its nav.
 */
const PICKER_ROUTES = new Set(['teacher-classrooms', 'student-classrooms'])

const showSidebar = computed(
  () => !(PICKER_ROUTES.has(String(route.name ?? '')) && !classroomId.value),
)

const PREFERENCES_STORAGE_KEY = 'preferences_confirmed'

const showPreferencesDialog = ref(false)

// Grade selection dialog state
const showGradeDialog = ref(false)
const selectedGradeId = ref<string>('')
const isSaving = ref(false)

onMounted(async () => {
  if (localStorage.getItem(PREFERENCES_STORAGE_KEY) !== 'true') {
    showPreferencesDialog.value = true
    return
  }
  await beginPostPreferencesFlow()
})

async function beginPostPreferencesFlow() {
  if (authStore.isStudent && !authStore.studentProfile?.gradeLevelId) {
    await curriculumStore.fetchCurriculum()
    showGradeDialog.value = true
  }
}

async function handlePreferencesConfirmed() {
  localStorage.setItem(PREFERENCES_STORAGE_KEY, 'true')
  showPreferencesDialog.value = false
  await beginPostPreferencesFlow()
}

async function handleSaveGrade() {
  if (!selectedGradeId.value) {
    toast.error(t.value.shared.layout.gradeDialog.toastNoGrade)
    return
  }

  isSaving.value = true
  try {
    const result = await authStore.updateGradeLevel(selectedGradeId.value)
    if (result.error) {
      toast.error(result.error)
      return
    }
    toast.success(t.value.shared.layout.gradeDialog.toastSuccess)
    showGradeDialog.value = false
  } finally {
    isSaving.value = false
  }
}
</script>

<template>
  <!-- Loading skeleton: matches actual layout structure to minimize CLS -->
  <div v-if="!authStore.user" class="flex h-dvh">
    <!-- Sidebar skeleton -->
    <div class="hidden w-64 shrink-0 border-r bg-sidebar md:block" />
    <div class="flex flex-1 flex-col">
      <!-- Header skeleton -->
      <div class="flex h-12 items-center border-b px-4">
        <Skeleton class="h-4 w-48" />
      </div>
      <!-- Content skeleton -->
      <div class="flex flex-1 items-center justify-center">
        <Loader2 class="size-8 animate-spin text-muted-foreground" />
      </div>
    </div>
  </div>

  <SidebarProvider v-else>
    <AppSidebar v-if="showSidebar" />
    <SidebarInset>
      <header class="flex h-12 shrink-0 items-center justify-between gap-2 border-b px-4">
        <div class="flex min-w-0 items-center gap-2">
          <template v-if="showSidebar">
            <SidebarTrigger class="-ml-1 shrink-0" />
            <Separator orientation="vertical" class="mr-2 h-4 shrink-0" />
          </template>
          <AppBreadcrumbs />
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <LanguageToggle />
          <ThemeToggle />
          <Separator orientation="vertical" class="h-4" />
          <HeaderUser />
        </div>
      </header>
      <main class="flex-1 overflow-auto">
        <ClassroomNotFound v-if="isUnknownClassroom" />
        <router-view v-else />
      </main>
    </SidebarInset>

    <!-- Preferences Dialog (shown once per device before any onboarding) -->
    <PreferencesDialog :open="showPreferencesDialog" @confirm="handlePreferencesConfirmed" />

    <!-- Grade Selection Dialog (for students without grade set) -->
    <AlertDialog :open="showGradeDialog">
      <AlertDialogContent
        class="sm:max-w-md"
        @escape-key-down.prevent
        @pointer-down-outside.prevent
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{{ t.shared.layout.gradeDialog.title }}</AlertDialogTitle>
          <AlertDialogDescription>
            {{ t.shared.layout.gradeDialog.description }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div class="py-4">
          <Select
            :key="languageStore.language"
            v-model="selectedGradeId"
            :disabled="curriculumStore.isLoading || isSaving"
          >
            <SelectTrigger class="w-full">
              <SelectValue :placeholder="t.shared.layout.gradeDialog.selectPlaceholder" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem
                v-for="grade in curriculumStore.gradeLevels"
                :key="grade.id"
                :value="grade.id"
              >
                {{ grade.name }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <AlertDialogFooter>
          <Button :disabled="!selectedGradeId || isSaving" @click="handleSaveGrade">
            <Loader2 v-if="isSaving" class="mr-2 size-4 animate-spin" />
            {{ t.shared.layout.gradeDialog.continueButton }}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </SidebarProvider>
</template>
