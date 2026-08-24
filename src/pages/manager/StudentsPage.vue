<script setup lang="ts">
import { ref, h, onMounted } from 'vue'
import type { ColumnDef } from '@tanstack/vue-table'
import { useManagerStudentsStore, type ManagedStudent } from '@/stores/manager-students'
import type { CreatedAccount } from '@/composables/useCreateUser'
import { Search, Plus, Loader2, Users, ArrowUpDown } from 'lucide-vue-next'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/ui/data-table'
import StudentFormDialog from '@/components/manager/StudentFormDialog.vue'
import StudentCredentialsDialog from '@/components/manager/StudentCredentialsDialog.vue'
import { toast } from 'vue-sonner'
import { formatDate } from '@/lib/date'
import { useT } from '@/composables/useT'

const t = useT()
const studentsStore = useManagerStudentsStore()

onMounted(async () => {
  // The route guard may already have this in flight (fire-and-forget preload).
  if (studentsStore.students.length === 0 && !studentsStore.isLoading) {
    const { error } = await studentsStore.fetchStudents()
    if (error) {
      toast.error(t.value.manager.students.toastLoadFailed)
    }
  }
})

const showStudentFormDialog = ref(false)
const showCredentialsDialog = ref(false)
const createdAccount = ref<CreatedAccount | null>(null)

async function handleStudentCreated(account: CreatedAccount) {
  createdAccount.value = account
  showCredentialsDialog.value = true
  await studentsStore.fetchStudents()
}

const columns: ColumnDef<ManagedStudent>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => {
      return h(
        Button,
        {
          variant: 'ghost',
          onClick: () => column.toggleSorting(column.getIsSorted() === 'asc'),
        },
        () => [t.value.manager.students.nameCol, h(ArrowUpDown, { class: 'ml-2 size-4' })],
      )
    },
    cell: ({ row }) => h('div', { class: 'font-medium' }, row.original.name),
  },
  {
    accessorKey: 'username',
    header: () => t.value.manager.students.usernameCol,
    cell: ({ row }) =>
      h('div', { class: 'font-mono text-muted-foreground' }, row.original.username ?? '-'),
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
        () => [t.value.manager.students.gradeCol, h(ArrowUpDown, { class: 'ml-2 size-4' })],
      )
    },
    cell: ({ row }) => h('div', {}, row.original.gradeLevelName ?? '-'),
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
        () => [t.value.manager.students.joinedCol, h(ArrowUpDown, { class: 'ml-2 size-4' })],
      )
    },
    cell: ({ row }) => h('div', {}, formatDate(row.original.joinedAt)),
  },
]
</script>

<template>
  <div class="p-6">
    <div class="mb-6 flex items-center justify-end">
      <Button :disabled="studentsStore.isLoading" @click="showStudentFormDialog = true">
        <Plus class="mr-2 size-4" />
        {{ t.manager.students.addStudentBtn }}
      </Button>
    </div>

    <!-- Loading State -->
    <div v-if="studentsStore.isLoading" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <template v-else>
      <!-- Search Bar -->
      <div class="mb-4">
        <div class="relative w-[400px]">
          <Search class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            :model-value="studentsStore.filters.search"
            :placeholder="t.manager.students.searchPlaceholder"
            class="pl-9"
            @update:model-value="studentsStore.setSearch(String($event))"
          />
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="studentsStore.filteredStudents.length === 0" class="py-16 text-center">
        <Users class="mx-auto size-16 text-muted-foreground/50" />
        <h2 class="mt-4 text-lg font-semibold">{{ t.manager.students.noStudents }}</h2>
        <p class="mt-2 text-muted-foreground">
          {{
            studentsStore.filters.search
              ? t.manager.students.noStudentsMatchSearch
              : t.manager.students.noStudentsDesc
          }}
        </p>
      </div>

      <!-- Data Table -->
      <DataTable
        v-else
        :columns="columns"
        :data="studentsStore.filteredStudents"
        :page-index="studentsStore.pagination.pageIndex"
        :page-size="studentsStore.pagination.pageSize"
        :on-page-index-change="studentsStore.setPageIndex"
        :on-page-size-change="studentsStore.setPageSize"
      />
    </template>

    <StudentFormDialog v-model:open="showStudentFormDialog" @created="handleStudentCreated" />

    <StudentCredentialsDialog v-model:open="showCredentialsDialog" :account="createdAccount" />
  </div>
</template>
