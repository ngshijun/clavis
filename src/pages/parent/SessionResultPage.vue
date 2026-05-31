<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useT } from '@/composables/useT'
import { useRoute, useRouter } from 'vue-router'
import {
  useChildStatisticsStore,
  type ChildPracticeSessionFull,
  type ChildSubscriptionStatus,
} from '@/stores/child-statistics'
import { useChildLinkStore } from '@/stores/child-link'
import { parseSimpleMarkdown } from '@/lib/utils'
import { buildSessionSummary, type SummarizableSession } from '@/lib/sessionResult'
import { canViewAiSummary } from '@/lib/tierConfig'
import SessionResultContent from '@/components/session/SessionResultContent.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ArrowLeft, Loader2, Sparkles, BotMessageSquare, Crown } from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const childStatisticsStore = useChildStatisticsStore()
const childLinkStore = useChildLinkStore()

const t = useT()
const childId = computed(() => route.params.childId as string)
const sessionId = computed(() => route.params.sessionId as string)

const child = computed(() => {
  return childLinkStore.linkedChildren.find((c) => c.id === childId.value)
})

const session = ref<ChildPracticeSessionFull | null>(null)
const isLoading = ref(true)
const error = ref<string | null>(null)
const subscriptionRequired = ref(false)
const childSubscription = ref<ChildSubscriptionStatus | null>(null)

const summary = computed(() =>
  session.value ? buildSessionSummary(session.value as SummarizableSession) : null,
)

// AI summary entitlement (Pro and above) — single source of truth in tierConfig.
const canSeeAiSummary = computed(() =>
  childSubscription.value ? canViewAiSummary(childSubscription.value.tier) : false,
)

onMounted(async () => {
  // Ensure children are loaded for name display (guard is non-blocking)
  if (childLinkStore.linkedChildren.length === 0 && !childLinkStore.isLoading) {
    childLinkStore.fetchLinkedChildren()
  }

  const [result, subStatus] = await Promise.all([
    childStatisticsStore.getSessionById(childId.value, sessionId.value),
    childStatisticsStore.getChildSubscriptionStatus(childId.value),
  ])
  childSubscription.value = subStatus
  if (result.session) {
    session.value = result.session
  }
  subscriptionRequired.value = result.subscriptionRequired ?? false
  if (!result.session && !result.subscriptionRequired) {
    error.value = result.error
    router.replace('/parent/statistics')
  }
  isLoading.value = false
})

function goBack() {
  router.back()
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
          {{ t.parent.sessionResult.back }}
        </Button>

        <h1 class="text-2xl font-bold">{{ t.parent.sessionResult.title }}</h1>
        <p v-if="child" class="text-muted-foreground">
          {{ child.name }} - {{ session.subjectName }} - {{ session.topicName }} |
          {{ session.gradeLevelName }}
        </p>
      </div>

      <SessionResultContent
        :summary="summary"
        :completed-at="session.completedAt"
        :questions="session.questions"
        :answers="session.answers"
        :is-locked="subscriptionRequired"
        answer-label="self"
      >
        <template #ai-summary>
          <Card
            class="mb-6 border-purple-200 bg-purple-50/50 dark:border-purple-900 dark:bg-purple-950/20"
          >
            <CardHeader class="pb-2">
              <CardTitle
                class="flex items-center gap-2 text-sm font-medium text-purple-700 dark:text-purple-300"
              >
                <BotMessageSquare class="size-4" />
                {{ t.parent.sessionResult.aiSummaryTitle }}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div
                v-if="!canSeeAiSummary"
                class="flex items-center gap-3 text-sm text-muted-foreground"
              >
                <Crown class="size-5 text-amber-500" />
                <span>{{ t.parent.sessionResult.upgradeToProHint('Pro') }}</span>
              </div>
              <div
                v-else-if="session.aiSummary"
                class="text-sm leading-relaxed"
                v-html="parseSimpleMarkdown(session.aiSummary)"
              />
              <div v-else class="text-sm text-muted-foreground">
                {{ t.parent.sessionResult.noAiSummary }}
              </div>
            </CardContent>
          </Card>
        </template>

        <template #locked-message>
          <p class="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {{ t.parent.sessionResult.lockedMessage }}
          </p>
          <Button class="mt-4" @click="router.push('/parent/subscription')">
            <Sparkles class="mr-2 size-4" />
            {{ t.parent.sessionResult.upgradePlan }}
          </Button>
        </template>
      </SessionResultContent>
    </template>

    <!-- Empty State -->
    <div v-else-if="!isLoading" class="py-12 text-center">
      <p class="text-muted-foreground">{{ t.parent.sessionResult.sessionNotFound }}</p>
      <Button class="mt-4" @click="goBack">{{ t.parent.sessionResult.goBack }}</Button>
    </div>
  </div>
</template>
