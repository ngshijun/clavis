<script setup lang="ts">
import { ref, h, computed, onMounted } from 'vue'
import type { ColumnDef } from '@tanstack/vue-table'
import { useClassroomsStore, type ClassroomListItem } from '@/stores/classrooms'
import { useAuthStore } from '@/stores/auth'
import {
  ArrowUpDown,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  School,
  Search,
  Trash2,
  Users,
} from 'lucide-vue-next'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/ui/data-table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import ClassroomFormDialog from '@/components/staff/ClassroomFormDialog.vue'
import ClassroomMembersDialog from '@/components/staff/ClassroomMembersDialog.vue'
import { toast } from 'vue-sonner'
import { formatDate } from '@/lib/date'
import { useT } from '@/composables/useT'

const t = useT()
const authStore = useAuthStore()
const classroomsStore = useClassroomsStore()

/**
 * Manager-only surface: this is where classrooms are CREATED and teachers and
 * students assigned into them, which is inherently org-wide. Teachers get
 * their own picker instead (ClassroomPickerPage, decision 83).
 */
const visibleClassrooms = computed(() => classroomsStore.filteredClassrooms)

const subtitle = computed(() => {
  const organizationName = authStore.user?.organizationName
  return organizationName
    ? t.value.staff.classrooms.subtitleManager(organizationName)
    : t.value.staff.classrooms.subtitleManagerFallback
})

onMounted(async () => {
  if (classroomsStore.classrooms.length === 0 && !classroomsStore.isLoading) {
    const { error } = await classroomsStore.fetchClassrooms()
    if (error) {
      toast.error(t.value.staff.classrooms.toastLoadFailed)
    }
  }
})

const showFormDialog = ref(false)
const showMembersDialog = ref(false)
const showDeleteDialog = ref(false)
const selectedClassroom = ref<ClassroomListItem | null>(null)
const isDeleting = ref(false)

function openCreate() {
  selectedClassroom.value = null
  showFormDialog.value = true
}

function openEdit(item: ClassroomListItem) {
  selectedClassroom.value = item
  showFormDialog.value = true
}

function openMembers(item: ClassroomListItem) {
  selectedClassroom.value = item
  showMembersDialog.value = true
}

function openDelete(item: ClassroomListItem) {
  selectedClassroom.value = item
  showDeleteDialog.value = true
}

async function handleDelete() {
  if (!selectedClassroom.value) return

  isDeleting.value = true
  try {
    const { error } = await classroomsStore.deleteClassroom(selectedClassroom.value.id)
    if (error) {
      toast.error(error)
      return
    }
    toast.success(t.value.staff.classrooms.toastDeleted)
    showDeleteDialog.value = false
    selectedClassroom.value = null
  } finally {
    isDeleting.value = false
  }
}

const columns = computed<ColumnDef<ClassroomListItem>[]>(() => {
  const defs: ColumnDef<ClassroomListItem>[] = [
    {
      accessorKey: 'name',
      header: ({ column }) =>
        h(
          Button,
          {
            variant: 'ghost',
            onClick: () => column.toggleSorting(column.getIsSorted() === 'asc'),
          },
          () => [t.value.staff.classrooms.nameCol, h(ArrowUpDown, { class: 'ml-2 size-4' })],
        ),
      cell: ({ row }) => h('div', { class: 'font-medium' }, row.original.name),
    },
    {
      accessorKey: 'gradeLevelName',
      header: ({ column }) =>
        h(
          Button,
          {
            variant: 'ghost',
            onClick: () => column.toggleSorting(column.getIsSorted() === 'asc'),
          },
          () => [t.value.staff.classrooms.gradeCol, h(ArrowUpDown, { class: 'ml-2 size-4' })],
        ),
      cell: ({ row }) => h('div', {}, row.original.gradeLevelName),
    },
    {
      accessorKey: 'subjectName',
      header: ({ column }) =>
        h(
          Button,
          {
            variant: 'ghost',
            onClick: () => column.toggleSorting(column.getIsSorted() === 'asc'),
          },
          () => [t.value.staff.classrooms.subjectCol, h(ArrowUpDown, { class: 'ml-2 size-4' })],
        ),
      cell: ({ row }) => h('div', {}, row.original.subjectName),
    },
    {
      accessorKey: 'teacherCount',
      header: () => t.value.staff.classrooms.teachersCol,
      cell: ({ row }) => h('div', { class: 'tabular-nums' }, String(row.original.teacherCount)),
    },
    {
      accessorKey: 'studentCount',
      header: () => t.value.staff.classrooms.studentsCol,
      cell: ({ row }) => h('div', { class: 'tabular-nums' }, String(row.original.studentCount)),
    },
    {
      accessorKey: 'createdAt',
      header: ({ column }) =>
        h(
          Button,
          {
            variant: 'ghost',
            onClick: () => column.toggleSorting(column.getIsSorted() === 'asc'),
          },
          () => [t.value.staff.classrooms.createdCol, h(ArrowUpDown, { class: 'ml-2 size-4' })],
        ),
      cell: ({ row }) => h('div', {}, formatDate(row.original.createdAt)),
    },
  ]

  if (authStore.isManager) {
    defs.push({
      id: 'actions',
      cell: ({ row }) => {
        const item = row.original
        return h(
          DropdownMenu,
          {},
          {
            default: () => [
              h(DropdownMenuTrigger, { asChild: true }, () =>
                h(
                  Button,
                  {
                    variant: 'ghost',
                    size: 'icon',
                    class: 'size-6',
                    onClick: (event: Event) => event.stopPropagation(),
                  },
                  () => h(MoreHorizontal, { class: 'size-4' }),
                ),
              ),
              h(DropdownMenuContent, { align: 'end' }, () => [
                h(
                  DropdownMenuItem,
                  {
                    onClick: (event: Event) => {
                      event.stopPropagation()
                      openMembers(item)
                    },
                  },
                  () => [
                    h(Users, { class: 'mr-2 size-4' }),
                    t.value.staff.classrooms.manageMembers,
                  ],
                ),
                h(
                  DropdownMenuItem,
                  {
                    onClick: (event: Event) => {
                      event.stopPropagation()
                      openEdit(item)
                    },
                  },
                  () => [h(Pencil, { class: 'mr-2 size-4' }), t.value.staff.classrooms.editAction],
                ),
                h(
                  DropdownMenuItem,
                  {
                    class: 'text-destructive focus:text-destructive',
                    onClick: (event: Event) => {
                      event.stopPropagation()
                      openDelete(item)
                    },
                  },
                  () => [
                    h(Trash2, { class: 'mr-2 size-4' }),
                    t.value.staff.classrooms.deleteAction,
                  ],
                ),
              ]),
            ],
          },
        )
      },
    })
  }

  return defs
})
</script>

<template>
  <div class="p-6">
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">{{ t.staff.classrooms.title }}</h1>
        <p class="text-muted-foreground">{{ subtitle }}</p>
      </div>
      <Button v-if="authStore.isManager" :disabled="classroomsStore.isLoading" @click="openCreate">
        <Plus class="mr-2 size-4" />
        {{ t.staff.classrooms.addClassroomBtn }}
      </Button>
    </div>

    <!-- Loading State -->
    <div v-if="classroomsStore.isLoading" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <template v-else>
      <!-- Search Bar -->
      <div class="mb-4">
        <div class="relative w-[400px]">
          <Search class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            :model-value="classroomsStore.filters.search"
            :placeholder="t.staff.classrooms.searchPlaceholder"
            class="pl-9"
            @update:model-value="classroomsStore.setSearch(String($event))"
          />
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="visibleClassrooms.length === 0" class="py-16 text-center">
        <School class="mx-auto size-16 text-muted-foreground/50" />
        <h2 class="mt-4 text-lg font-semibold">{{ t.staff.classrooms.noClassrooms }}</h2>
        <p class="mt-2 text-muted-foreground">
          {{
            classroomsStore.filters.search
              ? t.staff.classrooms.noClassroomsMatchSearch
              : t.staff.classrooms.noClassroomsDescManager
          }}
        </p>
      </div>

      <!-- Data Table -->
      <DataTable
        v-else
        :columns="columns"
        :data="visibleClassrooms"
        :on-row-click="openMembers"
        :page-index="classroomsStore.pagination.pageIndex"
        :page-size="classroomsStore.pagination.pageSize"
        :on-page-index-change="classroomsStore.setPageIndex"
        :on-page-size-change="classroomsStore.setPageSize"
      />
    </template>

    <ClassroomFormDialog v-model:open="showFormDialog" :classroom="selectedClassroom" />

    <ClassroomMembersDialog v-model:open="showMembersDialog" :classroom="selectedClassroom" />

    <!-- Delete confirmation -->
    <Dialog v-model:open="showDeleteDialog">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{ t.staff.classrooms.deleteTitle }}</DialogTitle>
          <DialogDescription>{{
            t.staff.classrooms.deleteDesc(selectedClassroom?.name ?? '')
          }}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" :disabled="isDeleting" @click="showDeleteDialog = false">
            {{ t.staff.classrooms.cancel }}
          </Button>
          <Button variant="destructive" :disabled="isDeleting" @click="handleDelete">
            <Loader2 v-if="isDeleting" class="mr-2 size-4 animate-spin" />
            {{ t.staff.classrooms.deleteConfirm }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
