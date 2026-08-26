<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useAssessmentBankStore, DIFFICULTIES, type BankQuestion } from '@/stores/assessment-bank'
import { useCurriculumStore } from '@/stores/curriculum'
import { useAutosave } from '@/composables/useAutosave'
import { removeStorageObjects } from '@/lib/storage'
import {
  collectAdhocPayloadImagePaths,
  type AdhocPayload,
  type QuestionCardItem,
} from '@/lib/adhocPayload'
import { Library, Loader2, Plus } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Field, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import AssessmentQuestionCard from '@/components/staff/AssessmentQuestionCard.vue'
import TagMultiSelect from '@/components/admin/TagMultiSelect.vue'
import SaveStatusPill from '@/components/shared/SaveStatusPill.vue'
import { toast } from 'vue-sonner'
import { useT } from '@/composables/useT'
import { useLanguageStore } from '@/stores/language'

/**
 * The admin assessment question bank (P13a) — exam items, kept deliberately
 * apart from the practice `questions` bank (which is filed under a sub_topic
 * and carries option tips).
 *
 * A bank question IS an ad-hoc payload, so this page reuses the builder's
 * `AssessmentQuestionCard` verbatim: same nine types, same validator, same
 * background autosave. What the bank adds is the footer `meta` slot —
 * difficulty (MOE `Aras Kesukaran`) and learning-point tags. What it drops is
 * the explanation field and the drag grip: a bank is an unordered set.
 *
 * Images upload to `assessment-images` under `bank/{id}/…`, the same bucket
 * an assessment uses, so picking a question into a template copies the
 * payload verbatim with no path rewrite and no object duplication.
 */
const t = useT()
const languageStore = useLanguageStore()
const bankStore = useAssessmentBankStore()
const curriculumStore = useCurriculumStore()

const gradeLevelId = ref('')
const subjectId = ref('')
const difficultyFilter = ref<string>('')
const expandedId = ref<string | null>(null)
const isAdding = ref(false)

const autosave = useAutosave({ onError: (message) => toast.error(message) })

const ALL_VALUE = '__all__'

const gradeLevels = computed(() => curriculumStore.gradeLevels)
const subjects = computed(
  () => gradeLevels.value.find((grade) => grade.id === gradeLevelId.value)?.subjects ?? [],
)

/** A question can only be authored once its grade + subject are pinned. */
const canAdd = computed(() => Boolean(gradeLevelId.value && subjectId.value))

onMounted(async () => {
  await curriculumStore.fetchCurriculum()
  const firstGrade = gradeLevels.value[0]
  if (firstGrade) {
    gradeLevelId.value = firstGrade.id
    subjectId.value = firstGrade.subjects[0]?.id ?? ''
  }
})

// Selecting a grade invalidates the subject beneath it.
watch(gradeLevelId, () => {
  subjectId.value = subjects.value[0]?.id ?? ''
})

watch([gradeLevelId, subjectId, difficultyFilter], () => {
  expandedId.value = null
  if (!gradeLevelId.value || !subjectId.value) return
  void bankStore.fetchQuestions({
    gradeLevelId: gradeLevelId.value,
    subjectId: subjectId.value,
    difficulty:
      difficultyFilter.value && difficultyFilter.value !== ALL_VALUE
        ? (difficultyFilter.value as BankQuestion['difficulty'])
        : null,
  })
})

/** Adapt a bank question to the slice the shared card renders. */
function toCardItem(question: BankQuestion): QuestionCardItem {
  return {
    id: question.id,
    type: question.type,
    question: 'question' in question.payload ? (question.payload.question ?? '') : '',
    imagePath: question.payload.image_path ?? null,
    options: [],
    payload: question.payload,
    points: question.points,
  }
}

const cardItems = computed(() => bankStore.questions.map(toCardItem))

async function addQuestion() {
  if (!canAdd.value) return
  isAdding.value = true
  const { question, error } = await bankStore.createQuestion({
    payload: {
      type: 'mcq',
      question: t.value.staff.builder.untitledQuestion,
      options: [
        { text: t.value.staff.adhocForm.optionPlaceholder(1), is_correct: true },
        { text: t.value.staff.adhocForm.optionPlaceholder(2), is_correct: false },
      ],
    },
    difficulty: 'medium',
    gradeLevelId: gradeLevelId.value,
    subjectId: subjectId.value,
  })
  isAdding.value = false

  if (error || !question) {
    toast.error(error ?? '')
    return
  }
  expandedId.value = question.id
}

/**
 * Images dropped by an edit are deleted only AFTER the payload save that
 * drops the reference confirms (decision 78) — a failed save must never
 * leave the row pointing at a deleted object.
 */
const pendingImageDeletes = new Map<string, Set<string>>()

function handleImageOrphaned(questionId: string, path: string) {
  const pending = pendingImageDeletes.get(questionId) ?? new Set<string>()
  pending.add(path)
  pendingImageDeletes.set(questionId, pending)
}

function flushOrphanedImages(questionId: string, saved: AdhocPayload) {
  const pending = pendingImageDeletes.get(questionId)
  if (!pending || pending.size === 0) return

  const referenced = new Set(collectAdhocPayloadImagePaths(saved))
  const removable = [...pending].filter((path) => !referenced.has(path))
  for (const path of removable) pending.delete(path)
  void removeStorageObjects('assessment-images', removable)
}

function handlePayloadChange(question: BankQuestion, payload: AdhocPayload) {
  const previous = question.payload
  autosave.enqueue(`payload:${question.id}`, payload, {
    previous,
    save: async (value) => {
      const result = await bankStore.updateQuestion(question.id, { payload: value })
      if (!result.error) flushOrphanedImages(question.id, value)
      return result
    },
    rollback: (confirmed) => void bankStore.updateQuestion(question.id, { payload: confirmed }),
  })
}

function handlePointsChange(question: BankQuestion, points: number) {
  const previous = question.points
  autosave.enqueue(`points:${question.id}`, points, {
    previous,
    save: (value) => bankStore.updateQuestion(question.id, { points: value }),
    rollback: (confirmed) => void bankStore.updateQuestion(question.id, { points: confirmed }),
  })
}

/** Difficulty and tags are discrete picks — saved on change, not debounced. */
async function handleDifficultyChange(question: BankQuestion, value: unknown) {
  const difficulty = value as BankQuestion['difficulty']
  if (difficulty === question.difficulty) return
  const { error } = await bankStore.updateQuestion(question.id, { difficulty })
  if (error) toast.error(error)
}

async function handleTagsChange(question: BankQuestion, tagIds: string[]) {
  const { error } = await bankStore.setTags(question.id, tagIds)
  if (error) toast.error(error)
}

async function handleRemove(question: BankQuestion) {
  const paths = collectAdhocPayloadImagePaths(question.payload)
  const { error } = await bankStore.deleteQuestion(question.id)
  if (error) {
    toast.error(error)
    return
  }
  if (expandedId.value === question.id) expandedId.value = null
  void removeStorageObjects('assessment-images', paths)
}

async function handleDuplicate(question: BankQuestion) {
  const { question: copy, error } = await bankStore.createQuestion({
    payload: question.payload,
    difficulty: question.difficulty,
    gradeLevelId: question.gradeLevelId,
    subjectId: question.subjectId,
    points: question.points,
  })
  if (error || !copy) {
    toast.error(error ?? '')
    return
  }
  await bankStore.setTags(copy.id, question.tagIds)
  expandedId.value = copy.id
}
</script>

<template>
  <div class="p-6">
    <div class="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold">{{ t.admin.questionBank.title }}</h1>
        <p class="text-muted-foreground">{{ t.admin.questionBank.subtitle }}</p>
      </div>
      <div class="flex items-center gap-3">
        <SaveStatusPill :status="autosave.status.value" />
        <Button :disabled="!canAdd || isAdding" @click="addQuestion">
          <Loader2 v-if="isAdding" class="mr-2 size-4 animate-spin" />
          <Plus v-else class="mr-2 size-4" />
          {{ t.admin.questionBank.addBtn }}
        </Button>
      </div>
    </div>

    <!-- Grade -> subject -> difficulty. Grade+subject also file a new question. -->
    <div class="mb-6 flex flex-wrap items-end gap-3">
      <Field class="w-48">
        <FieldLabel>{{ t.admin.questionBank.gradeLabel }}</FieldLabel>
        <Select :key="`g-${languageStore.language}`" v-model="gradeLevelId">
          <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="grade in gradeLevels" :key="grade.id" :value="grade.id">
              {{ grade.name }}
            </SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field class="w-48">
        <FieldLabel>{{ t.admin.questionBank.subjectLabel }}</FieldLabel>
        <Select :key="`s-${languageStore.language}`" v-model="subjectId">
          <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="subject in subjects" :key="subject.id" :value="subject.id">
              {{ subject.name }}
            </SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field class="w-48">
        <FieldLabel>{{ t.admin.questionBank.difficultyLabel }}</FieldLabel>
        <Select :key="`d-${languageStore.language}`" v-model="difficultyFilter">
          <SelectTrigger class="w-full">
            <SelectValue :placeholder="t.admin.questionBank.allDifficulties" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem :value="ALL_VALUE">{{ t.admin.questionBank.allDifficulties }}</SelectItem>
            <SelectItem v-for="level in DIFFICULTIES" :key="level" :value="level">
              {{ t.shared.difficulties[level] }}
            </SelectItem>
          </SelectContent>
        </Select>
      </Field>
    </div>

    <div v-if="bankStore.isLoading" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <div v-else-if="bankStore.questions.length === 0" class="py-16 text-center">
      <Library class="mx-auto size-16 text-muted-foreground/50" />
      <p class="mt-4 text-muted-foreground">
        {{ canAdd ? t.admin.questionBank.empty : t.admin.questionBank.pickCurriculum }}
      </p>
    </div>

    <div v-else class="editor-column space-y-3">
      <AssessmentQuestionCard
        v-for="(question, index) in bankStore.questions"
        :key="question.id"
        :item="cardItems[index]!"
        :index="index"
        :expanded="expandedId === question.id"
        editable
        :reorderable="false"
        :show-explanation="false"
        :image-folder="`bank/${question.id}`"
        @select="expandedId = question.id"
        @payload-change="(payload) => handlePayloadChange(question, payload)"
        @points-change="(points) => handlePointsChange(question, points)"
        @image-orphaned="(path) => handleImageOrphaned(question.id, path)"
        @duplicate="handleDuplicate(question)"
        @remove="handleRemove(question)"
      >
        <template #meta>
          <div class="mr-auto flex flex-wrap items-center gap-2">
            <Select
              :key="`diff-${question.id}-${languageStore.language}`"
              :model-value="question.difficulty"
              @update:model-value="(value) => handleDifficultyChange(question, value)"
            >
              <SelectTrigger class="h-8 w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="level in DIFFICULTIES" :key="level" :value="level">
                  {{ t.shared.difficulties[level] }}
                </SelectItem>
              </SelectContent>
            </Select>
            <TagMultiSelect
              :model-value="question.tagIds"
              @update:model-value="(tagIds) => handleTagsChange(question, tagIds)"
            />
          </div>
        </template>
      </AssessmentQuestionCard>
    </div>
  </div>
</template>
