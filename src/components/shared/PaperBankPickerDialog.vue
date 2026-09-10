<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useAssessmentBankStore, DIFFICULTIES, type BankQuestion } from '@/stores/assessment-bank'
import { usePapersStore } from '@/stores/papers'
import { useCurriculumStore } from '@/stores/curriculum'
import { useTagsStore } from '@/stores/tags'
import { Loader2, Search } from 'lucide-vue-next'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import CurriculumTopicPicker from '@/components/shared/CurriculumTopicPicker.vue'
import { toast } from 'vue-sonner'
import { useT } from '@/composables/useT'
import { useLanguageStore } from '@/stores/language'

/**
 * Adds existing bank items to a paper BY REFERENCE (decision 91): the paper
 * gains a pointer, the bank row stays the one and only question. A paper
 * stores no subject, so the topic is chosen here — one popover over
 * grade → subject → topic, then that topic's sub-topics.
 *
 * The bank store scopes itself to the caller's own library (the platform's
 * for an admin, their center's for staff), which is exactly the set a paper
 * of theirs may reference.
 */
const props = defineProps<{
  paperId: string
  /** Items the paper already holds — listed, but not pickable twice. */
  excludeIds: string[]
}>()

const open = defineModel<boolean>('open', { default: false })

const t = useT()
const languageStore = useLanguageStore()
const bankStore = useAssessmentBankStore()
const papersStore = usePapersStore()
const curriculumStore = useCurriculumStore()
const tagsStore = useTagsStore()

const ALL_VALUE = '__all__'

const isSaving = ref(false)
const selectedIds = ref<string[]>([])
const search = ref('')
const subTopicId = ref(ALL_VALUE)
const difficulty = ref(ALL_VALUE)
const tagId = ref(ALL_VALUE)
const topicId = ref<string | null>(null)

const topic = computed(() => (topicId.value ? curriculumStore.getTopicById(topicId.value) : null))

watch(open, async (isOpen) => {
  if (!isOpen) return
  selectedIds.value = []
  search.value = ''
  subTopicId.value = ALL_VALUE
  difficulty.value = ALL_VALUE
  tagId.value = ALL_VALUE
  if (tagsStore.tags.length === 0) void tagsStore.fetchTags()
  if (curriculumStore.gradeLevels.length === 0) await curriculumStore.fetchCurriculum()
  if (topicId.value) await loadTopicQuestions()
})

async function loadTopicQuestions() {
  const ids = (topic.value?.subTopics ?? []).map((subTopic) => subTopic.id)
  const { error } = await bankStore.fetchQuestions({ subTopicIds: ids })
  if (error) toast.error(error)
}

async function selectTopic(nextTopicId: string) {
  topicId.value = nextTopicId
  subTopicId.value = ALL_VALUE
  await loadTopicQuestions()
}

function promptOf(question: BankQuestion): string {
  const payload = question.payload
  if (payload.type === 'cloze') return payload.question ?? payload.text
  return payload.question
}

const excluded = computed(() => new Set(props.excludeIds))

const visibleQuestions = computed(() => {
  const query = search.value.trim().toLowerCase()
  return bankStore.questions.filter((question) => {
    if (subTopicId.value !== ALL_VALUE && question.subTopicId !== subTopicId.value) return false
    if (difficulty.value !== ALL_VALUE && question.difficulty !== difficulty.value) return false
    if (tagId.value !== ALL_VALUE && !question.tagIds.includes(tagId.value)) return false
    if (query && !promptOf(question).toLowerCase().includes(query)) return false
    return true
  })
})

function toggle(id: string, checked: boolean) {
  selectedIds.value = checked
    ? [...selectedIds.value, id]
    : selectedIds.value.filter((selected) => selected !== id)
}

function tagNamesOf(question: BankQuestion): string[] {
  return question.tagIds
    .map((id) => tagsStore.tags.find((tag) => tag.id === id)?.name)
    .filter((name): name is string => Boolean(name))
}

function subTopicNameOf(question: BankQuestion): string {
  return curriculumStore.getSubTopicById(question.subTopicId)?.name ?? ''
}

async function handleAdd() {
  if (selectedIds.value.length === 0) return

  isSaving.value = true
  const { error } = await papersStore.addBankItems(props.paperId, selectedIds.value)
  isSaving.value = false

  if (error) {
    toast.error(error)
    return
  }

  toast.success(t.value.staff.papers.pickerToastAdded(selectedIds.value.length))
  open.value = false
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{{ t.staff.papers.pickerTitle }}</DialogTitle>
        <DialogDescription>{{ t.staff.papers.pickerDesc }}</DialogDescription>
      </DialogHeader>

      <div class="flex flex-wrap gap-2">
        <CurriculumTopicPicker
          :model-value="topicId"
          :placeholder="t.admin.practiceBank.pickTopic"
          @update:model-value="selectTopic"
        />

        <div class="relative min-w-[200px] flex-1">
          <Search class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            v-model="search"
            :placeholder="t.staff.papers.pickerSearchPlaceholder"
            class="pl-9"
          />
        </div>

        <Select :key="`st-${languageStore.language}`" v-model="subTopicId">
          <SelectTrigger class="w-52"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem :value="ALL_VALUE">{{ t.staff.papers.allSubTopics }}</SelectItem>
            <SelectGroup v-if="topic" :key="topic.id">
              <SelectLabel>{{ topic.name }}</SelectLabel>
              <SelectItem
                v-for="subTopic in topic.subTopics"
                :key="subTopic.id"
                :value="subTopic.id"
              >
                {{ subTopic.name }}
              </SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>

        <Select :key="`d-${languageStore.language}`" v-model="difficulty">
          <SelectTrigger class="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem :value="ALL_VALUE">{{ t.shared.questionBank.allDifficulties }}</SelectItem>
            <SelectItem v-for="level in DIFFICULTIES" :key="level" :value="level">
              {{ t.shared.difficulties[level] }}
            </SelectItem>
          </SelectContent>
        </Select>

        <Select :key="`t-${languageStore.language}`" v-model="tagId">
          <SelectTrigger class="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem :value="ALL_VALUE">{{ t.staff.papers.allTags }}</SelectItem>
            <SelectItem v-for="tag in tagsStore.tags" :key="tag.id" :value="tag.id">
              {{ tag.name }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div v-if="bankStore.isLoading" class="flex items-center justify-center py-12">
        <Loader2 class="size-6 animate-spin text-muted-foreground" />
      </div>

      <p v-else-if="!topicId" class="py-12 text-center text-muted-foreground">
        {{ t.staff.papers.pickerPickTopic }}
      </p>

      <p v-else-if="visibleQuestions.length === 0" class="py-12 text-center text-muted-foreground">
        {{ t.staff.papers.pickerEmpty }}
      </p>

      <ul v-else class="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
        <li
          v-for="question in visibleQuestions"
          :key="question.id"
          class="flex items-start gap-3 rounded-md border p-3"
          :class="excluded.has(question.id) ? 'opacity-60' : ''"
        >
          <Checkbox
            :model-value="excluded.has(question.id) || selectedIds.includes(question.id)"
            :disabled="excluded.has(question.id)"
            class="mt-0.5"
            @update:model-value="(checked) => toggle(question.id, checked === true)"
          />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium">{{ promptOf(question) }}</p>
            <div class="mt-1 flex flex-wrap items-center gap-1">
              <Badge variant="secondary">{{ t.shared.questionTypes[question.type] }}</Badge>
              <Badge variant="outline">{{ t.shared.difficulties[question.difficulty] }}</Badge>
              <Badge variant="outline">{{ subTopicNameOf(question) }}</Badge>
              <Badge v-for="name in tagNamesOf(question)" :key="name" variant="outline">
                {{ name }}
              </Badge>
              <span class="text-xs text-muted-foreground">
                {{ t.staff.papers.pickerPoints(question.points) }}
              </span>
              <span v-if="excluded.has(question.id)" class="text-xs text-muted-foreground">
                {{ t.staff.papers.pickerAlreadyIn }}
              </span>
            </div>
          </div>
        </li>
      </ul>

      <DialogFooter>
        <Button variant="outline" :disabled="isSaving" @click="open = false">
          {{ t.shared.actions.cancel }}
        </Button>
        <Button :disabled="selectedIds.length === 0 || isSaving" @click="handleAdd">
          <Loader2 v-if="isSaving" class="mr-2 size-4 animate-spin" />
          {{ t.staff.papers.pickerAddBtn(selectedIds.length) }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
