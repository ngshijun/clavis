<script setup lang="ts">
import { ref, computed, watch, h } from 'vue'
import type { ColumnDef } from '@tanstack/vue-table'
import { useQuestionsStore, type BankQuestionSummary } from '@/stores/questions'
import { useAssessmentsStore } from '@/stores/assessments'
import { Loader2, Search } from 'lucide-vue-next'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { DataTable } from '@/components/ui/data-table'
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

const t = useT()
const languageStore = useLanguageStore()
const questionsStore = useQuestionsStore()
const assessmentsStore = useAssessmentsStore()

const props = defineProps<{
  assessmentId: string
  /** Bank question ids already in the assessment (shown as added, unpickable). */
  existingQuestionIds: string[]
}>()

const open = defineModel<boolean>('open', { default: false })

const ALL_VALUE = '__all__'

const isLoading = ref(false)
const isSaving = ref(false)
const selectedIds = ref<string[]>([])
const search = ref('')

// Local cascading filter state — this picker owns its own filters rather than
// sharing page-level state in the questions store.
const gradeLevel = ref(ALL_VALUE)
const subject = ref(ALL_VALUE)
const topic = ref(ALL_VALUE)
const subTopic = ref(ALL_VALUE)

watch(open, async (isOpen) => {
  if (!isOpen) return

  selectedIds.value = []
  search.value = ''

  // Staff have no answer-key access to the bank (P11a/decision 76): this
  // picker reads the key-free summary listing, never the admin bank RPC.
  if (questionsStore.bankSummaries.length === 0) {
    isLoading.value = true
    const { error } = await questionsStore.fetchBankSummaries()
    isLoading.value = false
    if (error) {
      toast.error(t.value.staff.bankPicker.toastLoadFailed)
    }
  }
})

const existingSet = computed(() => new Set(props.existingQuestionIds))

function setGradeLevel(value: string) {
  gradeLevel.value = value
  subject.value = ALL_VALUE
  topic.value = ALL_VALUE
  subTopic.value = ALL_VALUE
}
function setSubject(value: string) {
  subject.value = value
  topic.value = ALL_VALUE
  subTopic.value = ALL_VALUE
}
function setTopic(value: string) {
  topic.value = value
  subTopic.value = ALL_VALUE
}

const gradeLevelFilter = computed(() =>
  gradeLevel.value === ALL_VALUE ? undefined : gradeLevel.value,
)
const subjectFilter = computed(() => (subject.value === ALL_VALUE ? undefined : subject.value))
const topicFilter = computed(() => (topic.value === ALL_VALUE ? undefined : topic.value))
const subTopicFilter = computed(() => (subTopic.value === ALL_VALUE ? undefined : subTopic.value))

const availableGradeLevels = computed(() => questionsStore.getGradeLevels())
const availableSubjects = computed(() => questionsStore.getSubjects(gradeLevelFilter.value))
const availableTopics = computed(() =>
  questionsStore.getTopics(gradeLevelFilter.value, subjectFilter.value),
)
const availableSubTopics = computed(() =>
  questionsStore.getSubTopics(gradeLevelFilter.value, subjectFilter.value, topicFilter.value),
)

const filteredQuestions = computed(() => {
  const base = questionsStore.getFilteredBankSummaries(
    gradeLevelFilter.value,
    subjectFilter.value,
    topicFilter.value,
    subTopicFilter.value,
  )
  const query = search.value.toLowerCase().trim()
  if (!query) return base
  return base.filter((question) => question.question.toLowerCase().includes(query))
})

function toggle(question: BankQuestionSummary) {
  if (existingSet.value.has(question.id)) return
  selectedIds.value = selectedIds.value.includes(question.id)
    ? selectedIds.value.filter((id) => id !== question.id)
    : [...selectedIds.value, question.id]
}

function typeLabel(type: BankQuestionSummary['type']): string {
  if (type === 'mcq') return t.value.shared.questionBankTable.typeMultipleChoice
  if (type === 'mrq') return t.value.shared.questionBankTable.typeMultipleResponse
  return t.value.shared.questionBankTable.typeShortAnswer
}

const columns = computed<ColumnDef<BankQuestionSummary>[]>(() => [
  {
    id: 'select',
    cell: ({ row }) =>
      h(Checkbox, {
        class: 'pointer-events-none',
        modelValue:
          selectedIds.value.includes(row.original.id) || existingSet.value.has(row.original.id),
        disabled: existingSet.value.has(row.original.id),
        tabindex: -1,
      }),
  },
  {
    accessorKey: 'question',
    header: () => t.value.staff.bankPicker.questionCol,
    cell: ({ row }) =>
      h(
        'div',
        {
          class: 'max-w-[18rem] truncate font-medium lg:max-w-[24rem]',
          title: row.original.question,
        },
        row.original.question,
      ),
  },
  {
    accessorKey: 'type',
    header: () => t.value.staff.bankPicker.typeCol,
    cell: ({ row }) => h(Badge, { variant: 'secondary' }, () => typeLabel(row.original.type)),
  },
  {
    accessorKey: 'subTopicName',
    header: () => t.value.staff.bankPicker.subTopicCol,
    cell: ({ row }) =>
      existingSet.value.has(row.original.id)
        ? h('div', { class: 'flex items-center gap-2' }, [
            h('span', {}, row.original.subTopicName),
            h(
              Badge,
              { variant: 'outline', class: 'text-muted-foreground' },
              () => t.value.staff.bankPicker.alreadyAdded,
            ),
          ])
        : h('div', {}, row.original.subTopicName),
  },
])

async function handleAdd() {
  if (selectedIds.value.length === 0) return

  isSaving.value = true
  const count = selectedIds.value.length
  const { error } = await assessmentsStore.addBankQuestions(props.assessmentId, selectedIds.value)
  isSaving.value = false

  if (error) {
    toast.error(error)
    return
  }

  toast.success(t.value.staff.builder.toastQuestionsAdded(count))
  open.value = false
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
      <DialogHeader>
        <DialogTitle>{{ t.staff.bankPicker.title }}</DialogTitle>
        <DialogDescription>{{ t.staff.bankPicker.description }}</DialogDescription>
      </DialogHeader>

      <div v-if="isLoading" class="flex items-center justify-center py-16">
        <Loader2 class="size-6 animate-spin text-muted-foreground" />
      </div>

      <div v-else class="space-y-4 py-2">
        <!-- Cascading filters row (grade → subject → topic → sub-topic) -->
        <div class="flex flex-wrap items-center gap-3">
          <div class="relative w-[220px]">
            <Search class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              v-model="search"
              :placeholder="t.shared.questionBankTable.searchPlaceholder"
              class="pl-9"
            />
          </div>

          <Select
            :key="languageStore.language"
            :model-value="gradeLevel"
            @update:model-value="setGradeLevel(String($event))"
          >
            <SelectTrigger class="w-[130px]">
              <SelectValue :placeholder="t.shared.questionBankTable.allGrades" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem :value="ALL_VALUE">{{ t.shared.questionBankTable.allGrades }}</SelectItem>
              <SelectItem v-for="grade in availableGradeLevels" :key="grade" :value="grade">
                {{ grade }}
              </SelectItem>
            </SelectContent>
          </Select>

          <Select
            :key="languageStore.language"
            :model-value="subject"
            :disabled="gradeLevel === ALL_VALUE"
            @update:model-value="setSubject(String($event))"
          >
            <SelectTrigger class="w-[140px]">
              <SelectValue :placeholder="t.shared.questionBankTable.allSubjects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem :value="ALL_VALUE">{{
                t.shared.questionBankTable.allSubjects
              }}</SelectItem>
              <SelectItem v-for="item in availableSubjects" :key="item" :value="item">
                {{ item }}
              </SelectItem>
            </SelectContent>
          </Select>

          <Select
            :key="languageStore.language"
            :model-value="topic"
            :disabled="subject === ALL_VALUE"
            @update:model-value="setTopic(String($event))"
          >
            <SelectTrigger class="w-[140px]">
              <SelectValue :placeholder="t.shared.questionBankTable.allTopics" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem :value="ALL_VALUE">{{ t.shared.questionBankTable.allTopics }}</SelectItem>
              <SelectItem v-for="item in availableTopics" :key="item" :value="item">
                {{ item }}
              </SelectItem>
            </SelectContent>
          </Select>

          <Select
            :key="languageStore.language"
            :model-value="subTopic"
            :disabled="topic === ALL_VALUE"
            @update:model-value="subTopic = String($event)"
          >
            <SelectTrigger class="w-[140px]">
              <SelectValue :placeholder="t.shared.questionBankTable.allSubTopics" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem :value="ALL_VALUE">{{
                t.shared.questionBankTable.allSubTopics
              }}</SelectItem>
              <SelectItem v-for="item in availableSubTopics" :key="item" :value="item">
                {{ item }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <p
          v-if="filteredQuestions.length === 0"
          class="py-10 text-center text-sm text-muted-foreground"
        >
          {{ t.staff.bankPicker.noQuestions }}
        </p>
        <DataTable v-else :columns="columns" :data="filteredQuestions" :on-row-click="toggle" />
      </div>

      <DialogFooter class="items-center gap-3">
        <span class="text-sm text-muted-foreground">
          {{ t.staff.bankPicker.selectedCount(selectedIds.length) }}
        </span>
        <Button type="button" variant="outline" :disabled="isSaving" @click="open = false">
          {{ t.staff.bankPicker.cancel }}
        </Button>
        <Button :disabled="isSaving || selectedIds.length === 0" @click="handleAdd">
          <Loader2 v-if="isSaving" class="mr-2 size-4 animate-spin" />
          {{ t.staff.bankPicker.addBtn(selectedIds.length) }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
