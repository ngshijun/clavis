<script setup lang="ts">
import { onMounted } from 'vue'
import { useAdminDashboardStore } from '@/stores/admin-dashboard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Building2, Users, Activity, BookOpen, Loader2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { useT } from '@/composables/useT'

const t = useT()

const dashboardStore = useAdminDashboardStore()

onMounted(async () => {
  try {
    await dashboardStore.fetchStats()
  } catch (err) {
    console.error('Failed to load dashboard data:', err)
    toast.error(t.value.admin.dashboard.toastLoadFailed)
  }
})
</script>

<template>
  <div class="p-6">
    <div class="mb-6">
      <h1 class="text-2xl font-bold">{{ t.admin.dashboard.title }}</h1>
      <p class="text-muted-foreground">{{ t.admin.dashboard.subtitle }}</p>
    </div>

    <!-- Loading State -->
    <div v-if="dashboardStore.isLoading" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <!-- Stats Cards -->
    <div v-else-if="dashboardStore.stats" class="space-y-4">
      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <!-- Organizations Card -->
        <Card>
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">{{ t.admin.dashboard.organizations }}</CardTitle>
            <Building2 class="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">{{ dashboardStore.stats.organizations }}</div>
            <p class="text-xs text-muted-foreground">
              {{ t.admin.dashboard.organizationsOnPlatform }}
            </p>
          </CardContent>
        </Card>

        <!-- Total Users Card -->
        <Card>
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">{{ t.admin.dashboard.totalUsers }}</CardTitle>
            <Users class="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">{{ dashboardStore.stats.users.total }}</div>
            <p class="text-xs text-muted-foreground">
              {{
                t.admin.dashboard.userBreakdown(
                  dashboardStore.stats.users.students,
                  dashboardStore.stats.users.teachers,
                  dashboardStore.stats.users.managers,
                  dashboardStore.stats.users.admins,
                )
              }}
            </p>
          </CardContent>
        </Card>

        <!-- Active Students Today Card -->
        <Card>
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">{{
              t.admin.dashboard.activeStudentsToday
            }}</CardTitle>
            <Activity class="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">{{ dashboardStore.stats.activeStudentsToday }}</div>
            <p class="text-xs text-muted-foreground">
              {{ t.admin.dashboard.studentsPractisedToday }}
            </p>
          </CardContent>
        </Card>

        <!-- Practice Sessions Today Card -->
        <Card>
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">{{
              t.admin.dashboard.practiceSessionsToday
            }}</CardTitle>
            <BookOpen class="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">{{ dashboardStore.stats.practiceSessionsToday }}</div>
            <p class="text-xs text-muted-foreground">
              {{ t.admin.dashboard.sessionsStartedToday }}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
</template>
