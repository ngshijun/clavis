<script setup lang="ts">
import { ref, h, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { ColumnDef } from '@tanstack/vue-table'
import { useAssessmentsStore, type AssessmentListItem } from '@/stores/assessments'
import { useAuthStore } from '@/stores/auth'
import { useActiveClassroom } from '@/composables/useActiveClassroom'
import {
  ArrowUpDown,
  BarChart3,
  ClipboardList,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from 'lucide-vue-next'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
import AssessmentCreateDialog from '@/components/staff/AssessmentCreateDialog.vue'
import { toast } from 'vue-sonner'
import { formatDate } from '@/lib/date'
import { useT } from '@/composables/useT'

const t = useT()
const router = useRouter()
const authStore = useAuthStore()
const assessmentsStore = useAssessmentsStore()
const { classroomId, basePath } = useActiveClassroom()

/**
 * Keyed to the classroom in the URL for BOTH org roles (decision 83 for
 * teachers, decision 87 for managers). Every assessment belongs to exactly one
 * classroom (decision 81), so this is the only scope in which the list can
 * answer "which class is this row for?".
 */
watch(
  classroomId,
  async (id) => {
    if (!id) return
    const { error } = await assessmentsStore.fetchAssessments(id)
    if (error) {
      toast.error(t.value.staff.assessments.toastLoadFailed)
    }
    // Marking queue entry point (P9b): flag assessments with submitted
    // attempts still awaiting manual marking.
    void assessmentsStore.fetchPendingMarkingCounts()
  },
  { immediate: true },
)

const showCreateDialog = ref(false)
const showDeleteDialog = ref(false)
const selectedAssessment = ref<AssessmentListItem | null>(null)
const isDeleting = ref(false)

function openBuilder(item: AssessmentListItem) {
  router.push(`${basePath.value}/assessments/${item.id}`)
}

function openResults(item: AssessmentListItem) {
  router.push(`${basePath.value}/assessments/${item.id}?tab=results`)
}

function handleCreated(id: string) {
  router.push(`${basePath.value}/assessments/${id}`)
}

function openDelete(item: AssessmentListItem) {
  selectedAssessment.value = item
  showDeleteDialog.value = true
}

async function handleDelete() {
  if (!selectedAssessment.value) return

  isDeleting.value = true
  try {
    const { error } = await assessmentsStore.deleteAssessment(selectedAssessment.value.id)
    if (error) {
      toast.error(error)
      return
    }
    toast.success(t.value.staff.assessments.toastDeleted)
    showDeleteDialog.value = false
    selectedAssessment.value = null
  } finally {
    isDeleting.value = false
  }
}

function statusBadge(status: AssessmentListItem['status']) {
  return status === 'published'
    ? h(
        Badge,
        {
          variant: 'secondary',
          class: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300',
        },
        () => t.value.staff.assessments.statusPublished,
      )
    : h(Badge, { variant: 'secondary' }, () => t.value.staff.assessments.statusDraft)
}

const columns = computed<ColumnDef<AssessmentListItem>[]>(() => [
  {
    accessorKey: 'title',
    header: ({ column }) =>
      h(
        Button,
        {
          variant: 'ghost',
          onClick: () => column.toggleSorting(column.getIsSorted() === 'asc'),
        },
        () => [t.value.staff.assessments.titleCol, h(ArrowUpDown, { class: 'ml-2 size-4' })],
      ),
    cell: ({ row }) =>
      h(
        'div',
        { class: 'max-w-[20rem] truncate font-medium', title: row.original.title },
        row.original.title,
      ),
  },
  {
    accessorKey: 'status',
    header: () => t.value.staff.assessments.statusCol,
    cell: ({ row }) => {
      const pending = assessmentsStore.pendingMarkingCounts.get(row.original.id) ?? 0
      if (pending === 0) return statusBadge(row.original.status)
      return h('div', { class: 'flex items-center gap-1' }, [
        statusBadge(row.original.status),
        h(
          Badge,
          {
            variant: 'secondary',
            class: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
          },
          () => t.value.staff.results.toMarkBadge(pending),
        ),
      ])
    },
  },
  {
    accessorKey: 'questionCount',
    header: () => t.value.staff.assessments.questionsCol,
    cell: ({ row }) => h('div', {}, String(row.original.questionCount)),
  },
  {
    accessorKey: 'createdByName',
    header: () => t.value.staff.assessments.creatorCol,
    cell: ({ row }) => h('div', { class: 'text-muted-foreground' }, row.original.createdByName),
  },
  {
    accessorKey: 'updatedAt',
    header: ({ column }) =>
      h(
        Button,
        {
          variant: 'ghost',
          onClick: () => column.toggleSorting(column.getIsSorted() === 'asc'),
        },
        () => [t.value.staff.assessments.updatedCol, h(ArrowUpDown, { class: 'ml-2 size-4' })],
      ),
    cell: ({ row }) => h('div', {}, formatDate(row.original.updatedAt)),
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const item = row.original
      const items = [
        h(
          DropdownMenuItem,
          {
            onClick: (event: Event) => {
              event.stopPropagation()
              openBuilder(item)
            },
          },
          () => [h(Pencil, { class: 'mr-2 size-4' }), t.value.staff.assessments.openBuilder],
        ),
        h(
          DropdownMenuItem,
          {
            onClick: (event: Event) => {
              event.stopPropagation()
              openResults(item)
            },
          },
          () => [h(BarChart3, { class: 'mr-2 size-4' }), t.value.staff.assessments.viewResults],
        ),
      ]
      if (assessmentsStore.canEdit(item)) {
        items.push(
          h(
            DropdownMenuItem,
            {
              class: 'text-destructive focus:text-destructive',
              onClick: (event: Event) => {
                event.stopPropagation()
                openDelete(item)
              },
            },
            () => [h(Trash2, { class: 'mr-2 size-4' }), t.value.staff.assessments.deleteAction],
          ),
        )
      }
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
            h(DropdownMenuContent, { align: 'end' }, () => items),
          ],
        },
      )
    },
  },
])
</script>

<template>
  <div class="p-6">
    <div class="mb-6 flex items-center justify-end">
      <Button
        v-if="!authStore.isManager"
        :disabled="assessmentsStore.isLoading"
        @click="showCreateDialog = true"
      >
        <Plus class="mr-2 size-4" />
        {{ t.staff.assessments.createBtn }}
      </Button>
    </div>

    <!-- Loading State -->
    <div v-if="assessmentsStore.isLoading" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <template v-else>
      <!-- Search Bar -->
      <div class="mb-4">
        <div class="relative w-[400px]">
          <Search class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            :model-value="assessmentsStore.filters.search"
            :placeholder="t.staff.assessments.searchPlaceholder"
            class="pl-9"
            @update:model-value="assessmentsStore.setSearch(String($event))"
          />
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="assessmentsStore.filteredAssessments.length === 0" class="py-16 text-center">
        <ClipboardList class="mx-auto size-16 text-muted-foreground/50" />
        <h2 class="mt-4 text-lg font-semibold">{{ t.staff.assessments.noAssessments }}</h2>
        <p class="mt-2 text-muted-foreground">
          {{
            assessmentsStore.filters.search
              ? t.staff.assessments.noAssessmentsMatchSearch
              : t.staff.assessments.noAssessmentsDesc
          }}
        </p>
      </div>

      <!-- Data Table -->
      <DataTable
        v-else
        :columns="columns"
        :data="assessmentsStore.filteredAssessments"
        :on-row-click="openBuilder"
        :page-index="assessmentsStore.pagination.pageIndex"
        :page-size="assessmentsStore.pagination.pageSize"
        :on-page-index-change="assessmentsStore.setPageIndex"
        :on-page-size-change="assessmentsStore.setPageSize"
      />
    </template>

    <AssessmentCreateDialog v-model:open="showCreateDialog" @created="handleCreated" />

    <!-- Delete confirmation -->
    <Dialog v-model:open="showDeleteDialog">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{ t.staff.assessments.deleteTitle }}</DialogTitle>
          <DialogDescription>{{
            t.staff.assessments.deleteDesc(selectedAssessment?.title ?? '')
          }}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" :disabled="isDeleting" @click="showDeleteDialog = false">
            {{ t.staff.assessments.cancel }}
          </Button>
          <Button variant="destructive" :disabled="isDeleting" @click="handleDelete">
            <Loader2 v-if="isDeleting" class="mr-2 size-4 animate-spin" />
            {{ t.staff.assessments.deleteConfirm }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
