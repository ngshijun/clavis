<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAssessmentsStore, type AssessmentQuestionItem } from '@/stores/assessments'
import { useAuthStore } from '@/stores/auth'
import {
  ArrowLeft,
  BarChart3,
  ClipboardList,
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
import AssessmentQuestionList from '@/components/staff/AssessmentQuestionList.vue'
import AdhocQuestionDialog from '@/components/staff/AdhocQuestionDialog.vue'
import BankQuestionPickerDialog from '@/components/staff/BankQuestionPickerDialog.vue'
import AssignDialog from '@/components/staff/AssignDialog.vue'
import { toast } from 'vue-sonner'
import { useT } from '@/composables/useT'

const t = useT()
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const assessmentsStore = useAssessmentsStore()

const assessmentId = computed(() => String(route.params.assessmentId))
const basePath = computed(() => `/${authStore.userType}`)

const notFound = ref(false)

// Settings form state
const title = ref('')
const description = ref('')
const timeLimitMinutes = ref('')
const shuffleQuestions = ref(false)
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
const canEdit = computed(() =>
  assessment.value ? assessmentsStore.canEdit(assessment.value) : false,
)
/**
 * Published assessments are locked: `attempt_questions` snapshots reference
 * `assessment_questions` rows (ON DELETE CASCADE), so editing or removing a
 * question after publish would silently corrupt in-flight attempts.
 */
const isEditable = computed(() => canEdit.value && !isPublished.value)

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
}

onMounted(async () => {
  const { error } = await assessmentsStore.fetchAssessmentDetail(assessmentId.value)
  if (error || !assessmentsStore.currentAssessment) {
    notFound.value = true
    return
  }
  syncSettings()
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
  settingsError.value = null

  isSavingSettings.value = true
  try {
    const { error } = await assessmentsStore.updateAssessment(assessmentId.value, {
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

function openAdhocAdd() {
  editingQuestion.value = null
  showAdhocDialog.value = true
}

function openAdhocEdit(item: AssessmentQuestionItem) {
  editingQuestion.value = item
  showAdhocDialog.value = true
}

async function handleReorder(orderedIds: string[]) {
  const { error } = await assessmentsStore.reorderQuestions(assessmentId.value, orderedIds)
  if (error) toast.error(error)
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
      @click="router.push(`${basePath}/assessments`)"
    >
      <ArrowLeft class="mr-2 size-4" />
      {{ t.staff.builder.backToList }}
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
              v-if="isPublished"
              variant="secondary"
              class="bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300"
            >
              {{ t.staff.assessments.statusPublished }}
            </Badge>
            <Badge v-else variant="secondary">{{ t.staff.assessments.statusDraft }}</Badge>
          </div>
        </div>
        <div class="flex shrink-0 items-center gap-2">
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
        v-if="!canEdit"
        class="mb-6 flex items-start gap-2 rounded-md border p-3 text-sm text-muted-foreground"
      >
        <Info class="mt-0.5 size-4 shrink-0" />
        {{ t.staff.builder.readOnly }}
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
              <h2 class="text-lg font-semibold">{{ t.staff.builder.questionsTitle }}</h2>
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
            :is-saving="assessmentsStore.isSavingOrder"
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

      <AssignDialog v-model:open="showAssignDialog" :assessment="assessment" />

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
