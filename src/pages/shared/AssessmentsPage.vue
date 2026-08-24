<script setup lang="ts">
import { ref, h, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { ColumnDef } from '@tanstack/vue-table'
import { useAssessmentsStore, type AssessmentListItem } from '@/stores/assessments'
import { useAuthStore } from '@/stores/auth'
import { useClassroomScopeStore } from '@/stores/classroom-scope'
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
const scope = useClassroomScopeStore()

const basePath = computed(() => `/${authStore.userType}`)

/**
 * Admin variant: this page lists platform-wide TEMPLATES (is_template=true,
 * org-less). Templates are never assigned or attempted, so there is no
 * results surface and no status column — they are always editable.
 */
const isTemplateMode = computed(() => authStore.isAdmin)

/**
 * Keyed to the selected classroom for teachers (decision 79). Admins are
 * platform-wide and managers institution-wide (decision 82), so both pass
 * null and the list stays whatever RLS returns.
 */
const isClassroomScoped = computed(() => authStore.isTeacher)

watch(
  () => (isClassroomScoped.value ? scope.selectedId : 'unscoped'),
  async () => {
    const classroomId = isClassroomScoped.value ? scope.selectedId : null
    const { error } = await assessmentsStore.fetchAssessments(classroomId)
    if (error) {
      toast.error(t.value.staff.assessments.toastLoadFailed)
    }
    // Marking queue entry point (P9b): flag org assessments with submitted
    // attempts still awaiting manual marking. Templates are never attempted.
    if (!isTemplateMode.value) {
      void assessmentsStore.fetchPendingMarkingCounts()
    }
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
  // Templates carry no meaningful status (never assigned/attempted), but
  // always carry a grade+subject pairing that gates which centers see them.
  ...(isTemplateMode.value
    ? [
        {
          id: 'scope',
          accessorFn: (row: AssessmentListItem) =>
            `${row.gradeLevelName ?? ''} ${row.subjectName ?? ''}`,
          header: () => t.value.staff.assessments.scopeCol,
          cell: ({ row }) =>
            h(
              'div',
              { class: 'text-muted-foreground' },
              row.original.gradeLevelName && row.original.subjectName
                ? `${row.original.gradeLevelName} · ${row.original.subjectName}`
                : '—',
            ),
        } satisfies ColumnDef<AssessmentListItem>,
      ]
    : [
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
        } satisfies ColumnDef<AssessmentListItem>,
      ]),
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
      ]
      if (!isTemplateMode.value) {
        items.push(
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
        )
      }
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
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">
          {{ isTemplateMode ? t.staff.assessments.templatesTitle : t.staff.assessments.title }}
        </h1>
        <p class="text-muted-foreground">
          {{
            isTemplateMode ? t.staff.assessments.templatesSubtitle : t.staff.assessments.subtitle
          }}
        </p>
      </div>
      <Button
        v-if="!authStore.isManager"
        :disabled="assessmentsStore.isLoading"
        @click="showCreateDialog = true"
      >
        <Plus class="mr-2 size-4" />
        {{ isTemplateMode ? t.staff.assessments.createTemplateBtn : t.staff.assessments.createBtn }}
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
        <h2 class="mt-4 text-lg font-semibold">
          {{ isTemplateMode ? t.staff.assessments.noTemplates : t.staff.assessments.noAssessments }}
        </h2>
        <p class="mt-2 text-muted-foreground">
          {{
            assessmentsStore.filters.search
              ? t.staff.assessments.noAssessmentsMatchSearch
              : isTemplateMode
                ? t.staff.assessments.noTemplatesDesc
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

    <AssessmentCreateDialog
      v-model:open="showCreateDialog"
      :is-template="isTemplateMode"
      @created="handleCreated"
    />

    <!-- Delete confirmation -->
    <Dialog v-model:open="showDeleteDialog">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{
            isTemplateMode
              ? t.staff.assessments.deleteTemplateTitle
              : t.staff.assessments.deleteTitle
          }}</DialogTitle>
          <DialogDescription>{{
            isTemplateMode
              ? t.staff.assessments.deleteTemplateDesc(selectedAssessment?.title ?? '')
              : t.staff.assessments.deleteDesc(selectedAssessment?.title ?? '')
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
