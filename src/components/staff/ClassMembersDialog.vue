<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useClassesStore, type ClassListItem, type ClassStudent } from '@/stores/classes'
import { ArrowLeft, Loader2, Plus, UserMinus, Users } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import StudentPickList from './StudentPickList.vue'
import { toast } from 'vue-sonner'
import { useT } from '@/composables/useT'

const t = useT()
const classesStore = useClassesStore()

const props = defineProps<{
  classItem: ClassListItem | null
}>()

const open = defineModel<boolean>('open', { default: false })

const members = ref<ClassStudent[]>([])
const isLoading = ref(false)
const isSaving = ref(false)
const mode = ref<'members' | 'add'>('members')
const selectedIds = ref<string[]>([])

const memberIds = computed(() => members.value.map((member) => member.id))

watch(open, async (isOpen) => {
  if (!isOpen || !props.classItem) return

  mode.value = 'members'
  selectedIds.value = []
  isLoading.value = true

  const [membersResult, studentsResult] = await Promise.all([
    classesStore.fetchClassMembers(props.classItem.id),
    classesStore.fetchOrgStudents(),
  ])
  isLoading.value = false

  if (membersResult.error) {
    toast.error(t.value.staff.classMembers.toastLoadFailed)
    open.value = false
    return
  }
  if (studentsResult.error) {
    toast.error(studentsResult.error)
  }

  members.value = membersResult.members
})

async function handleAddSelected() {
  if (!props.classItem || selectedIds.value.length === 0) return

  isSaving.value = true
  const { error } = await classesStore.addClassMembers(props.classItem.id, selectedIds.value)
  if (!error && props.classItem) {
    const { members: refreshed, error: refreshError } = await classesStore.fetchClassMembers(
      props.classItem.id,
    )
    if (!refreshError) members.value = refreshed
  }
  isSaving.value = false

  if (error) {
    toast.error(error)
    return
  }

  toast.success(t.value.staff.classMembers.toastAdded)
  selectedIds.value = []
  mode.value = 'members'
}

async function handleRemove(student: ClassStudent) {
  if (!props.classItem) return

  isSaving.value = true
  const { error } = await classesStore.removeClassMember(props.classItem.id, student.id)
  isSaving.value = false

  if (error) {
    toast.error(error)
    return
  }

  members.value = members.value.filter((member) => member.id !== student.id)
  toast.success(t.value.staff.classMembers.toastRemoved)
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{{ t.staff.classMembers.title(classItem?.name ?? '') }}</DialogTitle>
        <DialogDescription>{{ t.staff.classMembers.description }}</DialogDescription>
      </DialogHeader>

      <div v-if="isLoading" class="flex items-center justify-center py-12">
        <Loader2 class="size-6 animate-spin text-muted-foreground" />
      </div>

      <!-- Members list -->
      <div v-else-if="mode === 'members'" class="space-y-3 py-2">
        <div class="flex items-center justify-between">
          <p class="text-sm text-muted-foreground">
            {{ t.staff.classMembers.membersCount(members.length) }}
          </p>
          <Button size="sm" :disabled="isSaving" @click="mode = 'add'">
            <Plus class="mr-2 size-4" />
            {{ t.staff.classMembers.addStudentsBtn }}
          </Button>
        </div>

        <div v-if="members.length === 0" class="rounded-lg border border-dashed py-10 text-center">
          <Users class="mx-auto size-10 text-muted-foreground/50" />
          <p class="mt-2 text-sm text-muted-foreground">{{ t.staff.classMembers.empty }}</p>
        </div>

        <ul v-else class="max-h-72 space-y-1 overflow-y-auto">
          <li
            v-for="member in members"
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
              variant="ghost"
              size="icon"
              class="size-8 text-destructive hover:text-destructive"
              :disabled="isSaving"
              :aria-label="t.staff.classMembers.removeLabel"
              @click="handleRemove(member)"
            >
              <UserMinus class="size-4" />
            </Button>
          </li>
        </ul>

        <DialogFooter>
          <Button type="button" variant="outline" @click="open = false">
            {{ t.staff.classMembers.close }}
          </Button>
        </DialogFooter>
      </div>

      <!-- Add-students picker -->
      <div v-else class="space-y-3 py-2">
        <Button
          variant="ghost"
          size="sm"
          class="-ml-2"
          :disabled="isSaving"
          @click="mode = 'members'"
        >
          <ArrowLeft class="mr-2 size-4" />
          {{ t.staff.classMembers.backToMembers }}
        </Button>

        <StudentPickList
          v-model:selected-ids="selectedIds"
          :students="classesStore.orgStudents"
          :disabled-ids="memberIds"
          :disabled-label="t.staff.classMembers.alreadyInClass"
          :search-placeholder="t.staff.classMembers.searchPlaceholder"
          :empty-text="t.staff.classMembers.noStudentsFound"
        />

        <DialogFooter>
          <Button type="button" variant="outline" :disabled="isSaving" @click="mode = 'members'">
            {{ t.staff.classMembers.close }}
          </Button>
          <Button :disabled="isSaving || selectedIds.length === 0" @click="handleAddSelected">
            <Loader2 v-if="isSaving" class="mr-2 size-4 animate-spin" />
            {{ t.staff.classMembers.addSelected(selectedIds.length) }}
          </Button>
        </DialogFooter>
      </div>
    </DialogContent>
  </Dialog>
</template>
