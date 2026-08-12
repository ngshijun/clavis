<script setup lang="ts">
import { computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAdminStudentsStore } from '@/stores/admin-students'
import {
  useAdminStudentStatsStore,
  type StudentPracticeSession,
} from '@/stores/admin-student-stats'
import { createPracticeHistoryColumns } from '@/lib/statisticsColumns'
import { useStatisticsPage } from '@/composables/useStatisticsPage'
import StatisticsFilterBar from '@/components/statistics/StatisticsFilterBar.vue'
import StatisticsSummaryCards from '@/components/statistics/StatisticsSummaryCards.vue'
import StudentInfoTab from '@/components/admin/StudentInfoTab.vue'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from 'vue-sonner'
import { DataTable } from '@/components/ui/data-table'
import { Button } from '@/components/ui/button'
import { BookOpen, History, Loader2, ArrowLeft, User } from 'lucide-vue-next'
import { useT } from '@/composables/useT'

const t = useT()
const route = useRoute()
const router = useRouter()
const adminStudentsStore = useAdminStudentsStore()
const adminStatsStore = useAdminStudentStatsStore()

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
      const statsResult = await adminStatsStore.fetchStudentStatistics(studentId.value)
      if (statsResult.error) toast.error(statsResult.error)
    }
  } catch (err) {
    console.error('Failed to load statistics:', err)
    toast.error(t.value.admin.studentStatistics.toastLoadFailed)
  }
})

// Reset filters when student changes
watch(studentId, async (newStudentId) => {
  adminStatsStore.resetStatisticsFilters()
  if (newStudentId) {
    await adminStatsStore.fetchStudentStatistics(newStudentId)
  }
})

// Filter/sort orchestration shared with the student statistics page.
const {
  hideInProgress,
  availableGradeLevels,
  availableSubjects,
  availableTopics,
  availableSubTopics,
  displayedSessions,
  averageScore,
  totalSessions,
  totalStudyTime,
  subTopicsPracticed,
} = useStatisticsPage(adminStatsStore, studentId)

const columns = computed(() => createPracticeHistoryColumns<StudentPracticeSession>())

function handleRowClick(row: StudentPracticeSession) {
  if (row.status === 'completed') {
    router.push(`/admin/students/${studentId.value}/session/${row.id}`)
  }
}

function goBack() {
  router.push('/admin/students')
}
</script>

<template>
  <div class="space-y-6 p-6">
    <!-- Header -->
    <div>
      <Button variant="ghost" size="sm" class="mb-4" @click="goBack">
        <ArrowLeft class="mr-2 size-4" />
        {{ t.admin.studentStatistics.backToStudents }}
      </Button>

      <h1 class="text-2xl font-bold">{{ t.admin.studentStatistics.title }}</h1>
      <p class="text-muted-foreground">{{ t.admin.studentStatistics.subtitle }}</p>
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
          {{ t.admin.studentStatistics.tabInfo }}
        </TabsTrigger>
        <TabsTrigger value="practice">
          <History class="mr-1.5 size-4" />
          {{ t.admin.studentStatistics.tabPractice }}
        </TabsTrigger>
      </TabsList>

      <!-- Student Info Tab -->
      <TabsContent value="info">
        <StudentInfoTab :student="student" />
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
                {{ t.admin.studentStatistics.practiceHistoryTitle }}
              </CardTitle>
              <CardDescription>{{ t.admin.studentStatistics.practiceHistoryDesc }}</CardDescription>
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
                  {{ t.admin.studentStatistics.noSessionsFound }}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </TabsContent>
    </Tabs>
  </div>
</template>
