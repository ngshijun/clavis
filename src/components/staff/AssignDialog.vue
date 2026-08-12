<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useAssessmentsStore, type AssessmentListItem } from '@/stores/assessments'
import { useClassesStore } from '@/stores/classes'
import { Info, Loader2, X } from 'lucide-vue-next'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Field, FieldLabel, FieldError } from '@/components/ui/field'
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
import StudentPickList from './StudentPickList.vue'
import { toast } from 'vue-sonner'
import { formatDateTime } from '@/lib/date'
import { useT } from '@/composables/useT'
import { useLanguageStore } from '@/stores/language'

const t = useT()
const languageStore = useLanguageStore()
const assessmentsStore = useAssessmentsStore()
const classesStore = useClassesStore()

const props = defineProps<{
  assessment: AssessmentListItem | null
}>()

const open = defineModel<boolean>('open', { default: false })

const isLoading = ref(false)
const isSaving = ref(false)
const targetType = ref<'class' | 'student'>('class')
const classId = ref('')
const selectedStudentIds = ref<string[]>([])
const dueAtLocal = ref('')
const targetMissing = ref(false)

watch(open, async (isOpen) => {
  if (!isOpen || !props.assessment) return

  targetType.value = 'class'
  classId.value = ''
  selectedStudentIds.value = []
  dueAtLocal.value = ''
  targetMissing.value = false

  isLoading.value = true
  const [assignmentsResult] = await Promise.all([
    assessmentsStore.fetchAssignments(props.assessment.id),
    classesStore.classes.length === 0 ? classesStore.fetchClasses() : Promise.resolve(null),
    classesStore.fetchOrgStudents(),
  ])
  isLoading.value = false

  if (assignmentsResult.error) {
    toast.error(t.value.staff.assign.toastLoadFailed)
    open.value = false
  }
})

const assignedClassIds = computed(
  () =>
    new Set(
      assessmentsStore.currentAssignments
        .map((assignment) => assignment.classId)
        .filter((id): id is string => Boolean(id)),
    ),
)
const assignedStudentIds = computed(() =>
  assessmentsStore.currentAssignments
    .map((assignment) => assignment.studentId)
    .filter((id): id is string => Boolean(id)),
)

const availableClasses = computed(() =>
  classesStore.classes.filter((item) => !assignedClassIds.value.has(item.id)),
)

async function handleAssign() {
  if (!props.assessment) return

  const studentId = selectedStudentIds.value[0]
  const target =
    targetType.value === 'class'
      ? classId.value
        ? { classId: classId.value }
        : null
      : studentId
        ? { studentId }
        : null

  if (!target) {
    targetMissing.value = true
    return
  }
  targetMissing.value = false

  isSaving.value = true
  const { error } = await assessmentsStore.createAssignment({
    assessmentId: props.assessment.id,
    ...target,
    dueAt: dueAtLocal.value ? new Date(dueAtLocal.value).toISOString() : null,
  })
  isSaving.value = false

  if (error) {
    toast.error(error)
    return
  }

  toast.success(t.value.staff.assign.toastAssigned)
  classId.value = ''
  selectedStudentIds.value = []
}

async function handleRemove(assignmentId: string) {
  isSaving.value = true
  const { error } = await assessmentsStore.removeAssignment(assignmentId)
  isSaving.value = false

  if (error) {
    toast.error(error)
    return
  }

  toast.success(t.value.staff.assign.toastRemoved)
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ t.staff.assign.title }}</DialogTitle>
        <DialogDescription>{{ t.staff.assign.description }}</DialogDescription>
      </DialogHeader>

      <div v-if="isLoading" class="flex items-center justify-center py-12">
        <Loader2 class="size-6 animate-spin text-muted-foreground" />
      </div>

      <div v-else class="space-y-5 py-2">
        <div
          v-if="assessment?.status === 'draft'"
          class="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-200"
        >
          <Info class="mt-0.5 size-4 shrink-0" />
          {{ t.staff.assign.draftWarning }}
        </div>

        <!-- Current assignments -->
        <div>
          <h3 class="mb-2 text-sm font-semibold">{{ t.staff.assign.currentTitle }}</h3>
          <p
            v-if="assessmentsStore.currentAssignments.length === 0"
            class="text-sm text-muted-foreground"
          >
            {{ t.staff.assign.noAssignments }}
          </p>
          <ul v-else class="max-h-48 space-y-1 overflow-y-auto">
            <li
              v-for="assignment in assessmentsStore.currentAssignments"
              :key="assignment.id"
              class="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
            >
              <Badge variant="secondary">
                {{ assignment.classId ? t.staff.assign.classBadge : t.staff.assign.studentBadge }}
              </Badge>
              <span class="min-w-0 flex-1 truncate font-medium">
                {{ assignment.className ?? assignment.studentName ?? '' }}
              </span>
              <span class="shrink-0 text-xs text-muted-foreground">
                {{
                  assignment.dueAt
                    ? t.staff.assign.dueBy(formatDateTime(assignment.dueAt))
                    : t.staff.assign.noDueDate
                }}
              </span>
              <Button
                variant="ghost"
                size="icon"
                class="size-7 shrink-0 text-destructive hover:text-destructive"
                :disabled="isSaving"
                :aria-label="t.staff.assign.removeLabel"
                @click="handleRemove(assignment.id)"
              >
                <X class="size-4" />
              </Button>
            </li>
          </ul>
        </div>

        <!-- New assignment -->
        <div class="space-y-3 rounded-lg border p-3">
          <Field>
            <FieldLabel>{{ t.staff.assign.targetLabel }}</FieldLabel>
            <Select
              :key="languageStore.language"
              :model-value="targetType"
              :disabled="isSaving"
              @update:model-value="
                (value) => {
                  targetType = value as 'class' | 'student'
                  targetMissing = false
                }
              "
            >
              <SelectTrigger class="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="class">{{ t.staff.assign.targetClass }}</SelectItem>
                <SelectItem value="student">{{ t.staff.assign.targetStudent }}</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field v-if="targetType === 'class'" :data-invalid="targetMissing">
            <FieldLabel>{{ t.staff.assign.classLabel }}</FieldLabel>
            <Select
              :key="languageStore.language"
              v-model="classId"
              :disabled="isSaving"
              @update:model-value="targetMissing = false"
            >
              <SelectTrigger class="w-full" :class="{ 'border-destructive': targetMissing }">
                <SelectValue :placeholder="t.staff.assign.classPlaceholder" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="item in availableClasses" :key="item.id" :value="item.id">
                  {{ item.name }}
                </SelectItem>
              </SelectContent>
            </Select>
            <p v-if="availableClasses.length === 0" class="text-sm text-muted-foreground">
              {{ t.staff.assign.noClasses }}
            </p>
          </Field>

          <Field v-else :data-invalid="targetMissing">
            <FieldLabel>{{ t.staff.assign.studentLabel }}</FieldLabel>
            <StudentPickList
              v-model:selected-ids="selectedStudentIds"
              :students="classesStore.orgStudents"
              :disabled-ids="assignedStudentIds"
              :disabled-label="t.staff.assign.alreadyAssigned"
              single
              :search-placeholder="t.staff.assign.studentSearchPlaceholder"
              :empty-text="t.staff.assign.noStudentsFound"
            />
          </Field>

          <Field>
            <FieldLabel for="assign-due">{{ t.staff.assign.dueLabel }}</FieldLabel>
            <Input
              id="assign-due"
              v-model="dueAtLocal"
              type="datetime-local"
              :disabled="isSaving"
            />
          </Field>

          <FieldError :errors="targetMissing ? [t.staff.assign.validationTarget] : []" />

          <Button class="w-full" :disabled="isSaving" @click="handleAssign">
            <Loader2 v-if="isSaving" class="mr-2 size-4 animate-spin" />
            {{ t.staff.assign.assignBtn }}
          </Button>
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" @click="open = false">
          {{ t.staff.assign.close }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
