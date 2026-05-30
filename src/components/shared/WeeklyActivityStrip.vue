<script setup lang="ts">
import fireGif from '@/assets/icons/fire.gif'
import type { WeekDay } from '@/composables/useStudentProfileDialog'

defineProps<{
  currentStreak: number
  weeklyActivity: WeekDay[]
  daysLabel: string
}>()
</script>

<template>
  <div class="flex items-center gap-3">
    <div class="flex size-14 items-center justify-center">
      <img v-if="currentStreak > 0" :src="fireGif" alt="fire" class="size-10" />
      <span v-else class="text-4xl">&#x1F4A4;</span>
    </div>
    <div>
      <p class="text-2xl font-bold">
        {{ currentStreak }}
        <span class="text-sm font-normal text-muted-foreground">{{ daysLabel }}</span>
      </p>
    </div>
  </div>
  <!-- Weekly Activity Dots -->
  <div v-if="weeklyActivity.length > 0" class="mt-4 flex items-center justify-between gap-1">
    <div
      v-for="(day, i) in weeklyActivity"
      :key="i"
      class="flex flex-1 flex-col items-center gap-1"
    >
      <div
        class="size-5 rounded-full border"
        :class="[
          day.active
            ? 'border-orange-400 bg-orange-400 dark:border-orange-500 dark:bg-orange-500'
            : day.isFuture
              ? 'border-dashed border-gray-300 dark:border-gray-700'
              : 'border-gray-300 bg-gray-100 dark:border-gray-700 dark:bg-muted',
          day.isToday && !day.active ? 'border-orange-300 dark:border-orange-700' : '',
        ]"
      />
      <span
        class="text-[10px] leading-none"
        :class="
          day.isToday ? 'font-bold text-orange-600 dark:text-orange-400' : 'text-muted-foreground'
        "
      >
        {{ day.label }}
      </span>
    </div>
  </div>
</template>
