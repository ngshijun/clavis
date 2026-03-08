<script setup lang="ts">
import { computed } from 'vue'
import { useAdminDashboardStore, type TierDistribution } from '@/stores/admin-dashboard'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  componentToString,
  type ChartConfig,
} from '@/components/ui/chart'
import { Donut } from '@unovis/ts'
import { VisSingleContainer, VisDonut } from '@unovis/vue'
import { PieChart } from 'lucide-vue-next'

const dashboardStore = useAdminDashboardStore()

const chartData = computed(() => {
  return dashboardStore.stats.tierDistribution.map((d) => ({
    ...d,
    fill: `var(--color-${d.tier})`,
  }))
})
type Data = (typeof chartData.value)[number]

const totalStudents = computed(() => {
  return chartData.value.reduce((sum, d) => sum + d.count, 0)
})

const chartConfig = {
  count: {
    label: 'Students',
    color: undefined,
  },
  core: {
    label: 'Core',
    color: 'var(--chart-4)',
  },
  plus: {
    label: 'Plus',
    color: 'var(--chart-1)',
  },
  pro: {
    label: 'Pro',
    color: 'var(--chart-2)',
  },
} satisfies ChartConfig
</script>

<template>
  <Card class="flex h-full flex-col">
    <CardHeader class="items-center pb-0">
      <div class="flex w-full flex-row items-center justify-between">
        <CardTitle class="text-sm font-medium">Subscription Tiers</CardTitle>
        <PieChart class="size-4 text-muted-foreground" />
      </div>
      <CardDescription>Distribution of active subscriptions</CardDescription>
    </CardHeader>
    <CardContent class="flex-1 pb-0">
      <div v-if="chartData.length === 0" class="flex h-full items-center justify-center">
        <p class="text-sm text-muted-foreground">No active subscriptions</p>
      </div>
      <ChartContainer
        v-else
        :config="chartConfig"
        class="mx-auto aspect-square max-h-[200px]"
        :style="{
          '--vis-donut-central-label-font-size': 'var(--text-3xl)',
          '--vis-donut-central-label-font-weight': 'var(--font-weight-bold)',
          '--vis-donut-central-label-text-color': 'var(--foreground)',
          '--vis-donut-central-sub-label-text-color': 'var(--muted-foreground)',
        }"
      >
        <VisSingleContainer :data="chartData" :margin="{ top: 5, bottom: 5, left: 5, right: 5 }">
          <VisDonut
            :value="(d: Data) => d.count"
            :color="(d: Data) => chartConfig[d.tier as keyof typeof chartConfig]?.color"
            :arc-width="30"
            :show-empty-segments="true"
            :central-label="totalStudents.toLocaleString()"
            central-sub-label="Students"
            :central-label-offset-y="10"
          />
          <ChartTooltip
            :triggers="{
              [Donut.selectors.segment]: componentToString(chartConfig, ChartTooltipContent, {
                hideLabel: true,
              })!,
            }"
          />
        </VisSingleContainer>
      </ChartContainer>
    </CardContent>
    <CardFooter class="flex-col gap-2 text-sm">
      <div class="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
        <div v-for="item in chartData" :key="item.tier" class="flex items-center gap-1.5 text-xs">
          <div
            class="size-2 shrink-0 rounded-[2px]"
            :style="{ backgroundColor: chartConfig[item.tier as keyof typeof chartConfig]?.color }"
          />
          <span class="text-muted-foreground">{{
            chartConfig[item.tier as keyof typeof chartConfig]?.label
          }}</span>
          <span class="font-medium">{{ item.count }}</span>
        </div>
      </div>
    </CardFooter>
  </Card>
</template>
