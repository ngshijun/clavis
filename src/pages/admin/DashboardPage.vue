<script setup lang="ts">
import { defineAsyncComponent, onMounted } from 'vue'
import { useAdminDashboardStore } from '@/stores/admin-dashboard'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DollarSign, Users, Activity, BookOpen, Loader2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

const MonthlyRevenueChart = defineAsyncComponent(
  () => import('@/components/admin/MonthlyRevenueChart.vue'),
)
const MonthlyUpgradesChart = defineAsyncComponent(
  () => import('@/components/admin/MonthlyUpgradesChart.vue'),
)
const SubscriptionTierChart = defineAsyncComponent(
  () => import('@/components/admin/SubscriptionTierChart.vue'),
)

const dashboardStore = useAdminDashboardStore()

onMounted(async () => {
  try {
    await dashboardStore.fetchStats()
  } catch (err) {
    console.error('Failed to load dashboard data:', err)
    toast.error('Failed to load dashboard data')
  }
})
</script>

<template>
  <div class="p-6">
    <div class="mb-6">
      <h1 class="text-2xl font-bold">Dashboard</h1>
      <p class="text-muted-foreground">Overview of your platform metrics.</p>
    </div>

    <!-- Loading State -->
    <div v-if="dashboardStore.isLoading" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <!-- Stats Cards -->
    <div v-else-if="dashboardStore.stats" class="space-y-4">
      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <!-- Revenue Card -->
        <Card>
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">Revenue This Month</CardTitle>
            <DollarSign class="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">
              {{
                dashboardStore.stats.revenue.currentMonth.toLocaleString('en-MY', {
                  style: 'currency',
                  currency: dashboardStore.stats.revenue.currency,
                })
              }}
            </div>
            <p class="text-xs text-muted-foreground">
              <span
                :class="
                  dashboardStore.stats.revenue.change.startsWith('+')
                    ? 'text-green-600'
                    : dashboardStore.stats.revenue.change.startsWith('-')
                      ? 'text-red-600'
                      : ''
                "
              >
                {{ dashboardStore.stats.revenue.change }}
              </span>
              from last month
            </p>
          </CardContent>
        </Card>

        <!-- Total Users Card -->
        <Card>
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">Total Users</CardTitle>
            <Users class="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">{{ dashboardStore.stats.users.total }}</div>
            <p class="text-xs text-muted-foreground">
              {{ dashboardStore.stats.users.students }} students,
              {{ dashboardStore.stats.users.parents }} parents,
              {{ dashboardStore.stats.users.admins }} admins
            </p>
          </CardContent>
        </Card>

        <!-- Active Students Today Card -->
        <Card>
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">Active Students Today</CardTitle>
            <Activity class="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">{{ dashboardStore.stats.activeStudentsToday }}</div>
            <p class="text-xs text-muted-foreground">Students logged in today</p>
          </CardContent>
        </Card>

        <!-- Practice Sessions Today Card -->
        <Card>
          <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle class="text-sm font-medium">Practice Sessions Today</CardTitle>
            <BookOpen class="size-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div class="text-2xl font-bold">{{ dashboardStore.stats.practiceSessionsToday }}</div>
            <p class="text-xs text-muted-foreground">Sessions started today</p>
          </CardContent>
        </Card>
      </div>

      <!-- Charts Row (1/4 width each) -->
      <div class="grid gap-4 lg:grid-cols-4">
        <div class="lg:col-span-1">
          <MonthlyRevenueChart />
        </div>
        <div class="lg:col-span-1">
          <MonthlyUpgradesChart />
        </div>
        <div class="lg:col-span-1">
          <SubscriptionTierChart />
        </div>
      </div>
    </div>
  </div>
</template>
