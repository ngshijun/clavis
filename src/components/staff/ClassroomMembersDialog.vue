<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  useClassroomsStore,
  type ClassroomListItem,
  type ClassroomStudent,
  type ClassroomTeacher,
} from '@/stores/classrooms'
import { useManagerTeachersStore } from '@/stores/manager-teachers'
import { useAuthStore } from '@/stores/auth'
import { ArrowLeft, GraduationCap, Loader2, Plus, UserMinus, Users } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import MemberPickList, { type PickableMember } from './MemberPickList.vue'
import { toast } from 'vue-sonner'
import { useT } from '@/composables/useT'

const t = useT()
const authStore = useAuthStore()
const classroomsStore = useClassroomsStore()
const teachersStore = useManagerTeachersStore()

const props = defineProps<{
  classroom: ClassroomListItem | null
}>()

const open = defineModel<boolean>('open', { default: false })

const students = ref<ClassroomStudent[]>([])
const teachers = ref<ClassroomTeacher[]>([])
const isLoading = ref(false)
const isSaving = ref(false)
const activeTab = ref<'students' | 'teachers'>('students')
const mode = ref<'members' | 'add'>('members')
const selectedIds = ref<string[]>([])

// Only the manager assigns members (decision 49); a teacher gets a read-only view.
const canManage = computed(() => authStore.isManager)

const studentMemberIds = computed(() => students.value.map((member) => member.id))
const teacherMemberIds = computed(() => teachers.value.map((member) => member.id))

const orgStudentPicks = computed<PickableMember[]>(() =>
  classroomsStore.orgStudents.map((student) => ({
    id: student.id,
    name: student.name,
    detail: [student.username, student.gradeLevelName].filter(Boolean).join(' · ') || null,
  })),
)
const orgTeacherPicks = computed<PickableMember[]>(() =>
  teachersStore.teachers.map((teacher) => ({
    id: teacher.id,
    name: teacher.name,
    detail: teacher.email || null,
  })),
)

watch(open, async (isOpen) => {
  if (!isOpen || !props.classroom) return

  activeTab.value = 'students'
  mode.value = 'members'
  selectedIds.value = []
  isLoading.value = true

  const loads: Promise<{ error: string | null }>[] = []
  if (canManage.value) {
    loads.push(classroomsStore.fetchOrgStudents())
    if (teachersStore.teachers.length === 0 && !teachersStore.isLoading) {
      loads.push(teachersStore.fetchTeachers())
    }
  }

  const [studentsResult, teachersResult] = await Promise.all([
    classroomsStore.fetchClassroomStudents(props.classroom.id),
    classroomsStore.fetchClassroomTeachers(props.classroom.id),
    ...loads,
  ])
  isLoading.value = false

  if (studentsResult.error || teachersResult.error) {
    toast.error(t.value.staff.classroomMembers.toastLoadFailed)
    open.value = false
    return
  }

  students.value = studentsResult.students
  teachers.value = teachersResult.teachers
})

function switchTab(tab: string | number) {
  activeTab.value = tab === 'teachers' ? 'teachers' : 'students'
  mode.value = 'members'
  selectedIds.value = []
}

function openAdd() {
  selectedIds.value = []
  mode.value = 'add'
}

async function refreshMembers() {
  if (!props.classroom) return
  if (activeTab.value === 'students') {
    const { students: refreshed, error } = await classroomsStore.fetchClassroomStudents(
      props.classroom.id,
    )
    if (!error) students.value = refreshed
  } else {
    const { teachers: refreshed, error } = await classroomsStore.fetchClassroomTeachers(
      props.classroom.id,
    )
    if (!error) teachers.value = refreshed
  }
}

async function handleAddSelected() {
  if (!props.classroom || selectedIds.value.length === 0) return

  isSaving.value = true
  const { error } =
    activeTab.value === 'students'
      ? await classroomsStore.addClassroomStudents(props.classroom.id, selectedIds.value)
      : await classroomsStore.addClassroomTeachers(props.classroom.id, selectedIds.value)
  if (!error) await refreshMembers()
  isSaving.value = false

  if (error) {
    toast.error(error)
    return
  }

  toast.success(
    activeTab.value === 'students'
      ? t.value.staff.classroomMembers.toastStudentsAdded
      : t.value.staff.classroomMembers.toastTeachersAdded,
  )
  selectedIds.value = []
  mode.value = 'members'
}

async function handleRemoveStudent(student: ClassroomStudent) {
  if (!props.classroom) return

  isSaving.value = true
  const { error } = await classroomsStore.removeClassroomStudent(props.classroom.id, student.id)
  isSaving.value = false

  if (error) {
    toast.error(error)
    return
  }

  students.value = students.value.filter((member) => member.id !== student.id)
  toast.success(t.value.staff.classroomMembers.toastStudentRemoved)
}

async function handleRemoveTeacher(teacher: ClassroomTeacher) {
  if (!props.classroom) return

  isSaving.value = true
  const { error } = await classroomsStore.removeClassroomTeacher(props.classroom.id, teacher.id)
  isSaving.value = false

  if (error) {
    toast.error(error)
    return
  }

  teachers.value = teachers.value.filter((member) => member.id !== teacher.id)
  toast.success(t.value.staff.classroomMembers.toastTeacherRemoved)
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ t.staff.classroomMembers.title(classroom?.name ?? '') }}</DialogTitle>
        <DialogDescription>{{ t.staff.classroomMembers.description }}</DialogDescription>
      </DialogHeader>

      <div v-if="isLoading" class="flex items-center justify-center py-12">
        <Loader2 class="size-6 animate-spin text-muted-foreground" />
      </div>

      <Tabs v-else :model-value="activeTab" @update:model-value="switchTab">
        <TabsList class="w-full">
          <TabsTrigger value="students">
            <Users class="mr-1 size-4" />
            {{ t.staff.classroomMembers.studentsTab(students.length) }}
          </TabsTrigger>
          <TabsTrigger value="teachers">
            <GraduationCap class="mr-1 size-4" />
            {{ t.staff.classroomMembers.teachersTab(teachers.length) }}
          </TabsTrigger>
        </TabsList>

        <!-- Students -->
        <TabsContent value="students">
          <div v-if="mode === 'members'" class="space-y-3 py-2">
            <div class="flex items-center justify-between">
              <p class="text-sm text-muted-foreground">
                {{ t.staff.classroomMembers.studentsCount(students.length) }}
              </p>
              <Button v-if="canManage" size="sm" :disabled="isSaving" @click="openAdd">
                <Plus class="mr-2 size-4" />
                {{ t.staff.classroomMembers.addStudentsBtn }}
              </Button>
            </div>

            <div
              v-if="students.length === 0"
              class="rounded-lg border border-dashed py-10 text-center"
            >
              <Users class="mx-auto size-10 text-muted-foreground/50" />
              <p class="mt-2 text-sm text-muted-foreground">
                {{ t.staff.classroomMembers.noStudents }}
              </p>
            </div>

            <ul v-else class="max-h-72 space-y-1 overflow-y-auto">
              <li
                v-for="member in students"
                :key="member.id"
                class="flex items-center gap-3 rounded-md border px-3 py-2"
              >
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium">{{ member.name }}</span>
                  <span class="block truncate text-xs text-muted-foreground">
                    {{ [member.username, member.gradeLevelName].filter(Boolean).join(' · ') }}
                  </span>
                </span>
                <Button
                  v-if="canManage"
                  variant="ghost"
                  size="icon"
                  class="size-8 text-destructive hover:text-destructive"
                  :disabled="isSaving"
                  :aria-label="t.staff.classroomMembers.removeStudentLabel"
                  @click="handleRemoveStudent(member)"
                >
                  <UserMinus class="size-4" />
                </Button>
              </li>
            </ul>
          </div>

          <div v-else class="space-y-3 py-2">
            <Button
              variant="ghost"
              size="sm"
              class="-ml-2"
              :disabled="isSaving"
              @click="mode = 'members'"
            >
              <ArrowLeft class="mr-2 size-4" />
              {{ t.staff.classroomMembers.backToMembers }}
            </Button>

            <MemberPickList
              v-model:selected-ids="selectedIds"
              :members="orgStudentPicks"
              :disabled-ids="studentMemberIds"
              :disabled-label="t.staff.classroomMembers.alreadyInClassroom"
              :search-placeholder="t.staff.classroomMembers.studentSearchPlaceholder"
              :empty-text="t.staff.classroomMembers.noStudentsFound"
            />

            <Button
              class="w-full"
              :disabled="isSaving || selectedIds.length === 0"
              @click="handleAddSelected"
            >
              <Loader2 v-if="isSaving" class="mr-2 size-4 animate-spin" />
              {{ t.staff.classroomMembers.addSelectedStudents(selectedIds.length) }}
            </Button>
          </div>
        </TabsContent>

        <!-- Teachers -->
        <TabsContent value="teachers">
          <div v-if="mode === 'members'" class="space-y-3 py-2">
            <div class="flex items-center justify-between">
              <p class="text-sm text-muted-foreground">
                {{ t.staff.classroomMembers.teachersCount(teachers.length) }}
              </p>
              <Button v-if="canManage" size="sm" :disabled="isSaving" @click="openAdd">
                <Plus class="mr-2 size-4" />
                {{ t.staff.classroomMembers.addTeachersBtn }}
              </Button>
            </div>

            <div
              v-if="teachers.length === 0"
              class="rounded-lg border border-dashed py-10 text-center"
            >
              <GraduationCap class="mx-auto size-10 text-muted-foreground/50" />
              <p class="mt-2 text-sm text-muted-foreground">
                {{ t.staff.classroomMembers.noTeachers }}
              </p>
            </div>

            <ul v-else class="max-h-72 space-y-1 overflow-y-auto">
              <li
                v-for="member in teachers"
                :key="member.id"
                class="flex items-center gap-3 rounded-md border px-3 py-2"
              >
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-sm font-medium">{{ member.name }}</span>
                  <span class="block truncate text-xs text-muted-foreground">{{
                    member.email
                  }}</span>
                </span>
                <Button
                  v-if="canManage"
                  variant="ghost"
                  size="icon"
                  class="size-8 text-destructive hover:text-destructive"
                  :disabled="isSaving"
                  :aria-label="t.staff.classroomMembers.removeTeacherLabel"
                  @click="handleRemoveTeacher(member)"
                >
                  <UserMinus class="size-4" />
                </Button>
              </li>
            </ul>
          </div>

          <div v-else class="space-y-3 py-2">
            <Button
              variant="ghost"
              size="sm"
              class="-ml-2"
              :disabled="isSaving"
              @click="mode = 'members'"
            >
              <ArrowLeft class="mr-2 size-4" />
              {{ t.staff.classroomMembers.backToMembers }}
            </Button>

            <MemberPickList
              v-model:selected-ids="selectedIds"
              :members="orgTeacherPicks"
              :disabled-ids="teacherMemberIds"
              :disabled-label="t.staff.classroomMembers.alreadyInClassroom"
              :search-placeholder="t.staff.classroomMembers.teacherSearchPlaceholder"
              :empty-text="t.staff.classroomMembers.noTeachersFound"
            />

            <Button
              class="w-full"
              :disabled="isSaving || selectedIds.length === 0"
              @click="handleAddSelected"
            >
              <Loader2 v-if="isSaving" class="mr-2 size-4 animate-spin" />
              {{ t.staff.classroomMembers.addSelectedTeachers(selectedIds.length) }}
            </Button>
          </div>
        </TabsContent>
      </Tabs>

      <DialogFooter>
        <Button type="button" variant="outline" :disabled="isSaving" @click="open = false">
          {{ t.staff.classroomMembers.close }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
