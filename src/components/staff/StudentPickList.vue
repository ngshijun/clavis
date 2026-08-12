<script setup lang="ts">
import { ref, computed } from 'vue'
import { Search } from 'lucide-vue-next'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import type { ClassStudent } from '@/stores/classes'

/**
 * Searchable student picker used by the class-members dialog (multi-select)
 * and the assign dialog (single-select). Selection state lives in the parent.
 */
const props = defineProps<{
  students: ClassStudent[]
  /** Rows that cannot be picked (e.g. already in the class), with a badge. */
  disabledIds?: string[]
  disabledLabel?: string
  /** Single-select mode: picking a student replaces the selection. */
  single?: boolean
  searchPlaceholder: string
  emptyText: string
}>()

const selectedIds = defineModel<string[]>('selectedIds', { default: () => [] })

const search = ref('')

const disabledSet = computed(() => new Set(props.disabledIds ?? []))

const filteredStudents = computed(() => {
  const query = search.value.toLowerCase().trim()
  if (!query) return props.students
  return props.students.filter(
    (student) =>
      student.name.toLowerCase().includes(query) ||
      (student.username?.toLowerCase().includes(query) ?? false),
  )
})

function toggle(id: string) {
  if (disabledSet.value.has(id)) return
  if (props.single) {
    selectedIds.value = selectedIds.value.includes(id) ? [] : [id]
    return
  }
  selectedIds.value = selectedIds.value.includes(id)
    ? selectedIds.value.filter((selected) => selected !== id)
    : [...selectedIds.value, id]
}
</script>

<template>
  <div class="space-y-2">
    <div class="relative">
      <Search class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input v-model="search" :placeholder="searchPlaceholder" class="pl-9" />
    </div>

    <div class="max-h-64 space-y-1 overflow-y-auto rounded-md border p-1">
      <p v-if="filteredStudents.length === 0" class="p-4 text-center text-sm text-muted-foreground">
        {{ emptyText }}
      </p>
      <button
        v-for="student in filteredStudents"
        :key="student.id"
        type="button"
        class="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="disabledSet.has(student.id)"
        @click="toggle(student.id)"
      >
        <Checkbox
          class="pointer-events-none"
          :model-value="selectedIds.includes(student.id) || disabledSet.has(student.id)"
          :disabled="disabledSet.has(student.id)"
          tabindex="-1"
        />
        <span class="min-w-0 flex-1">
          <span class="block truncate font-medium">{{ student.name }}</span>
          <span class="block truncate text-xs text-muted-foreground">
            {{ [student.username, student.gradeLevelName].filter(Boolean).join(' · ') }}
          </span>
        </span>
        <span v-if="disabledSet.has(student.id)" class="shrink-0 text-xs text-muted-foreground">
          {{ disabledLabel }}
        </span>
      </button>
    </div>
  </div>
</template>
