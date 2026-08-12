<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useCurriculumStore } from '@/stores/curriculum'
import { usePracticeStore } from '@/stores/practice'
import { usePracticeProgress } from '@/composables/usePracticeProgress'
import { useT } from '@/composables/useT'
import { Loader2, CircleCheck, GraduationCap, ArrowLeft } from 'lucide-vue-next'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { toast } from 'vue-sonner'

const router = useRouter()
const authStore = useAuthStore()
const curriculumStore = useCurriculumStore()
const practiceStore = usePracticeStore()
const t = useT()
const {
  isSubTopicFullyPracticed,
  getTopicProgress,
  isTopicFullyPracticed,
  getSubjectProgress,
  isSubjectFullyPracticed,
} = usePracticeProgress()

// Navigation state (from store for persistence)
const selectedSubjectId = computed({
  get: () => practiceStore.practiceNavigation.selectedSubjectId,
  set: (val) => practiceStore.setPracticeSubject(val),
})
const selectedTopicId = computed({
  get: () => practiceStore.practiceNavigation.selectedTopicId,
  set: (val) => practiceStore.setPracticeTopic(val),
})
const isStartingSession = ref(false)

// Confirmation dialog state
const showConfirmDialog = ref(false)
const pendingSubTopicId = ref<string | null>(null)

// Fetch curriculum and sub-topic progress on mount
onMounted(async () => {
  if (curriculumStore.gradeLevels.length === 0) {
    await curriculumStore.fetchCurriculum()
  }
  await practiceStore.fetchSubTopicProgress()
})

// Get student's grade level ID
const studentGradeLevelId = computed(() => {
  if (authStore.user?.userType === 'student') {
    return authStore.studentProfile?.gradeLevelId ?? null
  }
  return null
})

// Get student's grade level name
const studentGradeLevelName = computed(() => {
  if (!studentGradeLevelId.value) return ''
  const grade = curriculumStore.gradeLevels.find((g) => g.id === studentGradeLevelId.value)
  return grade?.name ?? ''
})

// Get available subjects for student's grade level
const availableSubjects = computed(() => {
  if (!studentGradeLevelId.value) return []
  const grade = curriculumStore.gradeLevels.find((g) => g.id === studentGradeLevelId.value)
  return grade?.subjects ?? []
})

// Get selected subject
const selectedSubject = computed(() => {
  if (!selectedSubjectId.value) return null
  return availableSubjects.value.find((s) => s.id === selectedSubjectId.value) ?? null
})

// Get selected topic
const selectedTopic = computed(() => {
  if (!selectedSubject.value || !selectedTopicId.value) return null
  return selectedSubject.value.topics.find((t) => t.id === selectedTopicId.value) ?? null
})

// Get pending sub-topic for confirmation dialog
const pendingSubTopic = computed(() => {
  if (!selectedTopic.value || !pendingSubTopicId.value) return null
  return selectedTopic.value.subTopics.find((st) => st.id === pendingSubTopicId.value) ?? null
})

function getImageUrl(coverImagePath: string | null): string {
  if (!coverImagePath) return ''
  if (coverImagePath.startsWith('http')) {
    return coverImagePath
  }
  return curriculumStore.getOptimizedImageUrl(coverImagePath)
}

function selectSubTopic(subTopicId: string) {
  if (!selectedTopic.value || isStartingSession.value) return

  // Show confirmation dialog
  pendingSubTopicId.value = subTopicId
  showConfirmDialog.value = true
}

function goBack() {
  if (selectedTopic.value) {
    practiceStore.setPracticeTopic(null)
  } else if (selectedSubject.value) {
    practiceStore.resetPracticeNavigation()
  }
}

async function confirmStartSession() {
  if (!pendingSubTopicId.value) return

  showConfirmDialog.value = false
  isStartingSession.value = true

  try {
    const result = await practiceStore.startSession(pendingSubTopicId.value)

    if (result.error) {
      toast.error(result.error)
      return
    }

    if (result.session) {
      router.push('/student/practice/quiz')
    }
  } finally {
    isStartingSession.value = false
    pendingSubTopicId.value = null
  }
}
</script>

<template>
  <div class="p-6">
    <!-- Header -->
    <div class="mb-6 flex items-start justify-between gap-4">
      <div>
        <!-- Back button — labelled with the level we're returning to -->
        <Button v-if="selectedSubject" variant="ghost" size="sm" class="mb-2 -ml-2" @click="goBack">
          <ArrowLeft class="mr-2 size-4" />
          {{ selectedTopic ? selectedSubject.name : studentGradeLevelName }}
        </Button>
        <h1 class="text-2xl font-bold">
          {{ selectedTopic?.name ?? selectedSubject?.name ?? t.student.practice.title }}
        </h1>
        <p class="text-muted-foreground">
          {{
            selectedTopic
              ? t.student.practice.subtitleSubTopic
              : selectedSubject
                ? t.student.practice.subtitleTopic
                : t.student.practice.subtitleSubject
          }}
        </p>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="curriculumStore.isLoading" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <!-- No Grade Level Set -->
    <Card
      v-else-if="!studentGradeLevelId"
      class="border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 text-center dark:border-blue-800 dark:bg-card dark:from-blue-950/30 dark:to-indigo-950/30"
    >
      <CardContent class="py-8">
        <div
          class="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/50"
        >
          <GraduationCap class="size-7 text-blue-500" />
        </div>
        <h3 class="text-lg font-semibold">{{ t.student.practice.gradeLevelNotSet }}</h3>
        <p class="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          {{ t.student.practice.gradeLevelNotSetDesc }}
        </p>
        <Button class="mt-4" @click="router.push('/student/profile')">{{
          t.student.practice.goToProfile
        }}</Button>
      </CardContent>
    </Card>

    <template v-else>
      <!-- Subject Selection -->
      <div v-if="!selectedSubject">
        <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <Card
            v-for="subject in availableSubjects"
            :key="subject.id"
            class="flex h-full cursor-pointer flex-col overflow-hidden transition-all hover:scale-[1.02] hover:shadow-lg"
            :class="{
              'border-2 border-green-500 bg-green-50 dark:bg-green-950/30':
                isSubjectFullyPracticed(subject),
            }"
            @click="practiceStore.setPracticeSubject(subject.id)"
          >
            <div v-if="subject.coverImagePath" class="aspect-video w-full overflow-hidden">
              <img
                :src="getImageUrl(subject.coverImagePath)"
                :alt="subject.name"
                loading="lazy"
                class="size-full object-cover"
              />
            </div>
            <CardContent class="mt-auto px-4 pb-4 pt-2">
              <div class="flex items-center gap-2">
                <h3 class="text-lg font-semibold">{{ subject.name }}</h3>
                <CircleCheck
                  v-if="isSubjectFullyPracticed(subject)"
                  class="size-5 text-green-600"
                />
              </div>
              <p
                class="text-sm"
                :class="
                  isSubjectFullyPracticed(subject) ? 'text-green-600' : 'text-muted-foreground'
                "
              >
                {{
                  t.student.practice.topicCompleted(
                    getSubjectProgress(subject).completed,
                    getSubjectProgress(subject).total,
                  )
                }}
              </p>
              <Progress
                :model-value="
                  getSubjectProgress(subject).total > 0
                    ? (getSubjectProgress(subject).completed / getSubjectProgress(subject).total) *
                      100
                    : 0
                "
                class="mt-2 h-1.5"
                :class="isSubjectFullyPracticed(subject) ? '[&>div]:bg-green-500' : ''"
              />
            </CardContent>
          </Card>
        </div>

        <div v-if="availableSubjects.length === 0" class="py-12 text-center">
          <p class="text-muted-foreground">{{ t.student.practice.noSubjects }}</p>
        </div>
      </div>

      <!-- Topic Selection -->
      <div v-else-if="!selectedTopic">
        <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <Card
            v-for="topic in selectedSubject.topics"
            :key="topic.id"
            class="flex h-full cursor-pointer flex-col overflow-hidden transition-all hover:scale-[1.02] hover:shadow-lg"
            :class="{
              'border-2 border-green-500 bg-green-50 dark:bg-green-950/30':
                isTopicFullyPracticed(topic),
            }"
            @click="practiceStore.setPracticeTopic(topic.id)"
          >
            <div v-if="topic.coverImagePath" class="aspect-video w-full overflow-hidden">
              <img
                :src="getImageUrl(topic.coverImagePath)"
                :alt="topic.name"
                loading="lazy"
                class="size-full object-cover"
              />
            </div>
            <CardContent class="mt-auto p-4">
              <div class="flex items-center gap-2">
                <h3 class="text-lg font-semibold">{{ topic.name }}</h3>
                <CircleCheck v-if="isTopicFullyPracticed(topic)" class="size-5 text-green-600" />
              </div>
              <p
                class="text-sm"
                :class="isTopicFullyPracticed(topic) ? 'text-green-600' : 'text-muted-foreground'"
              >
                {{
                  t.student.practice.subTopicCompleted(
                    getTopicProgress(topic).completed,
                    getTopicProgress(topic).total,
                  )
                }}
              </p>
              <Progress
                :model-value="
                  getTopicProgress(topic).total > 0
                    ? (getTopicProgress(topic).completed / getTopicProgress(topic).total) * 100
                    : 0
                "
                class="mt-2 h-1.5"
                :class="isTopicFullyPracticed(topic) ? '[&>div]:bg-green-500' : ''"
              />
            </CardContent>
          </Card>
        </div>

        <div v-if="selectedSubject.topics.length === 0" class="py-12 text-center">
          <p class="text-muted-foreground">{{ t.student.practice.noTopics }}</p>
        </div>
      </div>

      <!-- Sub-Topic Selection -->
      <div v-else>
        <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <Card
            v-for="subTopic in selectedTopic.subTopics"
            :key="subTopic.id"
            class="flex h-full cursor-pointer flex-col overflow-hidden transition-all hover:scale-[1.02] hover:shadow-lg"
            :class="{
              'opacity-50 pointer-events-none': isStartingSession,
              'border-2 border-green-500 bg-green-50 dark:bg-green-950/30':
                subTopic.questionCount > 0 &&
                practiceStore.getSubTopicAnsweredCount(subTopic.id) >= subTopic.questionCount,
            }"
            @click="selectSubTopic(subTopic.id)"
          >
            <div v-if="subTopic.coverImagePath" class="aspect-video w-full overflow-hidden">
              <img
                :src="getImageUrl(subTopic.coverImagePath)"
                :alt="subTopic.name"
                loading="lazy"
                class="size-full object-cover"
              />
            </div>
            <CardContent class="mt-auto p-4">
              <div class="flex items-center gap-2">
                <h3 class="text-lg font-semibold">{{ subTopic.name }}</h3>
                <CircleCheck
                  v-if="isSubTopicFullyPracticed(subTopic)"
                  class="size-5 text-green-600"
                />
              </div>
              <p
                class="text-sm"
                :class="
                  subTopic.questionCount > 0 &&
                  practiceStore.getSubTopicAnsweredCount(subTopic.id) >= subTopic.questionCount
                    ? 'text-green-600'
                    : 'text-muted-foreground'
                "
              >
                {{
                  t.student.practice.questionsCompleted(
                    practiceStore.getSubTopicAnsweredCount(subTopic.id),
                    subTopic.questionCount,
                  )
                }}
              </p>
              <Progress
                :model-value="
                  subTopic.questionCount > 0
                    ? (practiceStore.getSubTopicAnsweredCount(subTopic.id) /
                        subTopic.questionCount) *
                      100
                    : 0
                "
                class="mt-2 h-1.5"
                :class="isSubTopicFullyPracticed(subTopic) ? '[&>div]:bg-green-500' : ''"
              />
            </CardContent>
          </Card>
        </div>

        <div v-if="selectedTopic.subTopics.length === 0" class="py-12 text-center">
          <p class="text-muted-foreground">{{ t.student.practice.noSubTopics }}</p>
        </div>
      </div>
    </template>

    <!-- Loading Overlay -->
    <div
      v-if="isStartingSession"
      class="fixed inset-0 z-50 flex items-center justify-center bg-background/80"
    >
      <div class="flex flex-col items-center gap-4">
        <Loader2 class="size-12 animate-spin text-primary" />
        <p class="text-lg font-medium">{{ t.student.practice.startingSession }}</p>
      </div>
    </div>

    <!-- Start Session Confirmation Dialog -->
    <AlertDialog v-model:open="showConfirmDialog">
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{{ t.student.practice.startSession }}</AlertDialogTitle>
          <AlertDialogDescription>
            {{ t.student.practice.startSessionDesc(pendingSubTopic?.name ?? '') }}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{{ t.student.practice.cancel }}</AlertDialogCancel>
          <AlertDialogAction @click="confirmStartSession">{{
            t.student.practice.startSessionConfirm
          }}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
</template>
