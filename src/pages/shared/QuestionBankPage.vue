<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useAssessmentBankStore, DIFFICULTIES, type BankQuestion } from '@/stores/assessment-bank'
import { useCurriculumStore } from '@/stores/curriculum'
import { useAutosave } from '@/composables/useAutosave'
import { curriculumEntityConfig, type CurriculumIds } from '@/lib/curriculumEntityConfig'
import { type AdhocPayload, type QuestionCardItem } from '@/lib/adhocPayload'
import { Library, Loader2, Plus, FolderTree } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Field, FieldLabel } from '@/components/ui/field'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import AssessmentQuestionCard from '@/components/staff/AssessmentQuestionCard.vue'
import CurriculumItemList from '@/components/admin/CurriculumItemList.vue'
import CurriculumAddDialog from '@/components/admin/CurriculumAddDialog.vue'
import CurriculumDeleteDialog from '@/components/admin/CurriculumDeleteDialog.vue'
import TagMultiSelect from '@/components/admin/TagMultiSelect.vue'
import SaveStatusPill from '@/components/shared/SaveStatusPill.vue'
import { toast } from 'vue-sonner'
import { useT } from '@/composables/useT'
import { useLanguageStore } from '@/stores/language'
import { useAuthStore } from '@/stores/auth'
import { useActiveClassroom } from '@/composables/useActiveClassroom'

/**
 * One reusable question library, shown to whoever owns it (decision 91): the
 * PLATFORM library for an admin, the CENTER's own for staff. The store scopes
 * every read and write to the caller's side, so this page differs only in its
 * heading and in who may edit the filing level — sub-topics belong to the
 * curriculum, which is the admin's.
 *
 * Filed under a sub-topic, so the filters walk the curriculum: grade → subject
 * → topic → sub-topic, with "all" at the two inner levels. A new question
 * needs one sub-topic pinned. A teacher reaches the bank through a classroom,
 * so there the grade and subject are the classroom's and not offered; two
 * classrooms of one pairing show the same bank, which is the center's.
 *
 * A bank question IS an ad-hoc payload, so this page reuses the builder's
 * `AssessmentQuestionCard` verbatim. What the bank adds is the footer `meta`
 * slot — difficulty (MOE `Aras Kesukaran`), filing and learning-point tags,
 * plus how many templates hold the question, since editing it here edits
 * them all. What it drops is the explanation field and the drag grip.
 *
 * Images upload to `assessment-images` under `bank/{id}/…`.
 */
const t = useT()
const languageStore = useLanguageStore()
const authStore = useAuthStore()
const bankStore = useAssessmentBankStore()
const curriculumStore = useCurriculumStore()
const { classroom } = useActiveClassroom()

const ALL_VALUE = '__all__'

const gradeLevelId = ref('')
const subjectId = ref('')
const topicId = ref(ALL_VALUE)
const subTopicId = ref(ALL_VALUE)
const difficultyFilter = ref<string>(ALL_VALUE)
const expandedId = ref<string | null>(null)
const isAdding = ref(false)

/** Sub-topic management for the selected topic (the curriculum page owns the trunk). */
const showSubTopicManager = ref(false)
const expandedSubTopicId = ref<string | null>(null)
const showAddSubTopicDialog = ref(false)
const showDeleteSubTopicDialog = ref(false)
const deleteSubTopicId = ref('')
const deleteSubTopicName = ref('')

const autosave = useAutosave({ onError: (message) => toast.error(message) })

/** Sub-topics are curriculum, so only an admin may add or rename them here. */
const ownsCurriculum = computed(() => authStore.isAdmin)

const heading = computed(() =>
  authStore.isAdmin
    ? { title: t.value.shared.questionBank.title, subtitle: t.value.shared.questionBank.subtitle }
    : {
        title: t.value.shared.questionBank.centerTitle,
        subtitle: t.value.shared.questionBank.centerSubtitle,
      },
)

const gradeLevels = computed(() => curriculumStore.gradeLevels)
const subjects = computed(
  () => gradeLevels.value.find((grade) => grade.id === gradeLevelId.value)?.subjects ?? [],
)
const subject = computed(() => subjects.value.find((item) => item.id === subjectId.value))
const topics = computed(() => subject.value?.topics ?? [])
const topic = computed(() => topics.value.find((item) => item.id === topicId.value))
const subTopics = computed(() => topic.value?.subTopics ?? [])

/** The sub-topics in view: one, a topic's, or the whole subject's. */
const scopedSubTopicIds = computed(() => {
  if (subTopicId.value !== ALL_VALUE) return [subTopicId.value]
  if (topic.value) return topic.value.subTopics.map((item) => item.id)
  return topics.value.flatMap((item) => item.subTopics.map((subTopic) => subTopic.id))
})

/** A question can only be authored once its sub-topic is pinned. */
const canAdd = computed(() => subTopicId.value !== ALL_VALUE)

onMounted(async () => {
  await curriculumStore.fetchCurriculum()
  if (classroom.value) return
  const firstGrade = gradeLevels.value[0]
  if (firstGrade) {
    gradeLevelId.value = firstGrade.id
    subjectId.value = firstGrade.subjects[0]?.id ?? ''
  }
})

// Inside a classroom the pairing is the classroom's. Watched rather than read
// once: the classroom list may still be loading, and switching classroom
// reuses this page.
watch(
  () => classroom.value && [classroom.value.gradeLevelId, classroom.value.subjectId],
  (pairing) => {
    if (!pairing) return
    gradeLevelId.value = pairing[0]
    subjectId.value = pairing[1]
  },
  { immediate: true },
)

// Selecting a level invalidates everything beneath it. The grade resets its
// subject on the user's pick, not in a watcher, so seeding both ids holds.
function selectGradeLevel(id: string) {
  gradeLevelId.value = id
  subjectId.value = subjects.value[0]?.id ?? ''
}
watch(subjectId, () => {
  topicId.value = ALL_VALUE
})
watch(topicId, () => {
  subTopicId.value = ALL_VALUE
})

watch([scopedSubTopicIds, difficultyFilter], () => {
  expandedId.value = null
  void bankStore.fetchQuestions({
    subTopicIds: scopedSubTopicIds.value,
    difficulty:
      difficultyFilter.value !== ALL_VALUE
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
    subTopicId: subTopicId.value,
  })
  isAdding.value = false

  if (error || !question) {
    toast.error(error ?? '')
    return
  }
  expandedId.value = question.id
}

function handlePayloadChange(question: BankQuestion, payload: AdhocPayload) {
  const previous = question.payload
  autosave.enqueue(`payload:${question.id}`, payload, {
    previous,
    save: (value) => bankStore.updateQuestion(question.id, { payload: value }),
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

/** Difficulty, filing and tags are discrete picks — saved on change, not debounced. */
async function handleDifficultyChange(question: BankQuestion, value: unknown) {
  const difficulty = value as BankQuestion['difficulty']
  if (difficulty === question.difficulty) return
  const { error } = await bankStore.updateQuestion(question.id, { difficulty })
  if (error) toast.error(error)
}

async function handleSubTopicChange(question: BankQuestion, value: unknown) {
  const nextSubTopicId = String(value ?? '')
  if (!nextSubTopicId || nextSubTopicId === question.subTopicId) return
  const { error } = await bankStore.updateQuestion(question.id, { subTopicId: nextSubTopicId })
  if (error) {
    toast.error(error)
    return
  }
  // Moved out of the current view: drop it from the list.
  if (!scopedSubTopicIds.value.includes(nextSubTopicId)) {
    bankStore.questions = bankStore.questions.filter((item) => item.id !== question.id)
    if (expandedId.value === question.id) expandedId.value = null
  }
}

// ── sub-topic management (P19b: the bank owns its own filing level) ───────

function subTopicIds(subTopic: { id: string }): CurriculumIds {
  return {
    gradeLevelId: gradeLevelId.value,
    subjectId: subjectId.value,
    topicId: topicId.value,
    stageId: '',
    subTopicId: subTopic.id,
  }
}

function handleSubTopicReorder(orderedIds: string[]) {
  const currentTopicId = topicId.value
  if (currentTopicId === ALL_VALUE) return
  const previousIds = curriculumStore.applySubTopicOrder(currentTopicId, orderedIds)
  if (!previousIds) return
  autosave.enqueue(`sub-topics:${currentTopicId}`, orderedIds, {
    previous: previousIds,
    save: (ids) => curriculumStore.persistSubTopicOrder(currentTopicId, ids),
    rollback: (ids) => void curriculumStore.applySubTopicOrder(currentTopicId, ids),
  })
}

function handleSubTopicRename(subTopic: { id: string; name: string }, name: string) {
  const previous = subTopic.name
  if (name === previous) return
  subTopic.name = name
  autosave.enqueue(`sub-topic-name:${subTopic.id}`, name, {
    previous,
    save: (value) =>
      curriculumEntityConfig.subtopic.updateName(curriculumStore, subTopicIds(subTopic), value),
    rollback: (confirmed) => {
      subTopic.name = confirmed
    },
  })
}

function openDeleteSubTopic(subTopic: { id: string; name: string }) {
  deleteSubTopicId.value = subTopic.id
  deleteSubTopicName.value = subTopic.name
  showDeleteSubTopicDialog.value = true
}

function handleSubTopicDeleted() {
  if (subTopicId.value === deleteSubTopicId.value) subTopicId.value = ALL_VALUE
  expandedSubTopicId.value = null
}

/**
 * Learning points are scoped to TOPICS (P19a), so a bank question's tag
 * picker offers the points of the topic its sub-topic sits under.
 */
function topicIdsFor(subTopicId: string): string[] {
  const topicId = curriculumStore.getSubTopicWithHierarchy(subTopicId)?.topic.id
  return topicId ? [topicId] : []
}

async function handleTagsChange(question: BankQuestion, tagIds: string[]) {
  const { error } = await bankStore.setTags(question.id, tagIds, question.tagIds)
  if (error) toast.error(error)
}

async function handleRemove(question: BankQuestion) {
  const { error } = await bankStore.deleteQuestion(question.id)
  if (error) {
    toast.error(error)
    return
  }
  if (expandedId.value === question.id) expandedId.value = null
}

async function handleDuplicate(question: BankQuestion) {
  const { question: copy, error } = await bankStore.createQuestion({
    payload: question.payload,
    difficulty: question.difficulty,
    subTopicId: question.subTopicId,
    points: question.points,
  })
  if (error || !copy) {
    toast.error(error ?? '')
    return
  }
  await bankStore.setTags(copy.id, question.tagIds, [])
  expandedId.value = copy.id
}
</script>

<template>
  <div class="p-6">
    <div class="mb-6 flex items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold">{{ heading.title }}</h1>
        <p class="text-muted-foreground">{{ heading.subtitle }}</p>
      </div>
      <div class="flex items-center gap-3">
        <SaveStatusPill :status="autosave.status.value" />
        <Button
          v-if="ownsCurriculum"
          variant="outline"
          :disabled="topicId === ALL_VALUE"
          @click="showSubTopicManager = !showSubTopicManager"
        >
          <FolderTree class="mr-2 size-4" />
          {{ t.shared.questionBank.manageSubTopics }}
        </Button>
        <Button :disabled="!canAdd || isAdding" @click="addQuestion">
          <Loader2 v-if="isAdding" class="mr-2 size-4 animate-spin" />
          <Plus v-else class="mr-2 size-4" />
          {{ t.shared.questionBank.addBtn }}
        </Button>
      </div>
    </div>

    <!-- Grade → subject → topic → sub-topic → difficulty. The sub-topic files a new question. -->
    <div class="mb-6 flex flex-wrap items-end gap-3">
      <Field v-if="!classroom" class="w-44">
        <FieldLabel>{{ t.shared.questionBank.gradeLabel }}</FieldLabel>
        <Select
          :key="`g-${languageStore.language}`"
          :model-value="gradeLevelId"
          @update:model-value="(id) => selectGradeLevel(String(id))"
        >
          <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="grade in gradeLevels" :key="grade.id" :value="grade.id">
              {{ grade.name }}
            </SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field v-if="!classroom" class="w-44">
        <FieldLabel>{{ t.shared.questionBank.subjectLabel }}</FieldLabel>
        <Select :key="`s-${languageStore.language}`" v-model="subjectId">
          <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem v-for="item in subjects" :key="item.id" :value="item.id">
              {{ item.name }}
            </SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field class="w-56">
        <FieldLabel>{{ t.shared.questionBank.topicLabel }}</FieldLabel>
        <Select :key="`t-${languageStore.language}`" v-model="topicId">
          <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem :value="ALL_VALUE">{{ t.shared.questionBank.allTopics }}</SelectItem>
            <SelectItem v-for="item in topics" :key="item.id" :value="item.id">
              {{ item.name }}
            </SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field class="w-56">
        <FieldLabel>{{ t.shared.questionBank.subTopicLabel }}</FieldLabel>
        <Select
          :key="`st-${languageStore.language}`"
          v-model="subTopicId"
          :disabled="topicId === ALL_VALUE"
        >
          <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem :value="ALL_VALUE">{{ t.shared.questionBank.allSubTopics }}</SelectItem>
            <SelectItem v-for="item in subTopics" :key="item.id" :value="item.id">
              {{ item.name }}
            </SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <Field class="w-44">
        <FieldLabel>{{ t.shared.questionBank.difficultyLabel }}</FieldLabel>
        <Select :key="`d-${languageStore.language}`" v-model="difficultyFilter">
          <SelectTrigger class="w-full"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem :value="ALL_VALUE">{{ t.shared.questionBank.allDifficulties }}</SelectItem>
            <SelectItem v-for="level in DIFFICULTIES" :key="level" :value="level">
              {{ t.shared.difficulties[level] }}
            </SelectItem>
          </SelectContent>
        </Select>
      </Field>
    </div>

    <!-- The topic's sub-topics: what a bank question is filed under -->
    <div v-if="ownsCurriculum && showSubTopicManager && topic" class="mb-6 rounded-lg border p-4">
      <div class="mb-3">
        <h2 class="text-sm font-semibold">{{ t.shared.questionBank.manageSubTopicsTitle }}</h2>
        <p class="text-sm text-muted-foreground">
          {{ t.shared.questionBank.manageSubTopicsDesc }}
        </p>
      </div>
      <CurriculumItemList
        v-model:expanded-id="expandedSubTopicId"
        :items="topic.subTopics"
        :get-description="() => ''"
        :empty-title="t.shared.questionBank.noSubTopics"
        :empty-description="t.shared.questionBank.noSubTopicsDesc(topic.name)"
        :add-label="t.shared.questionBank.addSubTopic"
        @select="(item) => (expandedSubTopicId = expandedSubTopicId === item.id ? null : item.id)"
        @reorder="handleSubTopicReorder"
        @rename="handleSubTopicRename"
        @delete="openDeleteSubTopic"
        @add="showAddSubTopicDialog = true"
      />
    </div>

    <div v-if="bankStore.isLoading" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <div v-else-if="bankStore.questions.length === 0" class="py-16 text-center">
      <Library class="mx-auto size-16 text-muted-foreground/50" />
      <p class="mt-4 text-muted-foreground">
        {{ canAdd ? t.shared.questionBank.empty : t.shared.questionBank.pickSubTopic }}
      </p>
    </div>

    <div v-else class="space-y-3">
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
              <SelectTrigger class="h-8 w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem v-for="level in DIFFICULTIES" :key="level" :value="level">
                  {{ t.shared.difficulties[level] }}
                </SelectItem>
              </SelectContent>
            </Select>
            <Select
              :key="`file-${question.id}-${languageStore.language}`"
              :model-value="question.subTopicId"
              @update:model-value="(value) => handleSubTopicChange(question, value)"
            >
              <SelectTrigger class="h-8 w-52"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectGroup v-for="group in topics" :key="group.id">
                  <SelectLabel>{{ group.name }}</SelectLabel>
                  <SelectItem
                    v-for="subTopic in group.subTopics"
                    :key="subTopic.id"
                    :value="subTopic.id"
                  >
                    {{ subTopic.name }}
                  </SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <TagMultiSelect
              :model-value="question.tagIds"
              :topic-ids="topicIdsFor(question.subTopicId)"
              @update:model-value="(tagIds) => handleTagsChange(question, tagIds)"
            />
            <Badge v-if="question.usedInPapers > 0" variant="outline">
              {{ t.shared.questionBank.usedIn(question.usedInPapers) }}
            </Badge>
          </div>
        </template>
      </AssessmentQuestionCard>
    </div>

    <CurriculumAddDialog
      v-if="ownsCurriculum"
      v-model:open="showAddSubTopicDialog"
      add-type="subtopic"
      grade-level-id=""
      subject-id=""
      :topic-id="topicId === ALL_VALUE ? '' : topicId"
    />

    <CurriculumDeleteDialog
      v-if="ownsCurriculum"
      v-model:open="showDeleteSubTopicDialog"
      delete-type="subtopic"
      :item-name="deleteSubTopicName"
      grade-level-id=""
      subject-id=""
      :topic-id="topicId === ALL_VALUE ? '' : topicId"
      stage-id=""
      :sub-topic-id="deleteSubTopicId"
      @deleted="handleSubTopicDeleted"
    />
  </div>
</template>
