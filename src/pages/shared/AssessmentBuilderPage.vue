<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAssessmentsStore, type AssessmentQuestionItem } from '@/stores/assessments'
import { useAuthStore } from '@/stores/auth'
import { useActiveClassroom } from '@/composables/useActiveClassroom'
import { useCurriculumStore } from '@/stores/curriculum'
import { collectAdhocPayloadImagePaths, type AdhocPayload } from '@/lib/adhocPayload'
import { removeStorageObjects } from '@/lib/storage'
import {
  ArrowLeft,
  ClipboardList,
  Copy,
  Database,
  Library,
  Eye,
  EyeOff,
  Info,
  Loader2,
  Lock,
  Plus,
  Send,
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
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import AssessmentQuestionList from '@/components/staff/AssessmentQuestionList.vue'
import BankQuestionPickerDialog from '@/components/staff/BankQuestionPickerDialog.vue'
import AssessmentBankPickerDialog from '@/components/staff/AssessmentBankPickerDialog.vue'
import AssignPanel from '@/components/staff/AssignPanel.vue'
import AssessmentResultsPanel from '@/components/staff/AssessmentResultsPanel.vue'
import SaveStatusPill from '@/components/shared/SaveStatusPill.vue'
import { toast } from 'vue-sonner'
import { useAutosave } from '@/composables/useAutosave'
import { useMarkingAuthz } from '@/composables/useMarkingAuthz'
import { useT } from '@/composables/useT'

/**
 * Google-Forms-style builder (decision 75 / P10b): top tabs
 * Questions · Assign · Results · Settings (templates keep only
 * Questions · Settings), question cards that expand in place with background
 * autosave (no Save button, no editing dialog), and a floating action toolbar
 * beside the active card.
 */
const t = useT()
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const assessmentsStore = useAssessmentsStore()
const { classroomId, basePath } = useActiveClassroom()
const curriculumStore = useCurriculumStore()

const assessmentId = computed(() => String(route.params.assessmentId))

const notFound = ref(false)

// ── tabs ───────────────────────────────────────────────────

const TAB_VALUES = ['questions', 'assign', 'results', 'settings'] as const
type BuilderTab = (typeof TAB_VALUES)[number]

const activeTab = ref<BuilderTab>('questions')

function isBuilderTab(value: unknown): value is BuilderTab {
  return typeof value === 'string' && (TAB_VALUES as readonly string[]).includes(value)
}

// Deep links (e.g. the assessments list's "results" action) select a tab via
// `?tab=`; the current tab is mirrored back so reloads keep the view.
watch(activeTab, (tab) => {
  void router.replace({
    query: { ...route.query, tab: tab === 'questions' ? undefined : tab },
  })
})

// Settings form state
const title = ref('')
const description = ref('')
const timeLimitMinutes = ref('')
const shuffleQuestions = ref(false)
const showAutoScoreWhilePending = ref(true)
const isSavingPendingVisibility = ref(false)

/**
 * Decision 70 toggle — saved immediately: marking happens AFTER publish,
 * when the rest of the settings form (and its save button) is locked.
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

// Dialogs (confirmations only — question editing is inline in the cards)
const showBankPicker = ref(false)
const showAssessmentBankPicker = ref(false)

/**
 * The admin question bank (P13a) is admin-only at the RLS layer, so only an
 * admin editing a template is ever offered it.
 */
const canPickFromAssessmentBank = computed(
  () => authStore.isAdmin && isTemplate.value && isEditable.value,
)
const showPublishDialog = ref(false)
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
/**
 * What this assessment belongs to, in the header. A template shows its
 * grade+subject pairing (who may clone it); everything else shows its owning
 * classroom, which is what actually scopes it (decision 81).
 */
const scopeLabel = computed(() => {
  if (!assessment.value) return null
  if (assessment.value.isTemplate) {
    return assessment.value.gradeLevelName && assessment.value.subjectName
      ? `${assessment.value.gradeLevelName} · ${assessment.value.subjectName}`
      : null
  }
  return assessment.value?.classroomName ?? null
})

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
  expandedId.value = null
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
  // Land on the deep-linked tab, but only one that exists for this mode.
  const requested = route.query.tab
  if (
    isBuilderTab(requested) &&
    !(
      assessmentsStore.currentAssessment.isTemplate &&
      (requested === 'assign' || requested === 'results')
    )
  ) {
    activeTab.value = requested
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
    const targetClassroomId = classroomId.value
    if (!targetClassroomId) {
      toast.error(t.value.shared.errors.failedCloneTemplate)
      return
    }
    const { id, error } = await assessmentsStore.cloneTemplate(
      assessmentId.value,
      targetClassroomId,
    )
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

// ── Forms-style inline editing with background autosave ────

/** The one expanded card (Forms model: exactly one card is active). */
const expandedId = ref<string | null>(null)

const autosave = useAutosave({ onError: (message) => toast.error(message) })

// Seamless reorder (decision 72b): the drag applies instantly in the store;
// persistence is debounced/coalesced fire-and-forget via the positional RPC.
// Dragging is never blocked — the pill in the header is the affordance.
function handleReorder(orderedIds: string[]) {
  const id = assessmentId.value
  const previousIds = assessmentsStore.applyQuestionOrder(orderedIds)
  if (!previousIds) return
  autosave.enqueue(`order:${id}`, orderedIds, {
    previous: previousIds,
    save: (ids) => assessmentsStore.persistQuestionOrder(id, ids),
    rollback: (ids) => void assessmentsStore.applyQuestionOrder(ids),
  })
}

/**
 * Storage objects a card replaced/removed, per question id (decision 78).
 * They are deleted only once a payload save CONFIRMS the stored payload no
 * longer references them — a failed save rolls back to the confirmed payload
 * (which still references the old object), so deleting earlier would leave a
 * broken image. Pending paths of a finally-failed save are simply dropped
 * (the freshly-uploaded object becomes the orphan instead — an orphan is
 * always preferable to a broken row).
 */
const pendingImageDeletes = new Map<string, Set<string>>()

function handleImageOrphaned(item: AssessmentQuestionItem, path: string) {
  let pending = pendingImageDeletes.get(item.id)
  if (!pending) {
    pending = new Set()
    pendingImageDeletes.set(item.id, pending)
  }
  pending.add(path)
}

/** After a CONFIRMED save: delete every pending object the payload no longer references. */
function flushOrphanedImages(id: string, savedPayload: AdhocPayload) {
  const pending = pendingImageDeletes.get(id)
  if (!pending) return
  const referenced = new Set(collectAdhocPayloadImagePaths(savedPayload))
  const removable = [...pending].filter((path) => !referenced.has(path))
  for (const path of removable) pending.delete(path)
  void removeStorageObjects('assessment-images', removable)
}

/**
 * A card emitted a VALID payload (built + validated by `buildAdhocPayload`).
 * Apply optimistically and enqueue the debounced background save — no Save
 * button anywhere. On final failure the store rolls back to the last
 * server-confirmed payload and the error toasts.
 */
function handlePayloadChange(item: AssessmentQuestionItem, payload: AdhocPayload) {
  const previous = assessmentsStore.applyAdhocPayload(item.id, payload)
  if (!previous) return
  autosave.enqueue(`payload:${item.id}`, payload, {
    previous,
    save: async (value) => {
      const result = await assessmentsStore.persistAdhocPayload(item.id, value)
      if (!result.error) flushOrphanedImages(item.id, value)
      return result
    },
    rollback: (confirmed) => {
      pendingImageDeletes.delete(item.id)
      void assessmentsStore.applyAdhocPayload(item.id, confirmed)
    },
  })
}

function handlePointsChange(item: AssessmentQuestionItem, points: number) {
  const previous = assessmentsStore.applyQuestionPoints(item.id, points)
  if (previous === null) return
  autosave.enqueue(`points:${item.id}`, points, {
    previous,
    save: (value) => assessmentsStore.persistQuestionPoints(item.id, value),
    rollback: (confirmed) => void assessmentsStore.applyQuestionPoints(item.id, confirmed),
  })
}

/**
 * Forms model: adding a question INSERTS a valid placeholder immediately
 * (like Forms' "Untitled Question" with two options) and expands it — the
 * card then autosaves every edit in place.
 */
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

/** Insert an ad-hoc question, position it after `afterId`, and expand it. */
async function insertAdhocQuestion(payload: AdhocPayload, afterId: string | null) {
  const { id, error } = await assessmentsStore.addAdhocQuestion(assessmentId.value, payload)
  if (error || !id) {
    toast.error(error ?? '')
    return
  }
  if (afterId) {
    const ids = assessmentsStore.currentQuestions
      .map((question) => question.id)
      .filter((questionId) => questionId !== id)
    const anchor = ids.indexOf(afterId)
    if (anchor !== -1 && anchor < ids.length - 1) {
      ids.splice(anchor + 1, 0, id)
      handleReorder(ids)
    }
  }
  expandedId.value = id
}

function handleAddQuestion() {
  void insertAdhocQuestion(placeholderPayload(), expandedId.value)
}

function handleDuplicate(item: AssessmentQuestionItem) {
  if (item.source !== 'adhoc' || !item.payload) return
  void insertAdhocQuestion(item.payload, item.id)
}

async function handleRemove(item: AssessmentQuestionItem) {
  const { error } = await assessmentsStore.removeQuestion(item.id)
  if (error) {
    toast.error(error)
    return
  }
  // The store deleted the stored payload's objects; anything still pending
  // for this question is dropped (rare unconfirmed-replace window).
  pendingImageDeletes.delete(item.id)
  if (expandedId.value === item.id) expandedId.value = null
  toast.success(t.value.staff.builder.toastQuestionRemoved)
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
      <!-- Header: badges, autosave status, publish. The title is the header
           breadcrumb's leaf (decision 84), so it is not repeated here. -->
      <div class="mb-4 flex flex-wrap items-start justify-between gap-4">
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-3">
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
            <!-- Background autosave status (questions, points, order) -->
            <SaveStatusPill :status="autosave.status.value" />
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
        class="mb-4 flex items-start gap-2 rounded-md border p-3 text-sm text-muted-foreground"
      >
        <Info class="mt-0.5 size-4 shrink-0" />
        {{ t.staff.builder.templatePreviewBanner }}
      </div>
      <div
        v-else-if="!canEdit"
        class="mb-4 flex items-start gap-2 rounded-md border p-3 text-sm text-muted-foreground"
      >
        <Info class="mt-0.5 size-4 shrink-0" />
        {{ t.staff.builder.readOnly }}
      </div>
      <div
        v-else-if="isTemplate"
        class="mb-4 flex items-start gap-2 rounded-md border p-3 text-sm text-muted-foreground"
      >
        <Info class="mt-0.5 size-4 shrink-0" />
        {{ t.staff.builder.templateBanner }}
      </div>
      <div
        v-else-if="isPublished"
        class="mb-4 flex items-start gap-2 rounded-md border p-3 text-sm text-muted-foreground"
      >
        <Lock class="mt-0.5 size-4 shrink-0" />
        {{ t.staff.builder.publishedLocked }}
      </div>

      <!-- Top tabs (Forms model): Questions · Assign · Results · Settings -->
      <Tabs
        :model-value="activeTab"
        @update:model-value="(value) => (activeTab = isBuilderTab(value) ? value : 'questions')"
      >
        <TabsList class="mx-auto">
          <TabsTrigger value="questions">{{ t.staff.builder.questionsTitle }}</TabsTrigger>
          <TabsTrigger v-if="!isTemplate" value="assign">{{ t.staff.builder.assign }}</TabsTrigger>
          <TabsTrigger v-if="!isTemplate" value="results">{{
            t.staff.builder.tabResults
          }}</TabsTrigger>
          <TabsTrigger value="settings">{{ t.staff.builder.settingsTitle }}</TabsTrigger>
        </TabsList>

        <!-- Questions -->
        <TabsContent value="questions" class="pt-4">
          <div class="editor-column">
            <p class="mb-4 text-sm text-muted-foreground">
              {{ t.staff.builder.questionsDesc(assessmentsStore.currentQuestions.length) }}
            </p>

            <div
              v-if="assessmentsStore.currentQuestions.length === 0"
              class="rounded-lg border border-dashed p-12 text-center"
            >
              <div class="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
                <Plus class="size-6 text-muted-foreground" />
              </div>
              <h3 class="mt-4 text-lg font-medium">{{ t.staff.builder.noQuestions }}</h3>
              <p class="mt-2 text-sm text-muted-foreground">
                {{ t.staff.builder.noQuestionsDesc }}
              </p>
              <div v-if="isEditable" class="mt-4 flex justify-center gap-2">
                <Button size="sm" @click="handleAddQuestion">
                  <Plus class="mr-2 size-4" />
                  {{ t.staff.builder.addAdhoc }}
                </Button>
                <Button variant="outline" size="sm" @click="showBankPicker = true">
                  <Database class="mr-2 size-4" />
                  {{ t.staff.builder.addFromBank }}
                </Button>
                <Button
                  v-if="canPickFromAssessmentBank"
                  variant="outline"
                  size="sm"
                  @click="showAssessmentBankPicker = true"
                >
                  <Library class="mr-2 size-4" />
                  {{ t.staff.builder.addFromQuestionBank }}
                </Button>
              </div>
            </div>

            <AssessmentQuestionList
              v-else
              v-model:expanded-id="expandedId"
              :items="assessmentsStore.currentQuestions"
              :editable="isEditable"
              :assessment-id="assessmentId"
              @reorder="handleReorder"
              @payload-change="handlePayloadChange"
              @points-change="handlePointsChange"
              @image-orphaned="handleImageOrphaned"
              @duplicate="handleDuplicate"
              @remove="handleRemove"
              @add-question="handleAddQuestion"
              :show-question-bank="canPickFromAssessmentBank"
              @add-from-bank="showBankPicker = true"
              @add-from-question-bank="showAssessmentBankPicker = true"
            />
          </div>
        </TabsContent>

        <!-- Assign -->
        <TabsContent v-if="!isTemplate" value="assign" class="pt-4">
          <AssignPanel :assessment="assessment" />
        </TabsContent>

        <!-- Results -->
        <TabsContent v-if="!isTemplate" value="results" class="pt-4">
          <AssessmentResultsPanel :assessment-id="assessmentId" :can-mark="canMark" />
        </TabsContent>

        <!-- Settings -->
        <TabsContent value="settings" class="pt-4">
          <Card class="editor-column">
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
                <FieldLabel for="builder-time-limit">{{
                  t.staff.builder.timeLimitLabel
                }}</FieldLabel>
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
                  <Select
                    v-model="scopeSubjectId"
                    :disabled="isSavingSettings || !scopeGradeLevelId"
                  >
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

              <!-- Manual answer release (decision 71) -->
              <Field v-if="canRelease" orientation="horizontal" class="border-t pt-4">
                <div>
                  <FieldLabel>{{
                    isReleased ? t.staff.builder.unreleaseAnswers : t.staff.builder.releaseAnswers
                  }}</FieldLabel>
                  <FieldDescription>{{
                    isReleased ? t.staff.builder.unreleaseDesc : t.staff.builder.releaseDesc
                  }}</FieldDescription>
                </div>
                <Button variant="outline" @click="showReleaseDialog = true">
                  <EyeOff v-if="isReleased" class="mr-2 size-4" />
                  <Eye v-else class="mr-2 size-4" />
                  {{
                    isReleased ? t.staff.builder.unreleaseAnswers : t.staff.builder.releaseAnswers
                  }}
                </Button>
              </Field>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <BankQuestionPickerDialog
        v-model:open="showBankPicker"
        :assessment-id="assessmentId"
        :existing-question-ids="existingBankQuestionIds"
      />

      <AssessmentBankPickerDialog
        v-if="canPickFromAssessmentBank"
        v-model:open="showAssessmentBankPicker"
        :assessment-id="assessmentId"
        :grade-level-id="assessment.gradeLevelId"
        :subject-id="assessment.subjectId"
      />

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
