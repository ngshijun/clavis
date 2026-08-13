<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAssessmentsStore, type AssessmentQuestionItem } from '@/stores/assessments'
import { useAuthStore } from '@/stores/auth'
import { useCurriculumStore } from '@/stores/curriculum'
import {
  ArrowLeft,
  BarChart3,
  ClipboardList,
  Copy,
  Eye,
  EyeOff,
  Info,
  Loader2,
  Lock,
  Plus,
  Send,
  UserPlus,
} from 'lucide-vue-next'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldLabel, FieldDescription, FieldError } from '@/components/ui/field'
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
import AssessmentQuestionList from '@/components/staff/AssessmentQuestionList.vue'
import AdhocQuestionDialog from '@/components/staff/AdhocQuestionDialog.vue'
import BankQuestionPickerDialog from '@/components/staff/BankQuestionPickerDialog.vue'
import AssignDialog from '@/components/staff/AssignDialog.vue'
import OrderSaveStatusPill from '@/components/shared/OrderSaveStatusPill.vue'
import { toast } from 'vue-sonner'
import { useOrderPersistence } from '@/composables/useOrderPersistence'
import { useMarkingAuthz } from '@/composables/useMarkingAuthz'
import { useT } from '@/composables/useT'

const t = useT()
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const assessmentsStore = useAssessmentsStore()
const curriculumStore = useCurriculumStore()

const assessmentId = computed(() => String(route.params.assessmentId))
const basePath = computed(() => `/${authStore.userType}`)

const notFound = ref(false)

// Settings form state
const title = ref('')
const description = ref('')
const timeLimitMinutes = ref('')
const shuffleQuestions = ref(false)
const showAutoScoreWhilePending = ref(true)
const isSavingPendingVisibility = ref(false)

/**
 * Decision 70 toggle — saved immediately: marking happens AFTER publish,
 * when the rest of the settings card (and its save button) is locked.
 */
async function handlePendingVisibilityChange(value: boolean) {
  showAutoScoreWhilePending.value = value
  isSavingPendingVisibility.value = true
  try {
    const { error } = await assessmentsStore.updateAssessment(assessmentId.value, {
      showAutoScoreWhilePending: value,
    })
    if (error) {
      showAutoScoreWhilePending.value = !value
      toast.error(error)
      return
    }
    toast.success(t.value.staff.builder.toastSettingsSaved)
  } finally {
    isSavingPendingVisibility.value = false
  }
}
// Template pairing (admin template mode only): both required, never
// half-set — the P8a DB CHECK forbids clearing one side of the pairing.
const scopeGradeLevelId = ref('')
const scopeSubjectId = ref('')
const settingsError = ref<string | null>(null)
const isSavingSettings = ref(false)

// Dialogs
const showBankPicker = ref(false)
const showAdhocDialog = ref(false)
const showAssignDialog = ref(false)
const showPublishDialog = ref(false)
const editingQuestion = ref<AssessmentQuestionItem | null>(null)
const isPublishing = ref(false)

const assessment = computed(() => assessmentsStore.currentAssessment)
const isPublished = computed(() => assessment.value?.status === 'published')
/**
 * Platform template (admin-authored): never assigned or attempted, so the
 * assign/results/publish surfaces are hidden and the publish lock does not
 * apply — a template stays editable regardless of its status.
 */
const isTemplate = computed(() => assessment.value?.isTemplate ?? false)
/**
 * Org staff previewing a platform template: EXPLICITLY read-only.
 * `canEdit()` alone would pass for any manager (it mirrors the org-scoped
 * RLS), but template writes are admin-only — every edit would 403 — so the
 * template case is gated here instead of relying on canEdit.
 */
const isTemplatePreview = computed(() => isTemplate.value && !authStore.isAdmin)
const canEdit = computed(() =>
  assessment.value && !isTemplatePreview.value ? assessmentsStore.canEdit(assessment.value) : false,
)
/**
 * Published assessments are locked: `attempt_questions` snapshots reference
 * `assessment_questions` rows (ON DELETE CASCADE), so editing or removing a
 * question after publish would silently corrupt in-flight attempts.
 * Templates are exempt — they have no attempts to corrupt.
 */
const isEditable = computed(() => canEdit.value && (isTemplate.value || !isPublished.value))
/**
 * Admin editing a template's grade+subject pairing (P8a): the pairing decides
 * which centers can see the template and where clones can be assigned.
 */
const canEditScope = computed(() => isTemplate.value && authStore.isAdmin && isEditable.value)
/** Non-null pairing (template OR scoped clone) shown in the header. */
const scopeLabel = computed(() =>
  assessment.value?.gradeLevelName && assessment.value?.subjectName
    ? `${assessment.value.gradeLevelName} · ${assessment.value.subjectName}`
    : null,
)

// Manual answer release (decision 71): client mirror of the RPC authz —
// admin/manager always; a teacher only when the assessment reaches one of
// their classrooms/students. Templates are never assigned, so no release.
const { canMark, loadMarkingAuthz } = useMarkingAuthz()
const isReleased = computed(() => Boolean(assessment.value?.answersReleasedAt))
const canRelease = computed(() => !isTemplate.value && isPublished.value && canMark.value)
const showReleaseDialog = ref(false)
const isReleasing = ref(false)

async function handleToggleRelease() {
  isReleasing.value = true
  try {
    const { error } = await assessmentsStore.releaseAssessmentAnswers(
      assessmentId.value,
      !isReleased.value,
    )
    if (error) {
      toast.error(error)
      return
    }
    toast.success(
      isReleased.value
        ? t.value.staff.builder.toastReleased
        : t.value.staff.builder.toastUnreleased,
    )
    showReleaseDialog.value = false
  } finally {
    isReleasing.value = false
  }
}

// Cascading selectors: subjects belong to the selected grade level.
const scopeSubjects = computed(
  () =>
    curriculumStore.gradeLevels.find((grade) => grade.id === scopeGradeLevelId.value)?.subjects ??
    [],
)

function handleScopeGradeChange(gradeLevelId: unknown) {
  scopeGradeLevelId.value = String(gradeLevelId ?? '')
  scopeSubjectId.value = ''
}

const existingBankQuestionIds = computed(() =>
  assessmentsStore.currentQuestions
    .map((question) => question.questionId)
    .filter((id): id is string => Boolean(id)),
)

function syncSettings() {
  const current = assessment.value
  if (!current) return
  title.value = current.title
  description.value = current.description ?? ''
  timeLimitMinutes.value =
    current.timeLimitSeconds !== null ? String(Math.round(current.timeLimitSeconds / 60)) : ''
  shuffleQuestions.value = current.shuffleQuestions
  showAutoScoreWhilePending.value = current.showAutoScoreWhilePending
  scopeGradeLevelId.value = current.gradeLevelId ?? ''
  scopeSubjectId.value = current.subjectId ?? ''

  if (
    canEditScope.value &&
    curriculumStore.gradeLevels.length === 0 &&
    !curriculumStore.isLoading
  ) {
    curriculumStore.fetchCurriculum()
  }
}

async function loadAssessment() {
  notFound.value = false
  const { error } = await assessmentsStore.fetchAssessmentDetail(assessmentId.value)
  if (error || !assessmentsStore.currentAssessment) {
    notFound.value = true
    return
  }
  syncSettings()
  // Teacher branch of the release authz (admin/manager short-circuit).
  if (!assessmentsStore.currentAssessment.isTemplate) {
    void loadMarkingAuthz(assessmentId.value)
  }
}

onMounted(loadAssessment)

// Same route record, new id (template preview → its fresh clone): remount
// does not happen, so refetch on the param change.
watch(assessmentId, () => {
  if (route.params.assessmentId) loadAssessment()
})

watch(assessment, syncSettings)

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

  if (canEditScope.value && (!scopeGradeLevelId.value || !scopeSubjectId.value)) {
    settingsError.value = t.value.staff.builder.validationScope
    return
  }
  settingsError.value = null

  isSavingSettings.value = true
  try {
    const { error } = await assessmentsStore.updateAssessment(assessmentId.value, {
      title: trimmedTitle,
      description: description.value.trim() || null,
      timeLimitSeconds,
      shuffleQuestions: shuffleQuestions.value,
      ...(canEditScope.value
        ? { gradeLevelId: scopeGradeLevelId.value, subjectId: scopeSubjectId.value }
        : {}),
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

async function handlePublish() {
  isPublishing.value = true
  try {
    const { error } = await assessmentsStore.publishAssessment(assessmentId.value)
    if (error) {
      toast.error(error)
      return
    }
    toast.success(t.value.staff.builder.toastPublished)
    showPublishDialog.value = false
  } finally {
    isPublishing.value = false
  }
}

// Staff template preview: "Use Template" clones into the caller's org and
// lands in the (now editable) clone — same route record, param watch reloads.
const showUseTemplateDialog = ref(false)
const isCloning = ref(false)

async function handleUseTemplate() {
  isCloning.value = true
  try {
    const { id, error } = await assessmentsStore.cloneTemplate(assessmentId.value)
    if (error || !id) {
      toast.error(error ?? t.value.shared.errors.failedCloneTemplate)
      return
    }
    toast.success(t.value.staff.assessments.toastCloned)
    showUseTemplateDialog.value = false
    router.push(`${basePath.value}/assessments/${id}`)
  } finally {
    isCloning.value = false
  }
}

function openAdhocAdd() {
  editingQuestion.value = null
  showAdhocDialog.value = true
}

function openAdhocEdit(item: AssessmentQuestionItem) {
  editingQuestion.value = item
  showAdhocDialog.value = true
}

// Seamless reorder (decision 72b): the drag applies instantly in the store;
// persistence is debounced/coalesced fire-and-forget via the positional RPC.
// Dragging is never blocked — the pill next to the heading is the affordance.
const { status: orderSaveStatus, enqueue: enqueueOrderSave } = useOrderPersistence({
  onError: (message) => toast.error(message),
})

function handleReorder(orderedIds: string[]) {
  const id = assessmentId.value
  const previousIds = assessmentsStore.applyQuestionOrder(orderedIds)
  if (!previousIds) return
  enqueueOrderSave(`questions:${id}`, orderedIds, {
    previousIds,
    save: (ids) => assessmentsStore.persistQuestionOrder(id, ids),
    rollback: (ids) => void assessmentsStore.applyQuestionOrder(ids),
  })
}

async function handleRemove(item: AssessmentQuestionItem) {
  const { error } = await assessmentsStore.removeQuestion(item.id)
  if (error) {
    toast.error(error)
    return
  }
  toast.success(t.value.staff.builder.toastQuestionRemoved)
}

async function handleUpdatePoints(item: AssessmentQuestionItem, points: number) {
  const { error } = await assessmentsStore.updateQuestionPoints(item.id, points)
  if (error) {
    toast.error(error)
    return
  }
  toast.success(t.value.staff.builder.toastPointsUpdated)
}
</script>

<template>
  <div class="p-6">
    <!-- Back link -->
    <Button
      variant="ghost"
      size="sm"
      class="-ml-2 mb-4"
      @click="router.push(isTemplatePreview ? `${basePath}/templates` : `${basePath}/assessments`)"
    >
      <ArrowLeft class="mr-2 size-4" />
      {{
        isTemplatePreview
          ? t.staff.builder.backToLibrary
          : authStore.isAdmin
            ? t.staff.builder.backToTemplates
            : t.staff.builder.backToList
      }}
    </Button>

    <!-- Loading -->
    <div v-if="assessmentsStore.isLoadingCurrent" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <!-- Not found -->
    <div v-else-if="notFound || !assessment" class="py-16 text-center">
      <ClipboardList class="mx-auto size-16 text-muted-foreground/50" />
      <p class="mt-4 text-muted-foreground">{{ t.staff.builder.notFound }}</p>
    </div>

    <template v-else>
      <!-- Header -->
      <div class="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <div class="flex items-center gap-3">
            <h1 class="truncate text-2xl font-bold">{{ assessment.title }}</h1>
            <Badge
              v-if="isTemplate"
              variant="secondary"
              class="bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300"
            >
              {{ t.staff.builder.templateBadge }}
            </Badge>
            <Badge
              v-else-if="isPublished"
              variant="secondary"
              class="bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
            >
              {{ t.staff.assessments.statusPublished }}
            </Badge>
            <Badge v-else variant="secondary">{{ t.staff.assessments.statusDraft }}</Badge>
            <Badge v-if="scopeLabel" variant="outline">{{ scopeLabel }}</Badge>
            <!-- Release state (decision 71) — driven by answers_released_at -->
            <Badge
              v-if="isReleased"
              variant="secondary"
              class="bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300"
            >
              <Eye class="mr-1 size-3" />
              {{ t.staff.builder.answersReleasedBadge }}
            </Badge>
          </div>
          <p v-if="scopeLabel && !isTemplate" class="mt-1 text-sm text-muted-foreground">
            {{ t.staff.builder.scopedAssessmentHint }}
          </p>
        </div>
        <div v-if="isTemplatePreview" class="flex shrink-0 items-center gap-2">
          <Button @click="showUseTemplateDialog = true">
            <Copy class="mr-2 size-4" />
            {{ t.staff.assessments.useTemplate }}
          </Button>
        </div>
        <div v-else-if="!isTemplate" class="flex shrink-0 items-center gap-2">
          <Button v-if="canRelease" variant="outline" @click="showReleaseDialog = true">
            <EyeOff v-if="isReleased" class="mr-2 size-4" />
            <Eye v-else class="mr-2 size-4" />
            {{ isReleased ? t.staff.builder.unreleaseAnswers : t.staff.builder.releaseAnswers }}
          </Button>
          <Button variant="outline" @click="showAssignDialog = true">
            <UserPlus class="mr-2 size-4" />
            {{ t.staff.builder.assign }}
          </Button>
          <Button
            variant="outline"
            @click="router.push(`${basePath}/assessments/${assessmentId}/results`)"
          >
            <BarChart3 class="mr-2 size-4" />
            {{ t.staff.builder.viewResults }}
          </Button>
          <Button
            v-if="!isPublished && canEdit"
            :disabled="assessmentsStore.currentQuestions.length === 0"
            @click="showPublishDialog = true"
          >
            <Send class="mr-2 size-4" />
            {{ t.staff.builder.publish }}
          </Button>
        </div>
      </div>

      <!-- Read-only notices -->
      <div
        v-if="isTemplatePreview"
        class="mb-6 flex items-start gap-2 rounded-md border p-3 text-sm text-muted-foreground"
      >
        <Info class="mt-0.5 size-4 shrink-0" />
        {{ t.staff.builder.templatePreviewBanner }}
      </div>
      <div
        v-else-if="!canEdit"
        class="mb-6 flex items-start gap-2 rounded-md border p-3 text-sm text-muted-foreground"
      >
        <Info class="mt-0.5 size-4 shrink-0" />
        {{ t.staff.builder.readOnly }}
      </div>
      <div
        v-else-if="isTemplate"
        class="mb-6 flex items-start gap-2 rounded-md border p-3 text-sm text-muted-foreground"
      >
        <Info class="mt-0.5 size-4 shrink-0" />
        {{ t.staff.builder.templateBanner }}
      </div>
      <div
        v-else-if="isPublished"
        class="mb-6 flex items-start gap-2 rounded-md border p-3 text-sm text-muted-foreground"
      >
        <Lock class="mt-0.5 size-4 shrink-0" />
        {{ t.staff.builder.publishedLocked }}
      </div>

      <div class="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <!-- Questions -->
        <div>
          <div class="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <div class="flex items-center gap-3">
                <h2 class="text-lg font-semibold">{{ t.staff.builder.questionsTitle }}</h2>
                <OrderSaveStatusPill :status="orderSaveStatus" />
              </div>
              <p class="text-sm text-muted-foreground">
                {{ t.staff.builder.questionsDesc(assessmentsStore.currentQuestions.length) }}
              </p>
            </div>
            <div v-if="isEditable" class="flex items-center gap-2">
              <Button variant="outline" size="sm" @click="showBankPicker = true">
                <Plus class="mr-2 size-4" />
                {{ t.staff.builder.addFromBank }}
              </Button>
              <Button size="sm" @click="openAdhocAdd">
                <Plus class="mr-2 size-4" />
                {{ t.staff.builder.addAdhoc }}
              </Button>
            </div>
          </div>

          <div
            v-if="assessmentsStore.currentQuestions.length === 0"
            class="rounded-lg border border-dashed p-12 text-center"
          >
            <div class="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
              <Plus class="size-6 text-muted-foreground" />
            </div>
            <h3 class="mt-4 text-lg font-medium">{{ t.staff.builder.noQuestions }}</h3>
            <p class="mt-2 text-sm text-muted-foreground">{{ t.staff.builder.noQuestionsDesc }}</p>
          </div>

          <AssessmentQuestionList
            v-else
            :items="assessmentsStore.currentQuestions"
            :disabled="!isEditable"
            @reorder="handleReorder"
            @edit="openAdhocEdit"
            @remove="handleRemove"
            @update-points="handleUpdatePoints"
          />
        </div>

        <!-- Settings -->
        <Card class="h-fit">
          <CardHeader>
            <CardTitle>{{ t.staff.builder.settingsTitle }}</CardTitle>
          </CardHeader>
          <CardContent class="space-y-4">
            <Field>
              <FieldLabel for="builder-title"
                >{{ t.staff.builder.titleLabel }}
                <span class="text-destructive">*</span></FieldLabel
              >
              <Input
                id="builder-title"
                v-model="title"
                :disabled="!isEditable || isSavingSettings"
              />
            </Field>

            <Field>
              <FieldLabel for="builder-description">{{
                t.staff.builder.descriptionLabel
              }}</FieldLabel>
              <Textarea
                id="builder-description"
                v-model="description"
                :placeholder="t.staff.builder.descriptionPlaceholder"
                rows="3"
                :disabled="!isEditable || isSavingSettings"
              />
            </Field>

            <Field>
              <FieldLabel for="builder-time-limit">{{ t.staff.builder.timeLimitLabel }}</FieldLabel>
              <Input
                id="builder-time-limit"
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
                <FieldLabel for="builder-shuffle">{{ t.staff.builder.shuffleLabel }}</FieldLabel>
                <FieldDescription>{{ t.staff.builder.shuffleHint }}</FieldDescription>
              </div>
              <Switch
                id="builder-shuffle"
                v-model="shuffleQuestions"
                :disabled="!isEditable || isSavingSettings"
              />
            </Field>

            <!-- Pending-score visibility (decision 70). Hidden on templates:
                 they are never attempted and the clone RPC does not copy it. -->
            <Field v-if="!isTemplate" orientation="horizontal">
              <div>
                <FieldLabel for="builder-pending-visibility">{{
                  t.staff.builder.pendingVisibilityLabel
                }}</FieldLabel>
                <FieldDescription>{{ t.staff.builder.pendingVisibilityHint }}</FieldDescription>
              </div>
              <Switch
                id="builder-pending-visibility"
                :model-value="showAutoScoreWhilePending"
                :disabled="!canEdit || isSavingPendingVisibility"
                @update:model-value="handlePendingVisibilityChange"
              />
            </Field>

            <!-- Template pairing (admin template mode): both always required -->
            <template v-if="canEditScope">
              <Field>
                <FieldLabel
                  >{{ t.staff.builder.gradeLabel }}
                  <span class="text-destructive">*</span></FieldLabel
                >
                <Select
                  :model-value="scopeGradeLevelId"
                  :disabled="isSavingSettings || curriculumStore.isLoading"
                  @update:model-value="handleScopeGradeChange"
                >
                  <SelectTrigger class="w-full">
                    <SelectValue :placeholder="t.staff.assessmentCreate.gradePlaceholder" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem
                      v-for="gradeLevel in curriculumStore.gradeLevels"
                      :key="gradeLevel.id"
                      :value="gradeLevel.id"
                    >
                      {{ gradeLevel.name }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel
                  >{{ t.staff.builder.subjectLabel }}
                  <span class="text-destructive">*</span></FieldLabel
                >
                <Select v-model="scopeSubjectId" :disabled="isSavingSettings || !scopeGradeLevelId">
                  <SelectTrigger class="w-full">
                    <SelectValue :placeholder="t.staff.assessmentCreate.subjectPlaceholder" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem
                      v-for="subject in scopeSubjects"
                      :key="subject.id"
                      :value="subject.id"
                    >
                      {{ subject.name }}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <FieldDescription>{{ t.staff.builder.scopeHint }}</FieldDescription>
              </Field>
            </template>

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
      </div>

      <BankQuestionPickerDialog
        v-model:open="showBankPicker"
        :assessment-id="assessmentId"
        :existing-question-ids="existingBankQuestionIds"
      />

      <AdhocQuestionDialog
        v-model:open="showAdhocDialog"
        :assessment-id="assessmentId"
        :edit-item="editingQuestion"
      />

      <AssignDialog v-if="!isTemplate" v-model:open="showAssignDialog" :assessment="assessment" />

      <!-- Use template confirmation (staff preview only) -->
      <Dialog v-if="isTemplatePreview" v-model:open="showUseTemplateDialog">
        <DialogContent class="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{{ t.staff.assessments.useTemplateTitle }}</DialogTitle>
            <DialogDescription>{{
              t.staff.assessments.useTemplateDesc(assessment.title)
            }}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" :disabled="isCloning" @click="showUseTemplateDialog = false">
              {{ t.staff.assessments.cancel }}
            </Button>
            <Button :disabled="isCloning" @click="handleUseTemplate">
              <Loader2 v-if="isCloning" class="mr-2 size-4 animate-spin" />
              {{ t.staff.assessments.useTemplateConfirm }}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <!-- Release / un-release answers confirmation (decision 71) -->
      <Dialog v-model:open="showReleaseDialog">
        <DialogContent class="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{{
              isReleased ? t.staff.builder.unreleaseTitle : t.staff.builder.releaseTitle
            }}</DialogTitle>
            <DialogDescription>{{
              isReleased ? t.staff.builder.unreleaseDesc : t.staff.builder.releaseDesc
            }}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" :disabled="isReleasing" @click="showReleaseDialog = false">
              {{ t.staff.builder.cancel }}
            </Button>
            <Button :disabled="isReleasing" @click="handleToggleRelease">
              <Loader2 v-if="isReleasing" class="mr-2 size-4 animate-spin" />
              {{ isReleased ? t.staff.builder.unreleaseConfirm : t.staff.builder.releaseConfirm }}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <!-- Publish confirmation -->
      <Dialog v-model:open="showPublishDialog">
        <DialogContent class="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{{ t.staff.builder.publishTitle }}</DialogTitle>
            <DialogDescription>{{ t.staff.builder.publishDesc }}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" :disabled="isPublishing" @click="showPublishDialog = false">
              {{ t.staff.builder.cancel }}
            </Button>
            <Button :disabled="isPublishing" @click="handlePublish">
              <Loader2 v-if="isPublishing" class="mr-2 size-4 animate-spin" />
              {{ t.staff.builder.publishConfirm }}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </template>
  </div>
</template>
