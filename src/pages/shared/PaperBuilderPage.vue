<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { usePapersStore, type PaperItem } from '@/stores/papers'
import { useAssessmentsStore } from '@/stores/assessments'
import { DIFFICULTIES, type QuestionDifficulty } from '@/stores/assessment-bank'
import { useAuthStore } from '@/stores/auth'
import { useCurriculumStore } from '@/stores/curriculum'
import { useLanguageStore } from '@/stores/language'
import { useActiveClassroom } from '@/composables/useActiveClassroom'
import { collectAdhocPayloadImagePaths, type AdhocPayload } from '@/lib/adhocPayload'
import { removeStorageObjects } from '@/lib/storage'
import {
  ArrowLeft,
  ClipboardList,
  Copy,
  Info,
  Library,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Undo2,
} from 'lucide-vue-next'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldLabel, FieldDescription, FieldError } from '@/components/ui/field'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import AssessmentQuestionList from '@/components/staff/AssessmentQuestionList.vue'
import PaperBankPickerDialog from '@/components/shared/PaperBankPickerDialog.vue'
import TagMultiSelect from '@/components/admin/TagMultiSelect.vue'
import SaveStatusPill from '@/components/shared/SaveStatusPill.vue'
import { toast } from 'vue-sonner'
import { useAutosave } from '@/composables/useAutosave'
import { useT } from '@/composables/useT'

/**
 * The paper composer (decision 91). Its items ARE bank items: writing one
 * here creates it in the bank, editing one here edits the bank row — and
 * therefore every paper that holds it — and removing one only drops this
 * paper's reference. The cards are the bank's cards, footer controls included
 * (difficulty, filing, learning points).
 *
 * One screen, two readers, decided by who owns the paper rather than by role:
 * its owner edits it (an admin the platform's, a teacher their center's), and
 * anyone else reads it, with "Adopt" to take a copy into their own library
 * and "Use in class" to deliver it to the classroom in the URL.
 */
const t = useT()
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const languageStore = useLanguageStore()
const papersStore = usePapersStore()
const assessmentsStore = useAssessmentsStore()
const curriculumStore = useCurriculumStore()
const { classroomId, basePath } = useActiveClassroom()

const paperId = computed(() => String(route.params.paperId))
const paper = computed(() => papersStore.currentPaper)
const isPublished = computed(() => paper.value?.status === 'published')

/** The owner edits; everyone else who can see it reads. */
const isEditable = computed(() => {
  const current = paper.value
  if (!current) return false
  return current.organizationId === null
    ? authStore.isAdmin
    : authStore.isTeacher && current.organizationId === authStore.organizationId
})
const isPreview = computed(() => !isEditable.value)
/** Only a platform paper has a status that means anything: it gates who sees it. */
const isPlatformPaper = computed(() => paper.value?.organizationId === null)
const canDeliver = computed(() => authStore.isTeacher && classroomId.value !== null)

const notFound = ref(false)

const backPath = computed(() =>
  isPreview.value ? `${basePath.value}/templates` : '/admin/templates',
)

// ── tabs ───────────────────────────────────────────────────

const TAB_VALUES = ['questions', 'settings'] as const
type BuilderTab = (typeof TAB_VALUES)[number]
const activeTab = ref<BuilderTab>('questions')

function isBuilderTab(value: unknown): value is BuilderTab {
  return typeof value === 'string' && (TAB_VALUES as readonly string[]).includes(value)
}

// ── settings ───────────────────────────────────────────────

const title = ref('')
const description = ref('')
const timeLimitMinutes = ref('')
const shuffleQuestions = ref(false)
const settingsError = ref<string | null>(null)
const isSavingSettings = ref(false)

function syncSettings() {
  const current = paper.value
  if (!current) return
  title.value = current.title
  description.value = current.description ?? ''
  timeLimitMinutes.value =
    current.timeLimitSeconds !== null ? String(Math.round(current.timeLimitSeconds / 60)) : ''
  shuffleQuestions.value = current.shuffleQuestions
}

async function handleSaveSettings() {
  const trimmedTitle = title.value.trim()
  if (!trimmedTitle) {
    settingsError.value = t.value.staff.builder.validationTitle
    return
  }

  let timeLimitSeconds: number | null = null
  if (timeLimitMinutes.value.trim() !== '') {
    const minutes = Number(timeLimitMinutes.value)
    if (!Number.isInteger(minutes) || minutes <= 0) {
      settingsError.value = t.value.staff.builder.validationTimeLimit
      return
    }
    timeLimitSeconds = minutes * 60
  }
  settingsError.value = null

  isSavingSettings.value = true
  try {
    const { error } = await papersStore.updatePaper(paperId.value, {
      title: trimmedTitle,
      description: description.value.trim() || null,
      timeLimitSeconds,
      shuffleQuestions: shuffleQuestions.value,
    })
    if (error) {
      toast.error(error)
      return
    }
    toast.success(t.value.staff.builder.toastSettingsSaved)
  } finally {
    isSavingSettings.value = false
  }
}

// ── publish / unpublish ────────────────────────────────────
// Status only controls visibility to centers; content is never locked.

const showStatusDialog = ref(false)
const isChangingStatus = ref(false)

async function handleToggleStatus() {
  isChangingStatus.value = true
  try {
    const next = isPublished.value ? 'draft' : 'published'
    const { error } = await papersStore.updatePaper(paperId.value, { status: next })
    if (error) {
      toast.error(error)
      return
    }
    toast.success(
      next === 'published'
        ? t.value.staff.papers.toastPublished
        : t.value.staff.papers.toastUnpublished,
    )
    showStatusDialog.value = false
  } finally {
    isChangingStatus.value = false
  }
}

// ── loading ────────────────────────────────────────────────

async function loadPaper() {
  notFound.value = false
  expandedId.value = null
  const [{ error }] = await Promise.all([
    papersStore.fetchPaperDetail(paperId.value),
    curriculumStore.gradeLevels.length === 0 ? curriculumStore.fetchCurriculum() : null,
  ])
  if (error || !papersStore.currentPaper) {
    notFound.value = true
    return
  }
  syncSettings()
  const requested = route.query.tab
  if (isBuilderTab(requested)) activeTab.value = requested
}

onMounted(loadPaper)
watch(paperId, () => {
  if (route.params.paperId) loadPaper()
})
watch(paper, syncSettings)

watch(activeTab, (tab) => {
  void router.replace({
    query: { ...route.query, tab: tab === 'questions' ? undefined : tab },
  })
})

// ── curriculum filing ──────────────────────────────────────
//
// A paper stores no subject: each item is filed in the bank, and the filing
// dropdown offers the topics of THAT item's own subject. A question written
// here is filed beside the last item, which is why an empty paper starts from
// the bank picker instead.

function topicsFor(subTopicId: string) {
  return curriculumStore.getSubTopicWithHierarchy(subTopicId)?.subject.topics ?? []
}

const defaultSubTopicId = computed(
  () => papersStore.currentItems[papersStore.currentItems.length - 1]?.subTopicId ?? null,
)

// ── questions ──────────────────────────────────────────────

const expandedId = ref<string | null>(null)
const showBankPicker = ref(false)
const autosave = useAutosave({ onError: (message) => toast.error(message) })

const imageFolderOf = (item: PaperItem) => `bank/${item.id}`

function handleReorder(orderedIds: string[]) {
  const id = paperId.value
  const previousIds = papersStore.applyItemOrder(orderedIds)
  if (!previousIds) return
  autosave.enqueue(`order:${id}`, orderedIds, {
    previous: previousIds,
    save: (ids) => papersStore.persistItemOrder(id, ids),
    rollback: (ids) => void papersStore.applyItemOrder(ids),
  })
}

/**
 * Images dropped by an edit are deleted only AFTER the payload save that
 * drops the reference confirms (decision 78).
 */
const pendingImageDeletes = new Map<string, Set<string>>()

function handleImageOrphaned(item: PaperItem, path: string) {
  const pending = pendingImageDeletes.get(item.id) ?? new Set<string>()
  pending.add(path)
  pendingImageDeletes.set(item.id, pending)
}

function flushOrphanedImages(id: string, saved: AdhocPayload) {
  const pending = pendingImageDeletes.get(id)
  if (!pending || pending.size === 0) return
  const referenced = new Set(collectAdhocPayloadImagePaths(saved))
  const removable = [...pending].filter((path) => !referenced.has(path))
  for (const path of removable) pending.delete(path)
  void removeStorageObjects('assessment-images', removable)
}

function handlePayloadChange(item: PaperItem, payload: AdhocPayload) {
  const previous = item.payload
  papersStore.applyItemPatch(item.id, { payload })
  autosave.enqueue(`payload:${item.id}`, payload, {
    previous,
    save: async (value) => {
      const result = await papersStore.persistItemPatch(item.id, { payload: value })
      if (!result.error) flushOrphanedImages(item.id, value)
      return result
    },
    rollback: (confirmed) => {
      pendingImageDeletes.delete(item.id)
      papersStore.applyItemPatch(item.id, { payload: confirmed })
    },
  })
}

function handlePointsChange(item: PaperItem, points: number) {
  const previous = item.points
  papersStore.applyItemPatch(item.id, { points })
  autosave.enqueue(`points:${item.id}`, points, {
    previous,
    save: (value) => papersStore.persistItemPatch(item.id, { points: value }),
    rollback: (confirmed) => papersStore.applyItemPatch(item.id, { points: confirmed }),
  })
}

/** Difficulty, filing and tags are discrete picks — saved on change. */
async function handleDifficultyChange(item: PaperItem, value: unknown) {
  const difficulty = value as QuestionDifficulty
  if (difficulty === item.difficulty) return
  const { error } = await papersStore.persistItemPatch(item.id, { difficulty })
  if (error) toast.error(error)
}

async function handleSubTopicChange(item: PaperItem, value: unknown) {
  const subTopicId = String(value ?? '')
  if (!subTopicId || subTopicId === item.subTopicId) return
  const { error } = await papersStore.persistItemPatch(item.id, { subTopicId })
  if (error) toast.error(error)
}

/**
 * Learning points are scoped to TOPICS (P19a), so a bank question's tag
 * picker offers the points of the topic its sub-topic sits under.
 */
function topicIdsFor(subTopicId: string): string[] {
  const topicId = curriculumStore.getSubTopicWithHierarchy(subTopicId)?.topic.id
  return topicId ? [topicId] : []
}

async function handleTagsChange(item: PaperItem, tagIds: string[]) {
  const { error } = await papersStore.setItemTags(item.id, tagIds)
  if (error) toast.error(error)
}

function placeholderPayload(): AdhocPayload {
  return {
    type: 'mcq',
    question: t.value.staff.builder.untitledQuestion,
    options: [
      { text: t.value.staff.adhocForm.optionPlaceholder(1), is_correct: true },
      { text: t.value.staff.adhocForm.optionPlaceholder(2), is_correct: false },
    ],
  }
}

/** Author a question here: it is created in the bank and referenced. */
async function handleAddQuestion() {
  const subTopicId = defaultSubTopicId.value
  if (!subTopicId) {
    toast.error(t.value.staff.papers.noSubTopics)
    return
  }
  const { id, error } = await papersStore.createItem(paperId.value, {
    payload: placeholderPayload(),
    subTopicId,
  })
  if (error || !id) {
    toast.error(error ?? '')
    return
  }
  expandedId.value = id
}

/** A duplicate is a NEW bank question with the same content and filing. */
async function handleDuplicate(item: PaperItem) {
  const { id, error } = await papersStore.createItem(paperId.value, {
    payload: item.payload,
    subTopicId: item.subTopicId,
    difficulty: item.difficulty,
    points: item.points,
  })
  if (error || !id) {
    toast.error(error ?? '')
    return
  }
  if (item.tagIds.length > 0) await papersStore.setItemTags(id, item.tagIds)
  expandedId.value = id
}

/** Drops the reference only — the bank keeps the question. */
async function handleRemove(item: PaperItem) {
  const { error } = await papersStore.removeItem(paperId.value, item.id)
  if (error) {
    toast.error(error)
    return
  }
  pendingImageDeletes.delete(item.id)
  if (expandedId.value === item.id) expandedId.value = null
  toast.success(t.value.staff.papers.toastQuestionRemoved)
}

// ── teacher: adopt, or deliver into the classroom ──────────

const showUseDialog = ref(false)
const isDelivering = ref(false)
const isAdopting = ref(false)

/** Deliver: a draft assessment in this classroom that names the paper. */
async function handleDeliver() {
  const targetClassroomId = classroomId.value
  if (!targetClassroomId) return
  isDelivering.value = true
  try {
    const { id, error } = await assessmentsStore.deliverPaper({
      paperId: paperId.value,
      classroomId: targetClassroomId,
    })
    if (error || !id) {
      toast.error(error ?? '')
      return
    }
    toast.success(t.value.staff.papers.toastDelivered)
    showUseDialog.value = false
    router.push(`${basePath.value}/assessments/${id}`)
  } finally {
    isDelivering.value = false
  }
}

// ── re-roll one generated item (decision 90) ───────────────

const regenerateTarget = ref<PaperItem | null>(null)
const isRegenerating = ref(false)

async function handleRegenerate() {
  const target = regenerateTarget.value
  if (!target) return
  isRegenerating.value = true
  try {
    const { error } = await papersStore.regenerateItem(paperId.value, target.id)
    if (error) {
      toast.error(error)
      return
    }
    toast.success(t.value.staff.generate.toastRegenerated)
    regenerateTarget.value = null
  } finally {
    isRegenerating.value = false
  }
}

/** Adopt: a copy in this center's library, editable, referencing the same items. */
async function handleAdopt() {
  isAdopting.value = true
  try {
    const { id, error } = await papersStore.adoptPaper(paperId.value)
    if (error || !id) {
      toast.error(error ?? '')
      return
    }
    toast.success(t.value.staff.papers.toastAdopted)
    router.push(`${basePath.value}/papers/${id}`)
  } finally {
    isAdopting.value = false
  }
}
</script>

<template>
  <div class="p-6">
    <Button variant="ghost" size="sm" class="-ml-2 mb-4" @click="router.push(backPath)">
      <ArrowLeft class="mr-2 size-4" />
      {{ isPreview ? t.staff.papers.backToLibrary : t.staff.papers.backToPapers }}
    </Button>

    <div v-if="papersStore.isLoadingCurrent" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <div v-else-if="notFound || !paper" class="py-16 text-center">
      <ClipboardList class="mx-auto size-16 text-muted-foreground/50" />
      <p class="mt-4 text-muted-foreground">{{ t.staff.papers.notFound }}</p>
    </div>

    <template v-else>
      <!-- Header: status, pairing, autosave; publish or use -->
      <div class="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div class="flex flex-wrap items-center gap-3">
          <Badge
            v-if="isPublished"
            variant="secondary"
            class="bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
          >
            {{ t.staff.assessments.statusPublished }}
          </Badge>
          <Badge v-else variant="secondary">{{ t.staff.assessments.statusDraft }}</Badge>
          <Badge variant="outline">
            {{ isPlatformPaper ? t.staff.papers.platformOwner : t.staff.papers.centerOwner }}
          </Badge>
          <SaveStatusPill v-if="isEditable" :status="autosave.status.value" />
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <Button
            v-if="isPreview && !isEditable"
            variant="outline"
            :disabled="isAdopting"
            @click="handleAdopt"
          >
            <Loader2 v-if="isAdopting" class="mr-2 size-4 animate-spin" />
            <Copy v-else class="mr-2 size-4" />
            {{ t.staff.papers.adopt }}
          </Button>
          <Button v-if="canDeliver" @click="showUseDialog = true">
            <Send class="mr-2 size-4" />
            {{ t.staff.papers.useInClass }}
          </Button>
          <template v-if="isEditable && isPlatformPaper">
            <Button v-if="isPublished" variant="outline" @click="showStatusDialog = true">
              <Undo2 class="mr-2 size-4" />
              {{ t.staff.papers.unpublish }}
            </Button>
            <Button
              v-else
              :disabled="papersStore.currentItems.length === 0"
              @click="showStatusDialog = true"
            >
              <Send class="mr-2 size-4" />
              {{ t.staff.papers.publish }}
            </Button>
          </template>
        </div>
      </div>

      <div class="mb-4 flex items-start gap-2 rounded-md border p-3 text-sm text-muted-foreground">
        <Info class="mt-0.5 size-4 shrink-0" />
        {{ isPreview ? t.staff.papers.previewBanner : t.staff.papers.banner }}
      </div>

      <Tabs
        :model-value="activeTab"
        @update:model-value="(value) => (activeTab = isBuilderTab(value) ? value : 'questions')"
      >
        <TabsList class="mx-auto">
          <TabsTrigger value="questions">{{ t.staff.builder.questionsTitle }}</TabsTrigger>
          <TabsTrigger value="settings">{{ t.staff.builder.settingsTitle }}</TabsTrigger>
        </TabsList>

        <TabsContent value="questions" class="pt-4">
          <div>
            <p class="mb-4 text-sm text-muted-foreground">
              {{ t.staff.papers.questionsDesc(papersStore.currentItems.length) }}
            </p>

            <div
              v-if="papersStore.currentItems.length === 0"
              class="rounded-lg border border-dashed p-12 text-center"
            >
              <div class="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
                <Plus class="size-6 text-muted-foreground" />
              </div>
              <h3 class="mt-4 text-lg font-medium">{{ t.staff.builder.noQuestions }}</h3>
              <p class="mt-2 text-sm text-muted-foreground">
                {{ t.staff.papers.noQuestionsDesc }}
              </p>
              <div v-if="isEditable" class="mt-4 flex justify-center gap-2">
                <Button size="sm" @click="showBankPicker = true">
                  <Library class="mr-2 size-4" />
                  {{ t.staff.builder.addFromQuestionBank }}
                </Button>
              </div>
            </div>

            <AssessmentQuestionList
              v-else
              v-model:expanded-id="expandedId"
              :items="papersStore.currentItems"
              :editable="isEditable"
              :image-folder-of="imageFolderOf"
              :show-question-bank="isEditable"
              :show-explanation="false"
              @reorder="handleReorder"
              @payload-change="handlePayloadChange"
              @points-change="handlePointsChange"
              @image-orphaned="handleImageOrphaned"
              @duplicate="handleDuplicate"
              @remove="handleRemove"
              @add-question="handleAddQuestion"
              @add-from-question-bank="showBankPicker = true"
            >
              <template v-if="isEditable" #meta="{ item }">
                <div class="mr-auto flex flex-wrap items-center gap-2">
                  <Select
                    :key="`diff-${item.id}-${languageStore.language}`"
                    :model-value="item.difficulty"
                    @update:model-value="(value) => handleDifficultyChange(item, value)"
                  >
                    <SelectTrigger class="h-8 w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem v-for="level in DIFFICULTIES" :key="level" :value="level">
                        {{ t.shared.difficulties[level] }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    :key="`st-${item.id}-${languageStore.language}`"
                    :model-value="item.subTopicId"
                    @update:model-value="(value) => handleSubTopicChange(item, value)"
                  >
                    <SelectTrigger class="h-8 w-52"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectGroup v-for="topic in topicsFor(item.subTopicId)" :key="topic.id">
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
                  <TagMultiSelect
                    :model-value="item.tagIds"
                    :topic-ids="topicIdsFor(item.subTopicId)"
                    @update:model-value="(tagIds) => handleTagsChange(item, tagIds)"
                  />
                  <Button
                    v-if="item.generationLine !== null"
                    variant="outline"
                    size="sm"
                    @click="regenerateTarget = item"
                  >
                    <RefreshCw class="mr-2 size-4" />
                    {{ t.staff.generate.regenerate }}
                  </Button>
                  <Badge v-if="item.usedInPapers > 1" variant="outline">
                    {{ t.staff.papers.usedIn(item.usedInPapers) }}
                  </Badge>
                </div>
              </template>
            </AssessmentQuestionList>
          </div>
        </TabsContent>

        <TabsContent value="settings" class="pt-4">
          <Card>
            <CardHeader>
              <CardTitle>{{ t.staff.builder.settingsTitle }}</CardTitle>
            </CardHeader>
            <CardContent class="space-y-4">
              <Field>
                <FieldLabel for="paper-title"
                  >{{ t.staff.builder.titleLabel }}
                  <span class="text-destructive">*</span></FieldLabel
                >
                <Input
                  id="paper-title"
                  v-model="title"
                  :disabled="!isEditable || isSavingSettings"
                />
              </Field>

              <Field>
                <FieldLabel for="paper-description">{{
                  t.staff.builder.descriptionLabel
                }}</FieldLabel>
                <Textarea
                  id="paper-description"
                  v-model="description"
                  :placeholder="t.staff.builder.descriptionPlaceholder"
                  rows="3"
                  :disabled="!isEditable || isSavingSettings"
                />
              </Field>

              <Field>
                <FieldLabel for="paper-time-limit">{{ t.staff.builder.timeLimitLabel }}</FieldLabel>
                <Input
                  id="paper-time-limit"
                  v-model="timeLimitMinutes"
                  type="number"
                  min="1"
                  step="1"
                  :disabled="!isEditable || isSavingSettings"
                />
                <FieldDescription>{{ t.staff.builder.timeLimitHint }}</FieldDescription>
              </Field>

              <Field orientation="horizontal">
                <div>
                  <FieldLabel for="paper-shuffle">{{ t.staff.builder.shuffleLabel }}</FieldLabel>
                  <FieldDescription>{{ t.staff.builder.shuffleHint }}</FieldDescription>
                </div>
                <Switch
                  id="paper-shuffle"
                  v-model="shuffleQuestions"
                  :disabled="!isEditable || isSavingSettings"
                />
              </Field>

              <FieldError :errors="settingsError ? [settingsError] : []" />

              <Button
                v-if="isEditable"
                class="w-full"
                :disabled="isSavingSettings"
                @click="handleSaveSettings"
              >
                <Loader2 v-if="isSavingSettings" class="mr-2 size-4 animate-spin" />
                {{ t.staff.builder.saveSettings }}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <PaperBankPickerDialog
        v-if="isEditable"
        v-model:open="showBankPicker"
        :paper-id="paperId"
        :exclude-ids="papersStore.currentItems.map((item) => item.id)"
      />

      <!-- Publish / unpublish -->
      <Dialog v-model:open="showStatusDialog">
        <DialogContent class="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{{
              isPublished ? t.staff.papers.unpublishTitle : t.staff.papers.publishTitle
            }}</DialogTitle>
            <DialogDescription>{{
              isPublished ? t.staff.papers.unpublishDesc : t.staff.papers.publishDesc
            }}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              :disabled="isChangingStatus"
              @click="showStatusDialog = false"
            >
              {{ t.staff.builder.cancel }}
            </Button>
            <Button :disabled="isChangingStatus" @click="handleToggleStatus">
              <Loader2 v-if="isChangingStatus" class="mr-2 size-4 animate-spin" />
              {{ isPublished ? t.staff.papers.unpublish : t.staff.papers.publish }}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <!-- Re-roll one generated item (decision 90) -->
      <Dialog
        :open="regenerateTarget !== null"
        @update:open="(value) => !value && !isRegenerating && (regenerateTarget = null)"
      >
        <DialogContent class="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{{ t.staff.generate.regenerateTitle }}</DialogTitle>
            <DialogDescription>{{ t.staff.generate.regenerateDesc }}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" :disabled="isRegenerating" @click="regenerateTarget = null">
              {{ t.staff.builder.cancel }}
            </Button>
            <Button :disabled="isRegenerating" @click="handleRegenerate">
              <Loader2 v-if="isRegenerating" class="mr-2 size-4 animate-spin" />
              {{ t.staff.generate.regenerate }}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <!-- Deliver into the classroom in the URL -->
      <Dialog v-if="canDeliver" v-model:open="showUseDialog">
        <DialogContent class="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{{ t.staff.papers.useInClassTitle }}</DialogTitle>
            <DialogDescription>{{ t.staff.papers.useInClassDesc(paper.title) }}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" :disabled="isDelivering" @click="showUseDialog = false">
              {{ t.staff.assessments.cancel }}
            </Button>
            <Button :disabled="isDelivering" @click="handleDeliver">
              <Loader2 v-if="isDelivering" class="mr-2 size-4 animate-spin" />
              {{ t.staff.papers.useInClassConfirm }}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </template>
  </div>
</template>
