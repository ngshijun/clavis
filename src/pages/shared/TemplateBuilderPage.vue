<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAssessmentTemplatesStore, type TemplateQuestion } from '@/stores/assessment-templates'
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
import TemplateBankPickerDialog from '@/components/admin/TemplateBankPickerDialog.vue'
import TagMultiSelect from '@/components/admin/TagMultiSelect.vue'
import SaveStatusPill from '@/components/shared/SaveStatusPill.vue'
import { toast } from 'vue-sonner'
import { useAutosave } from '@/composables/useAutosave'
import { useT } from '@/composables/useT'

/**
 * The template composer (decision 89). Its questions ARE bank questions:
 * writing one here creates it in the bank, editing one here edits the bank
 * row — and therefore every template that holds it — and removing one only
 * drops this template's reference. The cards are the bank's cards, footer
 * controls included (difficulty, filing, learning points).
 *
 * Two readers: the admin, who edits; and a teacher previewing a published
 * template from their library, for whom everything is read-only and the one
 * action is "Use Template" — a clone into the classroom in the URL.
 */
const t = useT()
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const languageStore = useLanguageStore()
const templatesStore = useAssessmentTemplatesStore()
const curriculumStore = useCurriculumStore()
const { classroomId, basePath } = useActiveClassroom()

const templateId = computed(() => String(route.params.templateId))
const template = computed(() => templatesStore.currentTemplate)
const isPublished = computed(() => template.value?.status === 'published')

const isEditable = computed(() => authStore.isAdmin)
const isPreview = computed(() => !authStore.isAdmin)

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
  const current = template.value
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
    const { error } = await templatesStore.updateTemplate(templateId.value, {
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
    const { error } = await templatesStore.updateTemplate(templateId.value, { status: next })
    if (error) {
      toast.error(error)
      return
    }
    toast.success(
      next === 'published'
        ? t.value.staff.templates.toastPublished
        : t.value.staff.templates.toastUnpublished,
    )
    showStatusDialog.value = false
  } finally {
    isChangingStatus.value = false
  }
}

// ── loading ────────────────────────────────────────────────

async function loadTemplate() {
  notFound.value = false
  expandedId.value = null
  const [{ error }] = await Promise.all([
    templatesStore.fetchTemplateDetail(templateId.value),
    curriculumStore.gradeLevels.length === 0 ? curriculumStore.fetchCurriculum() : null,
  ])
  if (error || !templatesStore.currentTemplate) {
    notFound.value = true
    return
  }
  syncSettings()
  const requested = route.query.tab
  if (isBuilderTab(requested)) activeTab.value = requested
}

onMounted(loadTemplate)
watch(templateId, () => {
  if (route.params.templateId) loadTemplate()
})
watch(template, syncSettings)

watch(activeTab, (tab) => {
  void router.replace({
    query: { ...route.query, tab: tab === 'questions' ? undefined : tab },
  })
})

// ── curriculum filing (the template's subject) ─────────────

const subject = computed(() =>
  template.value ? curriculumStore.getSubjectById(template.value.subjectId) : undefined,
)
const subjectTopics = computed(() => subject.value?.topics ?? [])
/** Where a question written here is filed until the admin moves it. */
const defaultSubTopicId = computed(
  () => subjectTopics.value.flatMap((topic) => topic.subTopics)[0]?.id ?? null,
)

// ── questions ──────────────────────────────────────────────

const expandedId = ref<string | null>(null)
const showBankPicker = ref(false)
const autosave = useAutosave({ onError: (message) => toast.error(message) })

const imageFolderOf = (item: TemplateQuestion) => `bank/${item.id}`

function handleReorder(orderedIds: string[]) {
  const id = templateId.value
  const previousIds = templatesStore.applyQuestionOrder(orderedIds)
  if (!previousIds) return
  autosave.enqueue(`order:${id}`, orderedIds, {
    previous: previousIds,
    save: (ids) => templatesStore.persistQuestionOrder(id, ids),
    rollback: (ids) => void templatesStore.applyQuestionOrder(ids),
  })
}

/**
 * Images dropped by an edit are deleted only AFTER the payload save that
 * drops the reference confirms (decision 78).
 */
const pendingImageDeletes = new Map<string, Set<string>>()

function handleImageOrphaned(item: TemplateQuestion, path: string) {
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

function handlePayloadChange(item: TemplateQuestion, payload: AdhocPayload) {
  const previous = item.payload
  templatesStore.applyQuestionPatch(item.id, { payload })
  autosave.enqueue(`payload:${item.id}`, payload, {
    previous,
    save: async (value) => {
      const result = await templatesStore.persistQuestionPatch(item.id, { payload: value })
      if (!result.error) flushOrphanedImages(item.id, value)
      return result
    },
    rollback: (confirmed) => {
      pendingImageDeletes.delete(item.id)
      templatesStore.applyQuestionPatch(item.id, { payload: confirmed })
    },
  })
}

function handlePointsChange(item: TemplateQuestion, points: number) {
  const previous = item.points
  templatesStore.applyQuestionPatch(item.id, { points })
  autosave.enqueue(`points:${item.id}`, points, {
    previous,
    save: (value) => templatesStore.persistQuestionPatch(item.id, { points: value }),
    rollback: (confirmed) => templatesStore.applyQuestionPatch(item.id, { points: confirmed }),
  })
}

/** Difficulty, filing and tags are discrete picks — saved on change. */
async function handleDifficultyChange(item: TemplateQuestion, value: unknown) {
  const difficulty = value as QuestionDifficulty
  if (difficulty === item.difficulty) return
  const { error } = await templatesStore.persistQuestionPatch(item.id, { difficulty })
  if (error) toast.error(error)
}

async function handleSubTopicChange(item: TemplateQuestion, value: unknown) {
  const subTopicId = String(value ?? '')
  if (!subTopicId || subTopicId === item.subTopicId) return
  const { error } = await templatesStore.persistQuestionPatch(item.id, { subTopicId })
  if (error) toast.error(error)
}

async function handleTagsChange(item: TemplateQuestion, tagIds: string[]) {
  const { error } = await templatesStore.setQuestionTags(item.id, tagIds)
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
    toast.error(t.value.staff.templates.noSubTopics)
    return
  }
  const { id, error } = await templatesStore.createQuestion(templateId.value, {
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
async function handleDuplicate(item: TemplateQuestion) {
  const { id, error } = await templatesStore.createQuestion(templateId.value, {
    payload: item.payload,
    subTopicId: item.subTopicId,
    difficulty: item.difficulty,
    points: item.points,
  })
  if (error || !id) {
    toast.error(error ?? '')
    return
  }
  if (item.tagIds.length > 0) await templatesStore.setQuestionTags(id, item.tagIds)
  expandedId.value = id
}

/** Drops the reference only — the bank keeps the question. */
async function handleRemove(item: TemplateQuestion) {
  const { error } = await templatesStore.removeQuestion(templateId.value, item.id)
  if (error) {
    toast.error(error)
    return
  }
  pendingImageDeletes.delete(item.id)
  if (expandedId.value === item.id) expandedId.value = null
  toast.success(t.value.staff.templates.toastQuestionRemoved)
}

// ── teacher: use template ──────────────────────────────────

const showUseDialog = ref(false)
const isCloning = ref(false)

async function handleUseTemplate() {
  isCloning.value = true
  try {
    const targetClassroomId = classroomId.value
    if (!targetClassroomId) {
      toast.error(t.value.shared.errors.failedCloneTemplate)
      return
    }
    const { id, error } = await templatesStore.cloneTemplate(templateId.value, targetClassroomId)
    if (error || !id) {
      toast.error(error ?? t.value.shared.errors.failedCloneTemplate)
      return
    }
    toast.success(t.value.staff.templates.toastCloned)
    showUseDialog.value = false
    router.push(`${basePath.value}/assessments/${id}`)
  } finally {
    isCloning.value = false
  }
}
</script>

<template>
  <div class="p-6">
    <Button variant="ghost" size="sm" class="-ml-2 mb-4" @click="router.push(backPath)">
      <ArrowLeft class="mr-2 size-4" />
      {{ isPreview ? t.staff.templates.backToLibrary : t.staff.templates.backToTemplates }}
    </Button>

    <div v-if="templatesStore.isLoadingCurrent" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <div v-else-if="notFound || !template" class="py-16 text-center">
      <ClipboardList class="mx-auto size-16 text-muted-foreground/50" />
      <p class="mt-4 text-muted-foreground">{{ t.staff.templates.notFound }}</p>
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
          <Badge variant="outline"
            >{{ template.gradeLevelName }} · {{ template.subjectName }}</Badge
          >
          <SaveStatusPill v-if="isEditable" :status="autosave.status.value" />
        </div>
        <div class="flex shrink-0 items-center gap-2">
          <Button v-if="isPreview" @click="showUseDialog = true">
            <Copy class="mr-2 size-4" />
            {{ t.staff.templates.useTemplate }}
          </Button>
          <Button v-else-if="isPublished" variant="outline" @click="showStatusDialog = true">
            <Undo2 class="mr-2 size-4" />
            {{ t.staff.templates.unpublish }}
          </Button>
          <Button
            v-else
            :disabled="templatesStore.currentQuestions.length === 0"
            @click="showStatusDialog = true"
          >
            <Send class="mr-2 size-4" />
            {{ t.staff.templates.publish }}
          </Button>
        </div>
      </div>

      <div class="mb-4 flex items-start gap-2 rounded-md border p-3 text-sm text-muted-foreground">
        <Info class="mt-0.5 size-4 shrink-0" />
        {{ isPreview ? t.staff.templates.previewBanner : t.staff.templates.banner }}
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
          <div class="editor-column">
            <p class="mb-4 text-sm text-muted-foreground">
              {{ t.staff.templates.questionsDesc(templatesStore.currentQuestions.length) }}
            </p>

            <div
              v-if="templatesStore.currentQuestions.length === 0"
              class="rounded-lg border border-dashed p-12 text-center"
            >
              <div class="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
                <Plus class="size-6 text-muted-foreground" />
              </div>
              <h3 class="mt-4 text-lg font-medium">{{ t.staff.builder.noQuestions }}</h3>
              <p class="mt-2 text-sm text-muted-foreground">
                {{ t.staff.templates.noQuestionsDesc }}
              </p>
              <div v-if="isEditable" class="mt-4 flex justify-center gap-2">
                <Button size="sm" @click="handleAddQuestion">
                  <Plus class="mr-2 size-4" />
                  {{ t.staff.builder.addAdhoc }}
                </Button>
                <Button variant="outline" size="sm" @click="showBankPicker = true">
                  <Library class="mr-2 size-4" />
                  {{ t.staff.builder.addFromQuestionBank }}
                </Button>
              </div>
            </div>

            <AssessmentQuestionList
              v-else
              v-model:expanded-id="expandedId"
              :items="templatesStore.currentQuestions"
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
                      <SelectGroup v-for="topic in subjectTopics" :key="topic.id">
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
                    @update:model-value="(tagIds) => handleTagsChange(item, tagIds)"
                  />
                  <Badge v-if="item.usedInTemplates > 1" variant="outline">
                    {{ t.staff.templates.usedIn(item.usedInTemplates) }}
                  </Badge>
                </div>
              </template>
            </AssessmentQuestionList>
          </div>
        </TabsContent>

        <TabsContent value="settings" class="pt-4">
          <Card class="editor-column">
            <CardHeader>
              <CardTitle>{{ t.staff.builder.settingsTitle }}</CardTitle>
            </CardHeader>
            <CardContent class="space-y-4">
              <Field>
                <FieldLabel for="template-title"
                  >{{ t.staff.builder.titleLabel }}
                  <span class="text-destructive">*</span></FieldLabel
                >
                <Input
                  id="template-title"
                  v-model="title"
                  :disabled="!isEditable || isSavingSettings"
                />
              </Field>

              <Field>
                <FieldLabel for="template-description">{{
                  t.staff.builder.descriptionLabel
                }}</FieldLabel>
                <Textarea
                  id="template-description"
                  v-model="description"
                  :placeholder="t.staff.builder.descriptionPlaceholder"
                  rows="3"
                  :disabled="!isEditable || isSavingSettings"
                />
              </Field>

              <Field>
                <FieldLabel for="template-time-limit">{{
                  t.staff.builder.timeLimitLabel
                }}</FieldLabel>
                <Input
                  id="template-time-limit"
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
                  <FieldLabel for="template-shuffle">{{ t.staff.builder.shuffleLabel }}</FieldLabel>
                  <FieldDescription>{{ t.staff.builder.shuffleHint }}</FieldDescription>
                </div>
                <Switch
                  id="template-shuffle"
                  v-model="shuffleQuestions"
                  :disabled="!isEditable || isSavingSettings"
                />
              </Field>

              <!-- The pairing is fixed at creation: it decides both who may
                   see the template and which bank questions it may hold. -->
              <Field>
                <FieldLabel>{{ t.staff.templates.scopeCol }}</FieldLabel>
                <p class="text-sm">{{ template.gradeLevelName }} · {{ template.subjectName }}</p>
                <FieldDescription>{{ t.staff.templates.scopeHint }}</FieldDescription>
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

      <TemplateBankPickerDialog
        v-if="isEditable"
        v-model:open="showBankPicker"
        :template-id="templateId"
        :subject-id="template.subjectId"
        :exclude-ids="templatesStore.currentQuestions.map((question) => question.id)"
      />

      <!-- Publish / unpublish -->
      <Dialog v-model:open="showStatusDialog">
        <DialogContent class="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{{
              isPublished ? t.staff.templates.unpublishTitle : t.staff.templates.publishTitle
            }}</DialogTitle>
            <DialogDescription>{{
              isPublished ? t.staff.templates.unpublishDesc : t.staff.templates.publishDesc
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
              {{ isPublished ? t.staff.templates.unpublish : t.staff.templates.publish }}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <!-- Use template (teacher preview) -->
      <Dialog v-if="isPreview" v-model:open="showUseDialog">
        <DialogContent class="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{{ t.staff.templates.useTemplateTitle }}</DialogTitle>
            <DialogDescription>{{
              t.staff.templates.useTemplateDesc(template.title)
            }}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" :disabled="isCloning" @click="showUseDialog = false">
              {{ t.staff.assessments.cancel }}
            </Button>
            <Button :disabled="isCloning" @click="handleUseTemplate">
              <Loader2 v-if="isCloning" class="mr-2 size-4 animate-spin" />
              {{ t.staff.templates.useTemplateConfirm }}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </template>
  </div>
</template>
