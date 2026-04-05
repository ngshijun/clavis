<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAdminStudentsStore } from '@/stores/admin-students'
import {
  useAdminStudentStatsStore,
  type StudentPracticeSession,
} from '@/stores/admin-student-stats'
import { useAdminStudentEngagementStore } from '@/stores/admin-student-engagement'
import { usePetsStore } from '@/stores/pets'
import { resolveFilterValue, createPracticeHistoryColumns } from '@/lib/statisticsColumns'
import { useStatisticsSummary } from '@/composables/useStatisticsSummary'
import StatisticsFilterBar from '@/components/statistics/StatisticsFilterBar.vue'
import StatisticsSummaryCards from '@/components/statistics/StatisticsSummaryCards.vue'
import StudentInfoTab from '@/components/admin/StudentInfoTab.vue'
import StudentSubscriptionTab from '@/components/admin/StudentSubscriptionTab.vue'
import StudentPetCollectionTab from '@/components/admin/StudentPetCollectionTab.vue'
import StudentDailyStatusTab from '@/components/admin/StudentDailyStatusTab.vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'vue-sonner'
import { DataTable } from '@/components/ui/data-table'
import { Button } from '@/components/ui/button'
import {
  BookOpen,
  History,
  Calendar,
  Loader2,
  ArrowLeft,
  User,
  CreditCard,
  PawPrint,
} from 'lucide-vue-next'

const route = useRoute()
const router = useRouter()
const adminStudentsStore = useAdminStudentsStore()
const adminStatsStore = useAdminStudentStatsStore()
const adminEngagementStore = useAdminStudentEngagementStore()
const petsStore = usePetsStore()

const studentId = computed(() => route.params.studentId as string)

// Get student info
const student = computed(() => adminStudentsStore.getStudentById(studentId.value))

// Fetch data on mount
onMounted(async () => {
  try {
    if (adminStudentsStore.students.length === 0) {
      await adminStudentsStore.fetchAllStudents()
    }
    if (studentId.value) {
      const [statsResult, engagementResult] = await Promise.all([
        adminStatsStore.fetchStudentStatistics(studentId.value),
        adminEngagementStore.fetchStudentEngagement(studentId.value),
        petsStore.allPets.length === 0
          ? petsStore.fetchAllPets()
          : Promise.resolve({ error: null }),
      ])
      if (statsResult.error) toast.error(statsResult.error)
      if (engagementResult.error) toast.error(engagementResult.error)
    }
  } catch (err) {
    console.error('Failed to load statistics:', err)
    toast.error('Failed to load statistics')
  }
})

const hideInProgress = ref(false)

// Reset filters when student changes
watch(studentId, async (newStudentId) => {
  adminStatsStore.resetStatisticsFilters()
  if (newStudentId) {
    await adminStatsStore.fetchStudentStatistics(newStudentId)
  }
})

// Convert ALL_VALUE sentinel to undefined for store filter calls
const gradeLevelFilter = computed(() =>
  resolveFilterValue(adminStatsStore.statisticsFilters.gradeLevel),
)
const subjectFilter = computed(() => resolveFilterValue(adminStatsStore.statisticsFilters.subject))
const topicFilter = computed(() => resolveFilterValue(adminStatsStore.statisticsFilters.topic))
const subTopicFilter = computed(() =>
  resolveFilterValue(adminStatsStore.statisticsFilters.subTopic),
)

// Get available filter options
const availableGradeLevels = computed(() => {
  if (!studentId.value) return []
  return adminStatsStore.getGradeLevels(studentId.value)
})
const availableSubjects = computed(() => {
  if (!studentId.value) return []
  return adminStatsStore.getSubjects(studentId.value, gradeLevelFilter.value)
})
const availableTopics = computed(() => {
  if (!studentId.value) return []
  return adminStatsStore.getTopics(studentId.value, gradeLevelFilter.value, subjectFilter.value)
})
const availableSubTopics = computed(() => {
  if (!studentId.value) return []
  return adminStatsStore.getSubTopics(
    studentId.value,
    gradeLevelFilter.value,
    subjectFilter.value,
    topicFilter.value,
  )
})

// Get filtered sessions
const filteredSessions = computed(() => {
  if (!studentId.value) return []
  return adminStatsStore.getFilteredSessions(
    studentId.value,
    gradeLevelFilter.value,
    subjectFilter.value,
    topicFilter.value,
    subTopicFilter.value,
    adminStatsStore.statisticsFilters.dateRange,
  )
})

// Statistics computed values (only from completed sessions)
const { averageScore, totalSessions, totalStudyTime, subTopicsPracticed } =
  useStatisticsSummary(filteredSessions)

// Get recent sessions for table
const recentSessions = computed(() => {
  return [...filteredSessions.value].sort((a, b) => {
    const aCompleted = !!a.completedAt
    const bCompleted = !!b.completedAt
    if (!aCompleted && bCompleted) return -1
    if (aCompleted && !bCompleted) return 1
    if (!aCompleted && !bCompleted) {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    }
    return new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime()
  })
})

// Table data with optional in-progress filtering
const displayedSessions = computed(() => {
  if (hideInProgress.value) {
    return recentSessions.value.filter((s) => s.status === 'completed')
  }
  return recentSessions.value
})

const columns = createPracticeHistoryColumns<StudentPracticeSession>()

function handleRowClick(row: StudentPracticeSession) {
  if (row.status === 'completed') {
    router.push(`/admin/students/${studentId.value}/session/${row.id}`)
  }
}

function goBack() {
  router.push('/admin/students')
}

// Engagement data
const engagement = computed(() =>
  studentId.value ? adminEngagementStore.getStudentEngagement(studentId.value) : undefined,
)

const totalOwnedPets = computed(() => engagement.value?.ownedPets.length ?? 0)
const totalPets = computed(() => petsStore.allPets.length)
</script>

<template>
  <div class="space-y-6 p-6">
    <!-- Header -->
    <div>
      <Button variant="ghost" size="sm" class="mb-4" @click="goBack">
        <ArrowLeft class="mr-2 size-4" />
        Back to Students
      </Button>

      <h1 class="text-2xl font-bold">Student Statistics</h1>
      <p class="text-muted-foreground">View practice history and performance</p>
    </div>

    <!-- Loading State -->
    <div v-if="adminStatsStore.isLoadingStatistics" class="flex items-center justify-center py-16">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <!-- Tabbed Sections -->
    <Tabs v-if="student" default-value="info">
      <TabsList class="w-full">
        <TabsTrigger value="info">
          <User class="mr-1.5 size-4" />
          Student Info
        </TabsTrigger>
        <TabsTrigger value="practice">
          <History class="mr-1.5 size-4" />
          Practice History
        </TabsTrigger>
        <TabsTrigger v-if="engagement?.subscription" value="subscription">
          <CreditCard class="mr-1.5 size-4" />
          Subscription
        </TabsTrigger>
        <TabsTrigger v-if="engagement" value="pets">
          <PawPrint class="mr-1.5 size-4" />
          Pets ({{ totalOwnedPets }}/{{ totalPets }})
        </TabsTrigger>
        <TabsTrigger v-if="engagement" value="mood">
          <Calendar class="mr-1.5 size-4" />
          Daily Status
        </TabsTrigger>
      </TabsList>

      <!-- Student Info Tab -->
      <TabsContent value="info">
        <StudentInfoTab :student="student" :engagement="engagement" />
      </TabsContent>

      <!-- Practice History Tab -->
      <TabsContent value="practice">
        <div v-if="!adminStatsStore.isLoadingStatistics" class="space-y-6">
          <!-- Filters Row -->
          <StatisticsFilterBar
            :date-range="adminStatsStore.statisticsFilters.dateRange"
            :grade-level="adminStatsStore.statisticsFilters.gradeLevel"
            :subject="adminStatsStore.statisticsFilters.subject"
            :topic="adminStatsStore.statisticsFilters.topic"
            :sub-topic="adminStatsStore.statisticsFilters.subTopic"
            :available-grade-levels="availableGradeLevels"
            :available-subjects="availableSubjects"
            :available-topics="availableTopics"
            :available-sub-topics="availableSubTopics"
            :hide-in-progress="hideInProgress"
            @update:date-range="adminStatsStore.setStatisticsDateRange($event)"
            @update:grade-level="adminStatsStore.setStatisticsGradeLevel($event)"
            @update:subject="adminStatsStore.setStatisticsSubject($event)"
            @update:topic="adminStatsStore.setStatisticsTopic($event)"
            @update:sub-topic="adminStatsStore.setStatisticsSubTopic($event)"
            @update:hide-in-progress="hideInProgress = $event"
          />

          <!-- Statistics Cards -->
          <StatisticsSummaryCards
            v-if="studentId"
            :average-score="averageScore"
            :total-sessions="totalSessions"
            :total-study-time="totalStudyTime"
            :sub-topics-practiced="subTopicsPracticed"
          />

          <!-- Practice History Table -->
          <Card v-if="studentId">
            <CardHeader>
              <CardTitle class="flex items-center gap-2">
                <History class="size-5" />
                Practice History
              </CardTitle>
              <CardDescription>View all practice sessions and scores.</CardDescription>
            </CardHeader>
            <CardContent>
              <DataTable
                v-if="displayedSessions.length > 0"
                :columns="columns"
                :data="displayedSessions"
                :on-row-click="handleRowClick"
                :initial-sorting="[{ id: 'completedAt', desc: true }]"
                :page-index="adminStatsStore.statisticsPagination.pageIndex"
                :page-size="adminStatsStore.statisticsPagination.pageSize"
                :on-page-index-change="adminStatsStore.setStatisticsPageIndex"
                :on-page-size-change="adminStatsStore.setStatisticsPageSize"
              />
              <div v-else class="py-12 text-center">
                <BookOpen class="mx-auto size-12 text-muted-foreground/50" />
                <p class="mt-2 text-muted-foreground">
                  No practice sessions found for the selected filters.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <!-- Subscription Tab -->
      <TabsContent v-if="engagement?.subscription" value="subscription">
        <StudentSubscriptionTab :subscription="engagement.subscription" />
      </TabsContent>

      <!-- Pet Collection Tab -->
      <TabsContent v-if="engagement" value="pets">
        <StudentPetCollectionTab
          :owned-pets="engagement.ownedPets"
          :selected-pet-id="engagement.selectedPetId"
          :total-pets="totalPets"
        />
      </TabsContent>

      <!-- Mood History Tab -->
      <TabsContent v-if="engagement" value="mood">
        <StudentDailyStatusTab :student-id="studentId" />
      </TabsContent>
    </Tabs>
  </div>
</template>
