<script setup lang="ts">
import { ref, h, computed, onMounted } from 'vue'
import type { ColumnDef } from '@tanstack/vue-table'
import { useClassesStore, type ClassListItem } from '@/stores/classes'
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
import ClassFormDialog from '@/components/staff/ClassFormDialog.vue'
import ClassMembersDialog from '@/components/staff/ClassMembersDialog.vue'
import { toast } from 'vue-sonner'
import { formatDate } from '@/lib/date'
import { useT } from '@/composables/useT'

const t = useT()
const authStore = useAuthStore()
const classesStore = useClassesStore()

const subtitle = computed(() => {
  if (authStore.isTeacher) return t.value.staff.classes.subtitleTeacher
  const organizationName = authStore.user?.organizationName
  return organizationName
    ? t.value.staff.classes.subtitleManager(organizationName)
    : t.value.staff.classes.subtitleManagerFallback
})

onMounted(async () => {
  if (classesStore.classes.length === 0 && !classesStore.isLoading) {
    const { error } = await classesStore.fetchClasses()
    if (error) {
      toast.error(t.value.staff.classes.toastLoadFailed)
    }
  }
})

const showFormDialog = ref(false)
const showMembersDialog = ref(false)
const showDeleteDialog = ref(false)
const selectedClass = ref<ClassListItem | null>(null)
const isDeleting = ref(false)

function openCreate() {
  selectedClass.value = null
  showFormDialog.value = true
}

function openRename(item: ClassListItem) {
  selectedClass.value = item
  showFormDialog.value = true
}

function openMembers(item: ClassListItem) {
  selectedClass.value = item
  showMembersDialog.value = true
}

function openDelete(item: ClassListItem) {
  selectedClass.value = item
  showDeleteDialog.value = true
}

async function handleDelete() {
  if (!selectedClass.value) return

  isDeleting.value = true
  try {
    const { error } = await classesStore.deleteClass(selectedClass.value.id)
    if (error) {
      toast.error(error)
      return
    }
    toast.success(t.value.staff.classes.toastDeleted)
    showDeleteDialog.value = false
    selectedClass.value = null
  } finally {
    isDeleting.value = false
  }
}

const columns = computed<ColumnDef<ClassListItem>[]>(() => {
  const defs: ColumnDef<ClassListItem>[] = [
    {
      accessorKey: 'name',
      header: ({ column }) =>
        h(
          Button,
          {
            variant: 'ghost',
            onClick: () => column.toggleSorting(column.getIsSorted() === 'asc'),
          },
          () => [t.value.staff.classes.nameCol, h(ArrowUpDown, { class: 'ml-2 size-4' })],
        ),
      cell: ({ row }) => h('div', { class: 'font-medium' }, row.original.name),
    },
  ]

  if (authStore.isManager) {
    defs.push({
      accessorKey: 'teacherName',
      header: ({ column }) =>
        h(
          Button,
          {
            variant: 'ghost',
            onClick: () => column.toggleSorting(column.getIsSorted() === 'asc'),
          },
          () => [t.value.staff.classes.teacherCol, h(ArrowUpDown, { class: 'ml-2 size-4' })],
        ),
      cell: ({ row }) => h('div', {}, row.original.teacherName),
    })
  }

  defs.push(
    {
      accessorKey: 'studentCount',
      header: () => t.value.staff.classes.studentsCol,
      cell: ({ row }) => h('div', {}, String(row.original.studentCount)),
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
          () => [t.value.staff.classes.createdCol, h(ArrowUpDown, { class: 'ml-2 size-4' })],
        ),
      cell: ({ row }) => h('div', {}, formatDate(row.original.createdAt)),
    },
    {
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
                  () => [h(Users, { class: 'mr-2 size-4' }), t.value.staff.classes.manageMembers],
                ),
                h(
                  DropdownMenuItem,
                  {
                    onClick: (event: Event) => {
                      event.stopPropagation()
                      openRename(item)
                    },
                  },
                  () => [h(Pencil, { class: 'mr-2 size-4' }), t.value.staff.classes.rename],
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
                  () => [h(Trash2, { class: 'mr-2 size-4' }), t.value.staff.classes.deleteAction],
                ),
              ]),
            ],
          },
        )
      },
    },
  )

  return defs
})
</script>

<template>
  <div class="p-6">
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">{{ t.staff.classes.title }}</h1>
        <p class="text-muted-foreground">{{ subtitle }}</p>
      </div>
      <Button :disabled="classesStore.isLoading" @click="openCreate">
        <Plus class="mr-2 size-4" />
        {{ t.staff.classes.addClassBtn }}
      </Button>
    </div>

    <!-- Loading State -->
    <div v-if="classesStore.isLoading" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <template v-else>
      <!-- Search Bar -->
      <div class="mb-4">
        <div class="relative w-[400px]">
          <Search class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            :model-value="classesStore.filters.search"
            :placeholder="t.staff.classes.searchPlaceholder"
            class="pl-9"
            @update:model-value="classesStore.setSearch(String($event))"
          />
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="classesStore.filteredClasses.length === 0" class="py-16 text-center">
        <School class="mx-auto size-16 text-muted-foreground/50" />
        <h2 class="mt-4 text-lg font-semibold">{{ t.staff.classes.noClasses }}</h2>
        <p class="mt-2 text-muted-foreground">
          {{
            classesStore.filters.search
              ? t.staff.classes.noClassesMatchSearch
              : t.staff.classes.noClassesDesc
          }}
        </p>
      </div>

      <!-- Data Table -->
      <DataTable
        v-else
        :columns="columns"
        :data="classesStore.filteredClasses"
        :on-row-click="openMembers"
        :page-index="classesStore.pagination.pageIndex"
        :page-size="classesStore.pagination.pageSize"
        :on-page-index-change="classesStore.setPageIndex"
        :on-page-size-change="classesStore.setPageSize"
      />
    </template>

    <ClassFormDialog v-model:open="showFormDialog" :class-item="selectedClass" />

    <ClassMembersDialog v-model:open="showMembersDialog" :class-item="selectedClass" />

    <!-- Delete confirmation -->
    <Dialog v-model:open="showDeleteDialog">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{ t.staff.classes.deleteTitle }}</DialogTitle>
          <DialogDescription>{{
            t.staff.classes.deleteDesc(selectedClass?.name ?? '')
          }}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" :disabled="isDeleting" @click="showDeleteDialog = false">
            {{ t.staff.classes.cancel }}
          </Button>
          <Button variant="destructive" :disabled="isDeleting" @click="handleDelete">
            <Loader2 v-if="isDeleting" class="mr-2 size-4 animate-spin" />
            {{ t.staff.classes.deleteConfirm }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
