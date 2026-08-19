<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useClassroomScopeStore } from '@/stores/classroom-scope'
import { useCurriculumStore } from '@/stores/curriculum'
import { usePracticeStore } from '@/stores/practice'
import { useStudentSubTopicStatsStore } from '@/stores/student-sub-topic-stats'
import { usePracticeProgress } from '@/composables/usePracticeProgress'
import { useT } from '@/composables/useT'
import {
  starsForScore,
  nodeStateForStats,
  recommendedNodeId,
  type LearningMapNode,
} from '@/lib/learningMap'
import { Loader2, CircleCheck, School, ArrowLeft } from 'lucide-vue-next'
import LearningMapPath from '@/components/student/LearningMapPath.vue'
import SubTopicNodeDialog from '@/components/student/SubTopicNodeDialog.vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { toast } from 'vue-sonner'

const router = useRouter()
const scope = useClassroomScopeStore()
const curriculumStore = useCurriculumStore()
const practiceStore = usePracticeStore()
const statsStore = useStudentSubTopicStatsStore()
const t = useT()
const { getTopicProgress, isTopicFullyPracticed } = usePracticeProgress()

// Navigation state (from store for persistence)
const selectedTopicId = computed({
  get: () => practiceStore.practiceNavigation.selectedTopicId,
  set: (val) => practiceStore.setPracticeTopic(val),
})
const isStartingSession = ref(false)

// Node detail dialog state
const showNodeDialog = ref(false)
const pendingSubTopicId = ref<string | null>(null)

// Fetch curriculum, sub-topic progress, and map stats on mount.
// A stats fetch failure is non-fatal: the map renders with every node
// defaulting to not-started (the store logs the error).
onMounted(async () => {
  if (curriculumStore.gradeLevels.length === 0) {
    await curriculumStore.fetchCurriculum()
  }
  await Promise.all([practiceStore.fetchSubTopicProgress(), statsStore.fetchStats()])
})

/**
 * Grade and subject both come from the selected classroom (decision 79) —
 * there is no subject picker any more, and `student_profiles.grade_level_id`
 * no longer decides what a student may practise. The page starts one level
 * deeper than it used to: topics of the classroom's subject.
 */
const selectedSubject = computed(() => {
  const { gradeLevelId, subjectId } = scope
  if (!gradeLevelId || !subjectId) return null
  const grade = curriculumStore.gradeLevels.find((g) => g.id === gradeLevelId)
  return grade?.subjects.find((s) => s.id === subjectId) ?? null
})

// Switching classroom changes the subject under us, so the remembered topic
// belongs to a different tree — drop it rather than render an empty map.
watch(
  () => scope.selectedId,
  () => practiceStore.resetPracticeNavigation(),
)

// Get selected topic
const selectedTopic = computed(() => {
  if (!selectedSubject.value || !selectedTopicId.value) return null
  return selectedSubject.value.topics.find((t) => t.id === selectedTopicId.value) ?? null
})

// Learning-map nodes for the selected topic, in path order (decision 17:
// the admin-authored `display_order` IS the path). Legacy rows may carry
// gaps or duplicate orders, so sort by displayOrder — never index into it.
const mapNodes = computed<LearningMapNode[]>(() => {
  if (!selectedTopic.value) return []
  return [...selectedTopic.value.subTopics]
    .sort((a, b) => a.displayOrder - b.displayOrder)
    .map((subTopic) => {
      const stats = statsStore.getStats(subTopic.id)
      return {
        id: subTopic.id,
        name: subTopic.name,
        questionCount: subTopic.questionCount,
        stars: stats ? starsForScore(stats.bestScorePercent) : 0,
        state: nodeStateForStats(stats),
      }
    })
})

// "Continue here" hint: first node with <1★. A highlight, never a lock.
const recommendedId = computed(() => recommendedNodeId(mapNodes.value))

// Node shown in the detail dialog
const pendingNode = computed(() => {
  if (!pendingSubTopicId.value) return null
  return mapNodes.value.find((node) => node.id === pendingSubTopicId.value) ?? null
})

const pendingStats = computed(() =>
  pendingSubTopicId.value ? statsStore.getStats(pendingSubTopicId.value) : null,
)

function getImageUrl(coverImagePath: string | null): string {
  if (!coverImagePath) return ''
  if (coverImagePath.startsWith('http')) {
    return coverImagePath
  }
  return curriculumStore.getOptimizedImageUrl(coverImagePath)
}

function selectSubTopic(subTopicId: string) {
  if (!selectedTopic.value || isStartingSession.value) return

  // Show node detail dialog
  pendingSubTopicId.value = subTopicId
  showNodeDialog.value = true
}

function goBack() {
  practiceStore.setPracticeTopic(null)
}

async function confirmStartSession() {
  if (!pendingSubTopicId.value) return

  showNodeDialog.value = false
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
        <!-- Back button — only one level to climb now (map → topic list) -->
        <Button v-if="selectedTopic" variant="ghost" size="sm" class="mb-2 -ml-2" @click="goBack">
          <ArrowLeft class="mr-2 size-4" />
          {{ selectedSubject?.name }}
        </Button>
        <h1 class="text-2xl font-bold">
          {{ selectedTopic?.name ?? selectedSubject?.name ?? t.student.practice.title }}
        </h1>
        <p class="text-muted-foreground">
          {{ selectedTopic ? t.student.practice.subtitleMap : t.student.practice.subtitleTopic }}
        </p>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="curriculumStore.isLoading" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <!-- Belongs to no classroom: nothing to practise until a manager enrols them -->
    <Card
      v-else-if="scope.hasNoClassrooms || !selectedSubject"
      class="border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 text-center dark:border-blue-800 dark:bg-card dark:from-blue-950/30 dark:to-indigo-950/30"
    >
      <CardContent class="py-8">
        <div
          class="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/50"
        >
          <School class="size-7 text-blue-500" />
        </div>
        <h3 class="text-lg font-semibold">{{ t.student.practice.noClassroom }}</h3>
        <p class="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
          {{ t.student.practice.noClassroomDesc }}
        </p>
      </CardContent>
    </Card>

    <template v-else>
      <!-- Topic Selection -->
      <div v-if="!selectedTopic">
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

      <!-- Learning map: sub-topics as stops along a winding path -->
      <div v-else>
        <LearningMapPath
          v-if="mapNodes.length > 0"
          :nodes="mapNodes"
          :recommended-id="recommendedId"
          :class="{ 'pointer-events-none opacity-60': isStartingSession }"
          @select="selectSubTopic"
        />

        <div v-else class="py-12 text-center">
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

    <!-- Node detail dialog: stars, best score, start CTA -->
    <SubTopicNodeDialog
      v-model:open="showNodeDialog"
      :node="pendingNode"
      :stats="pendingStats"
      :is-starting="isStartingSession"
      @start="confirmStartSession"
    />
  </div>
</template>
