<script setup lang="ts">
import { ref, h, onMounted } from 'vue'
import type { ColumnDef } from '@tanstack/vue-table'
import { useManagerTeachersStore, type ManagedTeacher } from '@/stores/manager-teachers'
import { Search, Plus, Loader2, Users, ArrowUpDown } from 'lucide-vue-next'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/ui/data-table'
import TeacherFormDialog from '@/components/manager/TeacherFormDialog.vue'
import { toast } from 'vue-sonner'
import { formatDate } from '@/lib/date'
import { useT } from '@/composables/useT'

const t = useT()
const teachersStore = useManagerTeachersStore()

onMounted(async () => {
  // The route guard may already have this in flight (fire-and-forget preload).
  if (teachersStore.teachers.length === 0 && !teachersStore.isLoading) {
    const { error } = await teachersStore.fetchTeachers()
    if (error) {
      toast.error(t.value.manager.teachers.toastLoadFailed)
    }
  }
})

const showTeacherFormDialog = ref(false)

async function handleTeacherCreated() {
  await teachersStore.fetchTeachers()
}

const columns: ColumnDef<ManagedTeacher>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => {
      return h(
        Button,
        {
          variant: 'ghost',
          onClick: () => column.toggleSorting(column.getIsSorted() === 'asc'),
        },
        () => [t.value.manager.teachers.nameCol, h(ArrowUpDown, { class: 'ml-2 size-4' })],
      )
    },
    cell: ({ row }) => h('div', { class: 'font-medium' }, row.original.name),
  },
  {
    accessorKey: 'email',
    header: () => t.value.manager.teachers.emailCol,
    cell: ({ row }) => h('div', { class: 'text-muted-foreground' }, row.original.email),
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
        () => [t.value.manager.teachers.joinedCol, h(ArrowUpDown, { class: 'ml-2 size-4' })],
      )
    },
    cell: ({ row }) => h('div', {}, formatDate(row.original.joinedAt)),
  },
]
</script>

<template>
  <div class="p-6">
    <div class="mb-6 flex items-center justify-end">
      <Button :disabled="teachersStore.isLoading" @click="showTeacherFormDialog = true">
        <Plus class="mr-2 size-4" />
        {{ t.manager.teachers.addTeacherBtn }}
      </Button>
    </div>

    <!-- Loading State -->
    <div v-if="teachersStore.isLoading" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <template v-else>
      <!-- Search Bar -->
      <div class="mb-4">
        <div class="relative w-[400px]">
          <Search class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            :model-value="teachersStore.filters.search"
            :placeholder="t.manager.teachers.searchPlaceholder"
            class="pl-9"
            @update:model-value="teachersStore.setSearch(String($event))"
          />
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="teachersStore.filteredTeachers.length === 0" class="py-16 text-center">
        <Users class="mx-auto size-16 text-muted-foreground/50" />
        <h2 class="mt-4 text-lg font-semibold">{{ t.manager.teachers.noTeachers }}</h2>
        <p class="mt-2 text-muted-foreground">
          {{
            teachersStore.filters.search
              ? t.manager.teachers.noTeachersMatchSearch
              : t.manager.teachers.noTeachersDesc
          }}
        </p>
      </div>

      <!-- Data Table -->
      <DataTable
        v-else
        :columns="columns"
        :data="teachersStore.filteredTeachers"
        :page-index="teachersStore.pagination.pageIndex"
        :page-size="teachersStore.pagination.pageSize"
        :on-page-index-change="teachersStore.setPageIndex"
        :on-page-size-change="teachersStore.setPageSize"
      />
    </template>

    <TeacherFormDialog v-model:open="showTeacherFormDialog" @created="handleTeacherCreated" />
  </div>
</template>
