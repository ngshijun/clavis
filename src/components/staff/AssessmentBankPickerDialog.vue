<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useAssessmentBankStore, DIFFICULTIES, type BankQuestion } from '@/stores/assessment-bank'
import { useAssessmentsStore } from '@/stores/assessments'
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from 'vue-sonner'
import { useT } from '@/composables/useT'
import { useLanguageStore } from '@/stores/language'

/**
 * Picks questions out of the ADMIN question bank (P13a) into the assessment
 * being built — distinct from `BankQuestionPickerDialog`, which picks from
 * the practice `questions` bank.
 *
 * Picking COPIES the payload and its default points. The copy is what makes
 * a later bank edit unable to reach a published assessment or an in-flight
 * attempt; it also means the inserted rows are ordinary ad-hoc questions the
 * builder can then edit in place without touching the bank.
 */
const props = defineProps<{
  assessmentId: string
  /** Narrows the bank to the template's own pairing when it has one. */
  gradeLevelId: string | null
  subjectId: string | null
}>()

const open = defineModel<boolean>('open', { default: false })

const t = useT()
const languageStore = useLanguageStore()
const bankStore = useAssessmentBankStore()
const assessmentsStore = useAssessmentsStore()
const tagsStore = useTagsStore()

const ALL_VALUE = '__all__'

const isSaving = ref(false)
const selectedIds = ref<string[]>([])
const search = ref('')
const difficulty = ref(ALL_VALUE)
const tagId = ref(ALL_VALUE)

watch(open, async (isOpen) => {
  if (!isOpen) return
  selectedIds.value = []
  search.value = ''
  difficulty.value = ALL_VALUE
  tagId.value = ALL_VALUE
  if (tagsStore.tags.length === 0) void tagsStore.fetchTags()
  const { error } = await bankStore.fetchQuestions({
    gradeLevelId: props.gradeLevelId,
    subjectId: props.subjectId,
  })
  if (error) toast.error(error)
})

function promptOf(question: BankQuestion): string {
  const payload = question.payload
  if (payload.type === 'cloze') return payload.question ?? payload.text
  return payload.question
}

const visibleQuestions = computed(() => {
  const query = search.value.trim().toLowerCase()
  return bankStore.questions.filter((question) => {
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

async function handleAdd() {
  const picked = bankStore.questions.filter((question) => selectedIds.value.includes(question.id))
  if (picked.length === 0) return

  isSaving.value = true
  const { error } = await assessmentsStore.addQuestionsFromBank(
    props.assessmentId,
    picked.map((question) => ({ payload: question.payload, points: question.points })),
  )
  isSaving.value = false

  if (error) {
    toast.error(error)
    return
  }

  toast.success(t.value.staff.assessmentBankPicker.toastAdded(picked.length))
  open.value = false
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{{ t.staff.assessmentBankPicker.title }}</DialogTitle>
        <DialogDescription>{{ t.staff.assessmentBankPicker.description }}</DialogDescription>
      </DialogHeader>

      <div class="flex flex-wrap gap-2">
        <div class="relative min-w-[200px] flex-1">
          <Search class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            v-model="search"
            :placeholder="t.staff.assessmentBankPicker.searchPlaceholder"
            class="pl-9"
          />
        </div>

        <Select :key="`d-${languageStore.language}`" v-model="difficulty">
          <SelectTrigger class="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem :value="ALL_VALUE">{{ t.admin.questionBank.allDifficulties }}</SelectItem>
            <SelectItem v-for="level in DIFFICULTIES" :key="level" :value="level">
              {{ t.shared.difficulties[level] }}
            </SelectItem>
          </SelectContent>
        </Select>

        <Select :key="`t-${languageStore.language}`" v-model="tagId">
          <SelectTrigger class="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem :value="ALL_VALUE">{{ t.staff.assessmentBankPicker.allTags }}</SelectItem>
            <SelectItem v-for="tag in tagsStore.tags" :key="tag.id" :value="tag.id">
              {{ tag.name }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div v-if="bankStore.isLoading" class="flex items-center justify-center py-12">
        <Loader2 class="size-6 animate-spin text-muted-foreground" />
      </div>

      <p v-else-if="visibleQuestions.length === 0" class="py-12 text-center text-muted-foreground">
        {{ t.staff.assessmentBankPicker.empty }}
      </p>

      <ul v-else class="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
        <li
          v-for="question in visibleQuestions"
          :key="question.id"
          class="flex items-start gap-3 rounded-md border p-3"
        >
          <Checkbox
            :model-value="selectedIds.includes(question.id)"
            class="mt-0.5"
            @update:model-value="(checked) => toggle(question.id, checked === true)"
          />
          <div class="min-w-0 flex-1">
            <p class="truncate text-sm font-medium">{{ promptOf(question) }}</p>
            <div class="mt-1 flex flex-wrap items-center gap-1">
              <Badge variant="secondary">{{ t.shared.questionTypes[question.type] }}</Badge>
              <Badge variant="outline">{{ t.shared.difficulties[question.difficulty] }}</Badge>
              <Badge v-for="name in tagNamesOf(question)" :key="name" variant="outline">
                {{ name }}
              </Badge>
              <span class="text-xs text-muted-foreground">
                {{ t.staff.assessmentBankPicker.points(question.points) }}
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
          {{ t.staff.assessmentBankPicker.addBtn(selectedIds.length) }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
