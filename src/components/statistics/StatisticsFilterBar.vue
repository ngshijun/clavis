<script setup lang="ts">
import { computed } from 'vue'
import type { DateRangeFilter } from '@/lib/sessionFilters'
import { ALL_VALUE, getDateRangeOptions } from '@/lib/statisticsColumns'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Calendar } from 'lucide-vue-next'
import { useT } from '@/composables/useT'
import { useLanguageStore } from '@/stores/language'

const t = useT()
const languageStore = useLanguageStore()
const dateRangeOptions = computed(() => getDateRangeOptions())

defineProps<{
  dateRange: DateRangeFilter
  topic: string
  stage: string
  availableTopics: string[]
  availableStages: string[]
}>()

const emit = defineEmits<{
  'update:dateRange': [value: DateRangeFilter]
  'update:topic': [value: string]
  'update:stage': [value: string]
}>()
</script>

<template>
  <div class="flex flex-wrap items-center gap-3">
    <slot name="before" />

    <!-- Date Range Selector -->
    <Select
      :key="languageStore.language"
      :model-value="dateRange"
      @update:model-value="emit('update:dateRange', $event as DateRangeFilter)"
    >
      <SelectTrigger class="w-[140px]">
        <Calendar class="mr-2 size-4" />
        <SelectValue :placeholder="t.shared.statsFilterBar.dateRangePlaceholder" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem v-for="option in dateRangeOptions" :key="option.value" :value="option.value">
          {{ option.label }}
        </SelectItem>
      </SelectContent>
    </Select>

    <!-- Topic Selector -->
    <Select
      :key="languageStore.language"
      :model-value="topic"
      @update:model-value="emit('update:topic', $event as string)"
    >
      <SelectTrigger class="w-[140px]">
        <SelectValue :placeholder="t.shared.statsFilterBar.allTopics" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem :value="ALL_VALUE">{{ t.shared.statsFilterBar.allTopics }}</SelectItem>
        <SelectItem v-for="topicItem in availableTopics" :key="topicItem" :value="topicItem">
          {{ topicItem }}
        </SelectItem>
      </SelectContent>
    </Select>

    <!-- Stage Selector -->
    <Select
      :key="languageStore.language"
      :model-value="stage"
      :disabled="topic === ALL_VALUE"
      @update:model-value="emit('update:stage', $event as string)"
    >
      <SelectTrigger class="w-[150px]">
        <SelectValue :placeholder="t.shared.statsFilterBar.allStages" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem :value="ALL_VALUE">{{ t.shared.statsFilterBar.allStages }}</SelectItem>
        <SelectItem v-for="st in availableStages" :key="st" :value="st">
          {{ st }}
        </SelectItem>
      </SelectContent>
    </Select>
  </div>
</template>
