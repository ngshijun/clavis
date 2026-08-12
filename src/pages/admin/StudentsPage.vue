<script setup lang="ts">
import { onMounted, h } from 'vue'
import { useRouter } from 'vue-router'
import type { ColumnDef } from '@tanstack/vue-table'
import { useAdminStudentsStore, type AdminStudent } from '@/stores/admin-students'
import { Search, Loader2, Users, ArrowUpDown } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DataTable } from '@/components/ui/data-table'
import { toast } from 'vue-sonner'
import { formatDate } from '@/lib/date'
import { useT } from '@/composables/useT'

const router = useRouter()
const adminStudentsStore = useAdminStudentsStore()
const t = useT()

// Fetch students on mount
onMounted(async () => {
  if (adminStudentsStore.students.length === 0) {
    const result = await adminStudentsStore.fetchAllStudents()
    if (result.error) {
      toast.error(result.error)
    }
  }
})

// Column definitions
const columns: ColumnDef<AdminStudent>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => {
      return h(
        Button,
        {
          variant: 'ghost',
          onClick: () => column.toggleSorting(column.getIsSorted() === 'asc'),
        },
        () => [t.value.admin.students.nameCol, h(ArrowUpDown, { class: 'ml-2 size-4' })],
      )
    },
    cell: ({ row }) => {
      return h('div', { class: 'font-medium' }, row.original.name)
    },
  },
  {
    accessorKey: 'email',
    header: () => t.value.admin.students.emailCol,
    cell: ({ row }) => {
      return h('div', { class: 'text-muted-foreground' }, row.original.email)
    },
  },
  {
    accessorKey: 'gradeLevelName',
    header: ({ column }) => {
      return h(
        Button,
        {
          variant: 'ghost',
          onClick: () => column.toggleSorting(column.getIsSorted() === 'asc'),
        },
        () => [t.value.admin.students.gradeCol, h(ArrowUpDown, { class: 'ml-2 size-4' })],
      )
    },
    cell: ({ row }) => {
      return h('div', {}, row.original.gradeLevelName ?? '-')
    },
  },
  {
    accessorKey: 'dateOfBirth',
    header: () => t.value.admin.students.dobCol,
    cell: ({ row }) => {
      return h('div', {}, formatDate(row.original.dateOfBirth))
    },
  },
  {
    accessorKey: 'joinedAt',
    header: ({ column }) => {
      return h(
        Button,
        {
          variant: 'ghost',
          onClick: () => column.toggleSorting(column.getIsSorted() === 'asc'),
        },
        () => [t.value.admin.students.joinedCol, h(ArrowUpDown, { class: 'ml-2 size-4' })],
      )
    },
    cell: ({ row }) => {
      return h('div', {}, formatDate(row.original.joinedAt))
    },
  },
]

function handleRowClick(student: AdminStudent) {
  router.push(`/admin/students/${student.id}/statistics`)
}
</script>

<template>
  <div class="p-6">
    <div class="mb-6">
      <h1 class="text-2xl font-bold">{{ t.admin.students.title }}</h1>
      <p class="text-muted-foreground">{{ t.admin.students.subtitle }}</p>
    </div>

    <!-- Loading State -->
    <div v-if="adminStudentsStore.isLoadingStudents" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <template v-else>
      <!-- Search Bar -->
      <div class="mb-4">
        <div class="relative w-[400px]">
          <Search class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            :model-value="adminStudentsStore.studentsFilters.search"
            :placeholder="t.admin.students.searchPlaceholder"
            class="pl-9"
            @update:model-value="adminStudentsStore.setStudentsSearch(String($event))"
          />
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="adminStudentsStore.filteredStudents.length === 0" class="py-16 text-center">
        <Users class="mx-auto size-16 text-muted-foreground/50" />
        <h2 class="mt-4 text-lg font-semibold">{{ t.admin.students.noStudentsFound }}</h2>
        <p class="mt-2 text-muted-foreground">
          {{
            adminStudentsStore.studentsFilters.search
              ? t.admin.students.noStudentsMatchSearch
              : t.admin.students.noStudentsRegistered
          }}
        </p>
      </div>

      <!-- Data Table -->
      <DataTable
        v-else
        :columns="columns"
        :data="adminStudentsStore.filteredStudents"
        :on-row-click="handleRowClick"
        :page-index="adminStudentsStore.studentsPagination.pageIndex"
        :page-size="adminStudentsStore.studentsPagination.pageSize"
        :on-page-index-change="adminStudentsStore.setStudentsPageIndex"
        :on-page-size-change="adminStudentsStore.setStudentsPageSize"
      />
    </template>
  </div>
</template>
