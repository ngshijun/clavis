<script setup lang="ts">
import { ref, computed } from 'vue'
import { Search } from 'lucide-vue-next'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'

export interface PickableMember {
  id: string
  name: string
  /** Secondary line, e.g. "username · grade" for students or an email. */
  detail: string | null
}

/**
 * Searchable person picker used by the classroom-members dialog (multi-select,
 * students and teachers) and the assign dialog (single-select). Selection
 * state lives in the parent.
 */
const props = defineProps<{
  members: PickableMember[]
  /** Rows that cannot be picked (e.g. already in the classroom), with a badge. */
  disabledIds?: string[]
  disabledLabel?: string
  /** Single-select mode: picking a member replaces the selection. */
  single?: boolean
  searchPlaceholder: string
  emptyText: string
}>()

const selectedIds = defineModel<string[]>('selectedIds', { default: () => [] })

const search = ref('')

const disabledSet = computed(() => new Set(props.disabledIds ?? []))

const filteredMembers = computed(() => {
  const query = search.value.toLowerCase().trim()
  if (!query) return props.members
  return props.members.filter(
    (member) =>
      member.name.toLowerCase().includes(query) ||
      (member.detail?.toLowerCase().includes(query) ?? false),
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
      <p v-if="filteredMembers.length === 0" class="p-4 text-center text-sm text-muted-foreground">
        {{ emptyText }}
      </p>
      <button
        v-for="member in filteredMembers"
        :key="member.id"
        type="button"
        class="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
        :disabled="disabledSet.has(member.id)"
        @click="toggle(member.id)"
      >
        <Checkbox
          class="pointer-events-none"
          :model-value="selectedIds.includes(member.id) || disabledSet.has(member.id)"
          :disabled="disabledSet.has(member.id)"
          tabindex="-1"
        />
        <span class="min-w-0 flex-1">
          <span class="block truncate font-medium">{{ member.name }}</span>
          <span v-if="member.detail" class="block truncate text-xs text-muted-foreground">
            {{ member.detail }}
          </span>
        </span>
        <span v-if="disabledSet.has(member.id)" class="shrink-0 text-xs text-muted-foreground">
          {{ disabledLabel }}
        </span>
      </button>
    </div>
  </div>
</template>
