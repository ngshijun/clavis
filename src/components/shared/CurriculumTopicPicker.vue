<script setup lang="ts">
import { ref, computed } from 'vue'
import { ChevronDown, ChevronRight, FolderTree } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useCurriculumStore } from '@/stores/curriculum'
import { useT } from '@/composables/useT'

/**
 * Pick a topic in ONE interaction: a folder tree of grade level → subject →
 * topic in a popover, instead of three cascading selects that each need their
 * own click. Typing filters the tree and auto-expands what matches, so a
 * known topic is reachable by name alone.
 *
 * The value is a topic id; the button shows the full path so the context is
 * readable without opening the tree.
 */
const props = defineProps<{
  modelValue: string | null
  placeholder: string
}>()

const emit = defineEmits<{
  'update:modelValue': [topicId: string]
}>()

const t = useT()
const curriculumStore = useCurriculumStore()

const isOpen = ref(false)
const search = ref('')
/** Manually expanded grade levels / subjects (search expansion is separate). */
const expandedIds = ref<string[]>([])

const query = computed(() => search.value.trim().toLowerCase())

/** The tree, pruned to branches that match the query (everything when empty). */
const tree = computed(() =>
  curriculumStore.gradeLevels
    .map((gradeLevel) => ({
      id: gradeLevel.id,
      name: gradeLevel.name,
      subjects: gradeLevel.subjects
        .map((subject) => ({
          id: subject.id,
          name: subject.name,
          topics: subject.topics.filter(
            (topic) =>
              !query.value ||
              topic.name.toLowerCase().includes(query.value) ||
              subject.name.toLowerCase().includes(query.value) ||
              gradeLevel.name.toLowerCase().includes(query.value),
          ),
        }))
        .filter((subject) => subject.topics.length > 0),
    }))
    .filter((gradeLevel) => gradeLevel.subjects.length > 0),
)

/** While searching every surviving branch is open; otherwise the user decides. */
function isExpanded(id: string): boolean {
  return query.value.length > 0 || expandedIds.value.includes(id)
}

function toggle(id: string) {
  expandedIds.value = expandedIds.value.includes(id)
    ? expandedIds.value.filter((expandedId) => expandedId !== id)
    : [...expandedIds.value, id]
}

const selectedPath = computed(() => {
  if (!props.modelValue) return null
  const hierarchy = curriculumStore.getTopicWithHierarchy(props.modelValue)
  if (!hierarchy) return null
  return `${hierarchy.gradeLevel.name} · ${hierarchy.subject.name} · ${hierarchy.topic.name}`
})

function pick(topicId: string) {
  emit('update:modelValue', topicId)
  isOpen.value = false
  search.value = ''
}
</script>

<template>
  <Popover v-model:open="isOpen">
    <PopoverTrigger as-child>
      <Button variant="outline" class="max-w-full justify-start gap-2">
        <FolderTree class="size-4 shrink-0 text-muted-foreground" />
        <span class="truncate">{{ selectedPath ?? placeholder }}</span>
        <ChevronDown class="ml-auto size-4 shrink-0 text-muted-foreground" />
      </Button>
    </PopoverTrigger>

    <PopoverContent class="w-80 p-0" align="start">
      <div class="border-b p-2">
        <Input v-model="search" :placeholder="t.shared.curriculumTopicPicker.searchPlaceholder" />
      </div>

      <div class="max-h-72 overflow-y-auto p-1">
        <p v-if="tree.length === 0" class="p-3 text-sm text-muted-foreground">
          {{ t.shared.curriculumTopicPicker.noResults }}
        </p>

        <ul v-else class="space-y-0.5">
          <li v-for="gradeLevel in tree" :key="gradeLevel.id">
            <button
              type="button"
              class="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm font-medium hover:bg-muted"
              :aria-expanded="isExpanded(gradeLevel.id)"
              @click="toggle(gradeLevel.id)"
            >
              <ChevronDown v-if="isExpanded(gradeLevel.id)" class="size-4 shrink-0" />
              <ChevronRight v-else class="size-4 shrink-0" />
              <span class="truncate">{{ gradeLevel.name }}</span>
            </button>

            <ul v-if="isExpanded(gradeLevel.id)" class="space-y-0.5">
              <li v-for="subject in gradeLevel.subjects" :key="subject.id">
                <button
                  type="button"
                  class="flex w-full items-center gap-1.5 rounded-md py-1.5 pl-6 pr-2 text-left text-sm hover:bg-muted"
                  :aria-expanded="isExpanded(subject.id)"
                  @click="toggle(subject.id)"
                >
                  <ChevronDown v-if="isExpanded(subject.id)" class="size-4 shrink-0" />
                  <ChevronRight v-else class="size-4 shrink-0" />
                  <span class="truncate">{{ subject.name }}</span>
                </button>

                <ul v-if="isExpanded(subject.id)" class="space-y-0.5">
                  <li v-for="topic in subject.topics" :key="topic.id">
                    <button
                      type="button"
                      class="w-full truncate rounded-md py-1.5 pl-[3.25rem] pr-2 text-left text-sm hover:bg-muted"
                      :class="
                        topic.id === modelValue ? 'bg-primary/10 font-medium text-primary' : ''
                      "
                      @click="pick(topic.id)"
                    >
                      {{ topic.name }}
                    </button>
                  </li>
                </ul>
              </li>
            </ul>
          </li>
        </ul>
      </div>
    </PopoverContent>
  </Popover>
</template>
