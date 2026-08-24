<script setup lang="ts">
import { onMounted } from 'vue'
import { useAdminDashboardStore } from '@/stores/admin-dashboard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import StatTile from '@/components/dashboard/StatTile.vue'
import {
  Activity,
  BookOpen,
  Building2,
  ClipboardList,
  GraduationCap,
  Loader2,
  Ticket,
} from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { formatTimeAgo } from '@/lib/date'
import { useT } from '@/composables/useT'

const t = useT()

const dashboardStore = useAdminDashboardStore()

onMounted(async () => {
  const { error } = await dashboardStore.fetchStats()
  if (error) {
    toast.error(t.value.admin.dashboard.toastLoadFailed)
  }
})

function formatActivity(dateString: string | null): string {
  if (!dateString) return t.value.admin.dashboard.noActivity
  return formatTimeAgo(dateString, t.value.shared.timeAgo)
}
</script>

<template>
  <div class="p-6">
    <!-- Loading State -->
    <div v-if="dashboardStore.isLoading" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <div v-else-if="dashboardStore.totals" class="space-y-8">
      <!-- Platform totals (seat/usage counter, decision 34) -->
      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatTile
          :label="t.admin.dashboard.organizations"
          :value="dashboardStore.totals.orgCount"
          :icon="Building2"
          :subtitle="t.admin.dashboard.organizationsOnPlatform"
        />
        <StatTile
          :label="t.admin.dashboard.seatsInUse"
          :value="dashboardStore.totals.studentCount"
          :icon="Ticket"
          :subtitle="t.admin.dashboard.seatsHint"
        />
        <StatTile
          :label="t.admin.dashboard.teachers"
          :value="dashboardStore.totals.teacherCount"
          :icon="GraduationCap"
          :subtitle="t.admin.dashboard.teachersHint(dashboardStore.totals.managerCount)"
        />
        <StatTile
          :label="t.admin.dashboard.assessments"
          :value="dashboardStore.totals.assessmentCount"
          :icon="ClipboardList"
          :subtitle="t.admin.dashboard.assessmentsHint(dashboardStore.totals.classroomCount)"
        />
        <StatTile
          :label="t.admin.dashboard.activeStudentsToday"
          :value="dashboardStore.today.activeStudentsToday"
          :icon="Activity"
          :subtitle="t.admin.dashboard.studentsPractisedToday"
        />
        <StatTile
          :label="t.admin.dashboard.practiceSessionsToday"
          :value="dashboardStore.today.practiceSessionsToday"
          :icon="BookOpen"
          :subtitle="t.admin.dashboard.sessionsStartedToday"
        />
      </div>

      <!-- Per-organization seat/usage overview -->
      <Card>
        <CardHeader>
          <CardTitle>{{ t.admin.dashboard.overviewTitle }}</CardTitle>
          <p class="text-sm text-muted-foreground">{{ t.admin.dashboard.overviewSubtitle }}</p>
        </CardHeader>
        <CardContent>
          <div v-if="dashboardStore.orgOverview.length === 0" class="py-10 text-center">
            <Building2 class="mx-auto size-12 text-muted-foreground/50" />
            <p class="mt-3 text-muted-foreground">{{ t.admin.dashboard.noOrganizations }}</p>
          </div>

          <div v-else class="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{{ t.admin.dashboard.orgCol }}</TableHead>
                  <TableHead class="text-right">{{ t.admin.dashboard.managersCol }}</TableHead>
                  <TableHead class="text-right">{{ t.admin.dashboard.teachersCol }}</TableHead>
                  <TableHead class="text-right">{{ t.admin.dashboard.seatsCol }}</TableHead>
                  <TableHead class="text-right">{{ t.admin.dashboard.classesCol }}</TableHead>
                  <TableHead class="text-right">{{ t.admin.dashboard.assessmentsCol }}</TableHead>
                  <TableHead>{{ t.admin.dashboard.lastActivityCol }}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow v-for="org in dashboardStore.orgOverview" :key="org.organizationId">
                  <TableCell class="font-medium">{{ org.organizationName }}</TableCell>
                  <TableCell class="text-right tabular-nums">{{ org.managerCount }}</TableCell>
                  <TableCell class="text-right tabular-nums">{{ org.teacherCount }}</TableCell>
                  <TableCell class="text-right tabular-nums">{{ org.studentCount }}</TableCell>
                  <TableCell class="text-right tabular-nums">{{ org.classroomCount }}</TableCell>
                  <TableCell class="text-right tabular-nums">{{ org.assessmentCount }}</TableCell>
                  <TableCell class="text-muted-foreground">
                    {{ formatActivity(org.lastActivityAt) }}
                  </TableCell>
                </TableRow>
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell class="font-medium">{{ t.admin.dashboard.totalsRow }}</TableCell>
                  <TableCell class="text-right tabular-nums">
                    {{ dashboardStore.totals.managerCount }}
                  </TableCell>
                  <TableCell class="text-right tabular-nums">
                    {{ dashboardStore.totals.teacherCount }}
                  </TableCell>
                  <TableCell class="text-right tabular-nums">
                    {{ dashboardStore.totals.studentCount }}
                  </TableCell>
                  <TableCell class="text-right tabular-nums">
                    {{ dashboardStore.totals.classroomCount }}
                  </TableCell>
                  <TableCell class="text-right tabular-nums">
                    {{ dashboardStore.totals.assessmentCount }}
                  </TableCell>
                  <TableCell class="text-muted-foreground">
                    {{ formatActivity(dashboardStore.totals.lastActivityAt) }}
                  </TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
