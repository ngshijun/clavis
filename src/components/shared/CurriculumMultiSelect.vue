<script lang="ts">
/** One heading in the picker, and the curriculum items filed under it. */
export interface CurriculumMultiSelectGroup {
  label: string
  items: { id: string; name: string }[]
}
</script>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { Check, Layers, X } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useT } from '@/composables/useT'

/**
 * Multi-select over one curriculum level, grouped by whatever the caller
 * groups it by: a generation line offers the subject's sub-topics under their
 * topics, the tag library offers topics under "grade · subject". Search
 * matches an item's name or its group's label, so typing a parent finds
 * everything under it.
 */
const props = defineProps<{
  groups: CurriculumMultiSelectGroup[]
  disabled?: boolean
  /** Button label — what picking one of these means here. */
  addLabel: string
}>()

const modelValue = defineModel<string[]>({ required: true })

const t = useT()

const isOpen = ref(false)
const search = ref('')

/** Every item with its group label, for the chips and the filter. */
const flattened = computed(() =>
  props.groups.flatMap((group) =>
    group.items.map((item) => ({ id: item.id, name: item.name, groupLabel: group.label })),
  ),
)

const selected = computed(() =>
  modelValue.value
    .map((id) => flattened.value.find((item) => item.id === id))
    .filter((item): item is NonNullable<typeof item> => item !== undefined),
)

const filteredGroups = computed(() => {
  const query = search.value.trim().toLowerCase()
  if (!query) return props.groups
  return props.groups
    .map((group) => ({
      label: group.label,
      items: group.label.toLowerCase().includes(query)
        ? group.items
        : group.items.filter((item) => item.name.toLowerCase().includes(query)),
    }))
    .filter((group) => group.items.length > 0)
})

function isSelected(id: string): boolean {
  return modelValue.value.includes(id)
}

function toggle(id: string) {
  modelValue.value = isSelected(id)
    ? modelValue.value.filter((itemId) => itemId !== id)
    : [...modelValue.value, id]
}

function remove(id: string) {
  modelValue.value = modelValue.value.filter((itemId) => itemId !== id)
}
</script>

<template>
  <div class="space-y-2">
    <div v-if="selected.length > 0" class="flex flex-wrap gap-1.5">
      <Badge v-for="item in selected" :key="item.id" variant="secondary" class="gap-1 pr-1">
        <span class="text-muted-foreground">{{ item.groupLabel }} ·</span>
        {{ item.name }}
        <button
          type="button"
          class="rounded-full p-0.5 hover:bg-muted-foreground/20"
          :disabled="props.disabled"
          :aria-label="t.shared.curriculumMultiSelect.removeItem(item.name)"
          @click="remove(item.id)"
        >
          <X class="size-3" />
        </button>
      </Badge>
    </div>

    <Popover v-model:open="isOpen">
      <PopoverTrigger as-child>
        <Button type="button" variant="outline" size="sm" :disabled="props.disabled">
          <Layers class="mr-2 size-4" />
          {{ props.addLabel }}
        </Button>
      </PopoverTrigger>
      <PopoverContent class="w-80 p-0" align="start">
        <div class="border-b p-2">
          <Input
            v-model="search"
            :placeholder="t.shared.curriculumMultiSelect.searchPlaceholder"
            class="h-8"
          />
        </div>
        <div class="max-h-64 overflow-y-auto p-1">
          <div v-for="group in filteredGroups" :key="group.label" class="mb-1">
            <p class="px-2 py-1 text-xs font-semibold text-muted-foreground">{{ group.label }}</p>
            <button
              v-for="item in group.items"
              :key="item.id"
              type="button"
              class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              @click="toggle(item.id)"
            >
              <Check
                :class="['size-4 shrink-0', isSelected(item.id) ? 'opacity-100' : 'opacity-0']"
              />
              <span class="truncate">{{ item.name }}</span>
            </button>
          </div>
          <p
            v-if="filteredGroups.length === 0"
            class="px-2 py-4 text-center text-sm text-muted-foreground"
          >
            {{ t.shared.curriculumMultiSelect.noResults }}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  </div>
</template>
