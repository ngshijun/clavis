<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useTagsStore, normalizeTagName } from '@/stores/tags'
import { Check, Loader2, Plus, Tags, X } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { toast } from 'vue-sonner'
import { useT } from '@/composables/useT'

/**
 * Multi-select over the global learning-point tag library, with inline
 * creation for admins. Each tag names ONE learning point; new names are
 * normalized (lowercased + trimmed) before insert — the DB CHECK rejects
 * anything else. Tag writes are admin-only at RLS, so a staff picker passes
 * `allowCreate=false` and never offers what would 403.
 */
const props = withDefaults(defineProps<{ disabled?: boolean; allowCreate?: boolean }>(), {
  allowCreate: true,
})

const modelValue = defineModel<string[]>({ required: true })

const t = useT()
const tagsStore = useTagsStore()

const isOpen = ref(false)
const search = ref('')
const isCreating = ref(false)

onMounted(() => {
  if (tagsStore.tags.length === 0 && !tagsStore.isLoading) {
    tagsStore.fetchTags()
  }
})

const selectedTags = computed(() =>
  modelValue.value
    .map((id) => tagsStore.tags.find((tag) => tag.id === id))
    .filter((tag): tag is NonNullable<typeof tag> => tag !== undefined),
)

const filteredTags = computed(() => {
  const query = normalizeTagName(search.value)
  if (!query) return tagsStore.tags
  return tagsStore.tags.filter((tag) => tag.name.includes(query))
})

/** Offer "create" only for a non-empty query with no exact (normalized) match. */
const creatableName = computed(() => {
  if (!props.allowCreate) return null
  const normalized = normalizeTagName(search.value)
  if (!normalized) return null
  return tagsStore.tags.some((tag) => tag.name === normalized) ? null : normalized
})

function isSelected(id: string): boolean {
  return modelValue.value.includes(id)
}

function toggle(id: string) {
  modelValue.value = isSelected(id)
    ? modelValue.value.filter((tagId) => tagId !== id)
    : [...modelValue.value, id]
}

function remove(id: string) {
  modelValue.value = modelValue.value.filter((tagId) => tagId !== id)
}

async function handleCreate() {
  if (!creatableName.value || isCreating.value) return

  isCreating.value = true
  try {
    const { tag, error } = await tagsStore.createTag(creatableName.value)
    if (error || !tag) {
      toast.error(error ?? '')
      return
    }
    if (!isSelected(tag.id)) {
      modelValue.value = [...modelValue.value, tag.id]
    }
    search.value = ''
  } finally {
    isCreating.value = false
  }
}
</script>

<template>
  <div class="space-y-2">
    <div v-if="selectedTags.length > 0" class="flex flex-wrap gap-1.5">
      <Badge v-for="tag in selectedTags" :key="tag.id" variant="secondary" class="gap-1 pr-1">
        {{ tag.name }}
        <button
          type="button"
          class="rounded-full p-0.5 hover:bg-muted-foreground/20"
          :disabled="props.disabled"
          :aria-label="t.shared.tagMultiSelect.removeTag(tag.name)"
          @click="remove(tag.id)"
        >
          <X class="size-3" />
        </button>
      </Badge>
    </div>

    <Popover v-model:open="isOpen">
      <PopoverTrigger as-child>
        <Button type="button" variant="outline" size="sm" :disabled="props.disabled">
          <Tags class="mr-2 size-4" />
          {{ t.shared.tagMultiSelect.addBtn }}
        </Button>
      </PopoverTrigger>
      <PopoverContent class="w-72 p-0" align="start">
        <div class="border-b p-2">
          <Input
            v-model="search"
            :placeholder="t.shared.tagMultiSelect.searchPlaceholder"
            class="h-8"
            @keydown.enter.prevent="handleCreate"
          />
        </div>
        <div class="max-h-56 overflow-y-auto p-1">
          <div
            v-if="tagsStore.isLoading"
            class="flex items-center justify-center py-6 text-muted-foreground"
          >
            <Loader2 class="size-4 animate-spin" />
          </div>
          <template v-else>
            <button
              v-for="tag in filteredTags"
              :key="tag.id"
              type="button"
              class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              @click="toggle(tag.id)"
            >
              <Check
                :class="['size-4 shrink-0', isSelected(tag.id) ? 'opacity-100' : 'opacity-0']"
              />
              <span class="truncate">{{ tag.name }}</span>
            </button>
            <p
              v-if="filteredTags.length === 0 && !creatableName"
              class="px-2 py-4 text-center text-sm text-muted-foreground"
            >
              {{ t.shared.tagMultiSelect.noTags }}
            </p>
            <button
              v-if="creatableName"
              type="button"
              class="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm text-primary hover:bg-accent"
              :disabled="isCreating"
              @click="handleCreate"
            >
              <Loader2 v-if="isCreating" class="size-4 shrink-0 animate-spin" />
              <Plus v-else class="size-4 shrink-0" />
              <span class="truncate">{{ t.shared.tagMultiSelect.createTag(creatableName) }}</span>
            </button>
          </template>
        </div>
      </PopoverContent>
    </Popover>
  </div>
</template>
