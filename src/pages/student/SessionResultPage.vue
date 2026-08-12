<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePracticeStore } from '@/stores/practice'
import { usePracticeHistoryStore } from '@/stores/practice-history'
import type { PracticeSession } from '@/lib/practiceHelpers'
import { useT } from '@/composables/useT'
import { parseSimpleMarkdown } from '@/lib/utils'
import { buildSessionSummary, type SummarizableSession } from '@/lib/sessionResult'
import SessionResultContent from '@/components/session/SessionResultContent.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Loader2, BotMessageSquare, RefreshCw, AlertCircle } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const practiceStore = usePracticeStore()
const historyStore = usePracticeHistoryStore()
const t = useT()

const sessionId = computed(() => route.params.sessionId as string)
const session = ref<PracticeSession | null>(null)
const isLoading = ref(true)

const aiSummaryStatus = ref<'idle' | 'loading' | 'success' | 'failed'>('idle')
const isCurrentSession = ref(false)

// buildSessionSummary reads only questions.length / answers[].isCorrect; PracticeSession's
// richer questions[] is structurally a superset, so cast to the helper's minimal shape.
const summary = computed(() =>
  session.value ? buildSessionSummary(session.value as SummarizableSession) : null,
)

onMounted(async () => {
  const result = await historyStore.getSessionById(sessionId.value)

  if (result.session) {
    session.value = result.session

    isCurrentSession.value = practiceStore.currentSession?.id === result.session.id

    if (result.session.aiSummary) {
      aiSummaryStatus.value = 'success'
    } else if (isCurrentSession.value) {
      generateAiSummary()
    }
  } else {
    router.replace('/student/statistics')
  }
  isLoading.value = false
})

function goBack() {
  router.back()
}

function goToHistory() {
  router.push('/student/statistics')
}

async function generateAiSummary() {
  if (!session.value || aiSummaryStatus.value === 'loading') return

  aiSummaryStatus.value = 'loading'
  const { summary, error } = await practiceStore.generateSessionSummary(session.value.id)

  if (error || !summary) {
    aiSummaryStatus.value = 'failed'
    return
  }

  session.value.aiSummary = summary
  aiSummaryStatus.value = 'success'
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
          {{ t.student.sessionResult.back }}
        </Button>

        <div class="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 class="text-2xl font-bold">{{ t.student.sessionResult.title }}</h1>
            <p class="text-muted-foreground">
              {{ session.subjectName }} - {{ session.topicName }} | {{ session.gradeLevelName }}
            </p>
          </div>
        </div>
      </div>

      <SessionResultContent
        :summary="summary"
        :completed-at="session.completedAt"
        :questions="session.questions"
        :answers="session.answers"
        answer-label="self"
      >
        <template #ai-summary>
          <Card
            class="mb-6 border-purple-200 bg-purple-50/50 dark:border-purple-900 dark:bg-purple-950/20"
          >
            <CardHeader class="pb-2">
              <CardTitle
                class="flex items-center justify-between text-sm font-medium text-purple-700 dark:text-purple-300"
              >
                <div class="flex items-center gap-2">
                  <BotMessageSquare class="size-4" />
                  {{ t.student.sessionResult.aiSummaryTitle }}
                </div>
                <Button
                  v-if="!session.aiSummary && aiSummaryStatus !== 'loading'"
                  variant="outline"
                  size="sm"
                  class="h-7 text-xs"
                  @click="generateAiSummary"
                >
                  <RefreshCw class="mr-1 size-3" />
                  {{
                    aiSummaryStatus === 'failed'
                      ? t.student.sessionResult.aiSummaryRetry
                      : t.student.sessionResult.aiSummaryGenerate
                  }}
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                v-if="aiSummaryStatus === 'loading'"
                class="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <Loader2 class="size-4 animate-spin" />
                {{ t.student.sessionResult.aiSummaryGenerating }}
              </div>
              <div
                v-else-if="session.aiSummary"
                class="text-sm leading-relaxed"
                v-html="parseSimpleMarkdown(session.aiSummary)"
              />
              <div
                v-else-if="aiSummaryStatus === 'failed' && isCurrentSession"
                class="flex items-center gap-2 text-sm text-muted-foreground"
              >
                <AlertCircle class="size-4 text-red-500" />
                {{ t.student.sessionResult.aiSummaryFailed }}
              </div>
              <div v-else class="text-sm text-muted-foreground">
                {{ t.student.sessionResult.aiSummaryEmpty }}
              </div>
            </CardContent>
          </Card>
        </template>
      </SessionResultContent>
    </template>

    <!-- Empty State -->
    <div v-else class="py-12 text-center">
      <p class="text-muted-foreground">{{ t.student.sessionResult.sessionNotFound }}</p>
      <Button class="mt-4" @click="goToHistory">{{
        t.student.sessionResult.goToStatistics
      }}</Button>
    </div>
  </div>
</template>
