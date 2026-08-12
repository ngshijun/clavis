<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useAssessmentsStore, type AssessmentListItem } from '@/stores/assessments'
import { useClassroomsStore } from '@/stores/classrooms'
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
import MemberPickList, { type PickableMember } from './MemberPickList.vue'
import { toast } from 'vue-sonner'
import { formatDateTime } from '@/lib/date'
import { useT } from '@/composables/useT'
import { useLanguageStore } from '@/stores/language'

const t = useT()
const languageStore = useLanguageStore()
const assessmentsStore = useAssessmentsStore()
const classroomsStore = useClassroomsStore()

const props = defineProps<{
  assessment: AssessmentListItem | null
}>()

const open = defineModel<boolean>('open', { default: false })

const isLoading = ref(false)
const isSaving = ref(false)
const targetType = ref<'classroom' | 'student'>('classroom')
const classroomId = ref('')
const selectedStudentIds = ref<string[]>([])
const dueAtLocal = ref('')
const targetMissing = ref(false)

watch(open, async (isOpen) => {
  if (!isOpen || !props.assessment) return

  targetType.value = 'classroom'
  classroomId.value = ''
  selectedStudentIds.value = []
  dueAtLocal.value = ''
  targetMissing.value = false

  isLoading.value = true
  const [assignmentsResult] = await Promise.all([
    assessmentsStore.fetchAssignments(props.assessment.id),
    classroomsStore.classrooms.length === 0
      ? classroomsStore.fetchClassrooms()
      : Promise.resolve(null),
    classroomsStore.fetchOrgStudents(),
  ])
  isLoading.value = false

  if (assignmentsResult.error) {
    toast.error(t.value.staff.assign.toastLoadFailed)
    open.value = false
  }
})

const assignedClassroomIds = computed(
  () =>
    new Set(
      assessmentsStore.currentAssignments
        .map((assignment) => assignment.classroomId)
        .filter((id): id is string => Boolean(id)),
    ),
)
const assignedStudentIds = computed(() =>
  assessmentsStore.currentAssignments
    .map((assignment) => assignment.studentId)
    .filter((id): id is string => Boolean(id)),
)

const availableClassrooms = computed(() =>
  classroomsStore.classrooms.filter((item) => !assignedClassroomIds.value.has(item.id)),
)

const orgStudentPicks = computed<PickableMember[]>(() =>
  classroomsStore.orgStudents.map((student) => ({
    id: student.id,
    name: student.name,
    detail: [student.username, student.gradeLevelName].filter(Boolean).join(' · ') || null,
  })),
)

async function handleAssign() {
  if (!props.assessment) return

  const studentId = selectedStudentIds.value[0]
  const target =
    targetType.value === 'classroom'
      ? classroomId.value
        ? { classroomId: classroomId.value }
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
  classroomId.value = ''
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
                {{
                  assignment.classroomId
                    ? t.staff.assign.classroomBadge
                    : t.staff.assign.studentBadge
                }}
              </Badge>
              <span class="min-w-0 flex-1 truncate font-medium">
                {{ assignment.classroomName ?? assignment.studentName ?? '' }}
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
                  targetType = value as 'classroom' | 'student'
                  targetMissing = false
                }
              "
            >
              <SelectTrigger class="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="classroom">{{ t.staff.assign.targetClassroom }}</SelectItem>
                <SelectItem value="student">{{ t.staff.assign.targetStudent }}</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field v-if="targetType === 'classroom'" :data-invalid="targetMissing">
            <FieldLabel>{{ t.staff.assign.classroomLabel }}</FieldLabel>
            <Select
              :key="languageStore.language"
              v-model="classroomId"
              :disabled="isSaving"
              @update:model-value="targetMissing = false"
            >
              <SelectTrigger class="w-full" :class="{ 'border-destructive': targetMissing }">
                <SelectValue :placeholder="t.staff.assign.classroomPlaceholder" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="item in availableClassrooms" :key="item.id" :value="item.id">
                  {{ item.name }} · {{ item.gradeLevelName }} · {{ item.subjectName }}
                </SelectItem>
              </SelectContent>
            </Select>
            <p v-if="availableClassrooms.length === 0" class="text-sm text-muted-foreground">
              {{ t.staff.assign.noClassrooms }}
            </p>
          </Field>

          <Field v-else :data-invalid="targetMissing">
            <FieldLabel>{{ t.staff.assign.studentLabel }}</FieldLabel>
            <MemberPickList
              v-model:selected-ids="selectedStudentIds"
              :members="orgStudentPicks"
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
