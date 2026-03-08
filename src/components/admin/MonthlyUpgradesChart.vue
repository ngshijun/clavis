<script setup lang="ts">
import { computed } from 'vue'
import { useAdminDashboardStore, type MonthlyUpgrades } from '@/stores/admin-dashboard'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartCrosshair,
  ChartTooltip,
  ChartTooltipContent,
  componentToString,
  type ChartConfig,
} from '@/components/ui/chart'
import { VisAxis, VisStackedBar, VisXYContainer } from '@unovis/vue'
import { ArrowUpCircle } from 'lucide-vue-next'

const dashboardStore = useAdminDashboardStore()

// Get monthly upgrades data
const chartData = computed<MonthlyUpgrades[]>(() => {
  return dashboardStore.stats.upgrades
})

const chartConfig = {
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
    <CardHeader class="space-y-0 pb-2">
      <div class="flex flex-row items-center justify-between">
        <CardTitle class="text-sm font-medium">Monthly Upgrades</CardTitle>
        <ArrowUpCircle class="size-4 text-muted-foreground" />
      </div>
      <CardDescription>Plan upgrades over last 12 months</CardDescription>
    </CardHeader>
    <CardContent class="flex-1">
      <ChartContainer :config="chartConfig" class="h-full max-h-[280px] w-full" cursor>
        <VisXYContainer
          :data="chartData"
          :margin="{ left: 0, right: 0 }"
          :y-domain="[0, undefined]"
        >
          <VisStackedBar
            :x="(_d: MonthlyUpgrades, i: number) => i"
            :y="[(d: MonthlyUpgrades) => d.plus, (d: MonthlyUpgrades) => d.pro]"
            :color="[chartConfig.plus.color, chartConfig.pro.color]"
            :bar-padding="0.2"
            :rounded-corners="2"
          />
          <VisAxis
            type="x"
            :x="(_d: MonthlyUpgrades, i: number) => i"
            :tick-line="false"
            :domain-line="false"
            :grid-line="false"
            :tick-values="[0, 2, 4, 6, 8, 10]"
            :tick-format="(i: number) => chartData[i]?.label?.split(' ')[0] ?? ''"
          />
          <VisAxis type="y" :num-ticks="3" :tick-line="false" :domain-line="false" />
          <ChartTooltip />
          <ChartCrosshair
            :template="
              componentToString(chartConfig, ChartTooltipContent, {
                labelFormatter(i: number | Date) {
                  const index = typeof i === 'number' ? Math.round(i) : 0
                  return chartData[index]?.label ?? ''
                },
              })
            "
            color="rgba(255, 255, 255, 0.3)"
          />
        </VisXYContainer>
      </ChartContainer>
    </CardContent>
  </Card>
</template>
