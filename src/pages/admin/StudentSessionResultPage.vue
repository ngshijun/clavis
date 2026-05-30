<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAdminStudentsStore } from '@/stores/admin-students'
import {
  useAdminStudentStatsStore,
  type StudentPracticeSessionFull,
} from '@/stores/admin-student-stats'
import { parseSimpleMarkdown } from '@/lib/utils'
import { buildSessionSummary, type SummarizableSession } from '@/lib/sessionResult'
import SessionResultContent from '@/components/session/SessionResultContent.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Loader2, BotMessageSquare } from 'lucide-vue-next'
import { useT } from '@/composables/useT'

const t = useT()

const route = useRoute()
const router = useRouter()
const adminStudentsStore = useAdminStudentsStore()
const adminStatsStore = useAdminStudentStatsStore()

const studentId = computed(() => route.params.studentId as string)
const sessionId = computed(() => route.params.sessionId as string)

// Get student info
const student = computed(() => adminStudentsStore.getStudentById(studentId.value))

const session = ref<StudentPracticeSessionFull | null>(null)
const isLoading = ref(true)

// buildSessionSummary reads only questions.length / answers[].isCorrect; the full session's
// richer questions[] is structurally a superset, so cast to the helper's minimal shape.
const summary = computed(() =>
  session.value ? buildSessionSummary(session.value as SummarizableSession) : null,
)

onMounted(async () => {
  // Ensure students are loaded first
  if (adminStudentsStore.students.length === 0) {
    await adminStudentsStore.fetchAllStudents()
  }

  const result = await adminStatsStore.getSessionById(studentId.value, sessionId.value)
  if (result.session) {
    session.value = result.session
  } else {
    // Redirect if session not found
    router.push(`/admin/students/${studentId.value}/statistics`)
  }
  isLoading.value = false
})

function goBack() {
  router.push(`/admin/students/${studentId.value}/statistics`)
}
</script>

<template>
  <div class="p-6">
    <!-- Loading State -->
    <div v-if="isLoading" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <template v-else-if="session && summary">
      <!-- Header -->
      <div class="mb-6">
        <Button variant="ghost" size="sm" class="mb-4" @click="goBack">
          <ArrowLeft class="mr-2 size-4" />
          {{ t.admin.studentSessionResult.backToStatistics }}
        </Button>

        <h1 class="text-2xl font-bold">{{ t.admin.studentSessionResult.title }}</h1>
        <p v-if="student" class="text-muted-foreground">
          {{ student.name }} - {{ session.subjectName }} - {{ session.topicName }} |
          {{ session.gradeLevelName }}
        </p>
      </div>

      <SessionResultContent
        :summary="summary"
        :completed-at="session.completedAt"
        :questions="session.questions"
        :answers="session.answers"
        :is-locked="false"
        answer-label="student"
      >
        <template #ai-summary>
          <Card
            v-if="session.aiSummary"
            class="mb-6 border-purple-200 bg-purple-50/50 dark:border-purple-900 dark:bg-purple-950/20"
          >
            <CardHeader class="pb-2">
              <CardTitle
                class="flex items-center gap-2 text-sm font-medium text-purple-700 dark:text-purple-300"
              >
                <BotMessageSquare class="size-4" />
                {{ t.admin.studentSessionResult.aiSummary }}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                class="text-sm leading-relaxed"
                v-html="parseSimpleMarkdown(session.aiSummary)"
              />
            </CardContent>
          </Card>
        </template>
      </SessionResultContent>
    </template>

    <!-- Empty State -->
    <div v-else-if="!isLoading" class="py-12 text-center">
      <p class="text-muted-foreground">{{ t.admin.studentSessionResult.sessionNotFound }}</p>
      <Button class="mt-4" @click="goBack">{{ t.admin.studentSessionResult.goBack }}</Button>
    </div>
  </div>
</template>
