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
  subTopic: string
  availableTopics: string[]
  availableSubTopics: string[]
}>()

const emit = defineEmits<{
  'update:dateRange': [value: DateRangeFilter]
  'update:topic': [value: string]
  'update:subTopic': [value: string]
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

    <!-- Sub-Topic Selector -->
    <Select
      :key="languageStore.language"
      :model-value="subTopic"
      :disabled="topic === ALL_VALUE"
      @update:model-value="emit('update:subTopic', $event as string)"
    >
      <SelectTrigger class="w-[150px]">
        <SelectValue :placeholder="t.shared.statsFilterBar.allSubTopics" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem :value="ALL_VALUE">{{ t.shared.statsFilterBar.allSubTopics }}</SelectItem>
        <SelectItem v-for="st in availableSubTopics" :key="st" :value="st">
          {{ st }}
        </SelectItem>
      </SelectContent>
    </Select>
  </div>
</template>
