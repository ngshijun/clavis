<script setup lang="ts">
import { ref, h, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import type { ColumnDef } from '@tanstack/vue-table'
import { useAssessmentTemplatesStore, type AssessmentTemplate } from '@/stores/assessment-templates'
import {
  ArrowUpDown,
  ClipboardList,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Sparkles,
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
import TemplateCreateDialog from '@/components/admin/TemplateCreateDialog.vue'
import GenerateTemplateDialog from '@/components/admin/GenerateTemplateDialog.vue'
import { toast } from 'vue-sonner'
import { formatDate } from '@/lib/date'
import { useT } from '@/composables/useT'

/**
 * The admin template library (decision 89). A template is a title, a
 * grade+subject pairing, a status and an ordered list of bank questions;
 * publishing it makes it visible to every center with a matching classroom.
 */
const t = useT()
const router = useRouter()
const templatesStore = useAssessmentTemplatesStore()

const search = ref('')

const filteredTemplates = computed(() => {
  const query = search.value.toLowerCase().trim()
  if (!query) return templatesStore.templates
  return templatesStore.templates.filter((item) => item.title.toLowerCase().includes(query))
})

onMounted(async () => {
  const { error } = await templatesStore.fetchTemplates()
  if (error) toast.error(t.value.staff.templates.toastLoadFailed)
})

const showCreateDialog = ref(false)
const showGenerateDialog = ref(false)
const showDeleteDialog = ref(false)
const selectedTemplate = ref<AssessmentTemplate | null>(null)
const isDeleting = ref(false)

function openBuilder(item: AssessmentTemplate) {
  router.push(`/admin/templates/${item.id}`)
}

function handleCreated(id: string) {
  router.push(`/admin/templates/${id}`)
}

function openDelete(item: AssessmentTemplate) {
  selectedTemplate.value = item
  showDeleteDialog.value = true
}

async function handleDelete() {
  if (!selectedTemplate.value) return

  isDeleting.value = true
  try {
    const { error } = await templatesStore.deleteTemplate(selectedTemplate.value.id)
    if (error) {
      toast.error(error)
      return
    }
    toast.success(t.value.staff.templates.toastDeleted)
    showDeleteDialog.value = false
    selectedTemplate.value = null
  } finally {
    isDeleting.value = false
  }
}

function statusBadge(status: AssessmentTemplate['status']) {
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

const columns = computed<ColumnDef<AssessmentTemplate>[]>(() => [
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
    id: 'scope',
    accessorFn: (row: AssessmentTemplate) => `${row.gradeLevelName} ${row.subjectName}`,
    header: () => t.value.staff.templates.scopeCol,
    cell: ({ row }) =>
      h(
        'div',
        { class: 'text-muted-foreground' },
        `${row.original.gradeLevelName} · ${row.original.subjectName}`,
      ),
  },
  {
    accessorKey: 'status',
    header: () => t.value.staff.assessments.statusCol,
    cell: ({ row }) => statusBadge(row.original.status),
  },
  {
    accessorKey: 'questionCount',
    header: () => t.value.staff.assessments.questionsCol,
    cell: ({ row }) => h('div', {}, String(row.original.questionCount)),
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
                    openBuilder(item)
                  },
                },
                () => [h(Pencil, { class: 'mr-2 size-4' }), t.value.staff.assessments.openBuilder],
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
                () => [h(Trash2, { class: 'mr-2 size-4' }), t.value.staff.assessments.deleteAction],
              ),
            ]),
          ],
        },
      )
    },
  },
])
</script>

<template>
  <div class="p-6">
    <div class="mb-6 flex items-center justify-end gap-2">
      <Button
        variant="outline"
        :disabled="templatesStore.isLoading"
        @click="showGenerateDialog = true"
      >
        <Sparkles class="mr-2 size-4" />
        {{ t.staff.generate.btn }}
      </Button>
      <Button :disabled="templatesStore.isLoading" @click="showCreateDialog = true">
        <Plus class="mr-2 size-4" />
        {{ t.staff.templates.createBtn }}
      </Button>
    </div>

    <div v-if="templatesStore.isLoading" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <template v-else>
      <div class="mb-4">
        <div class="relative w-[400px]">
          <Search class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input v-model="search" :placeholder="t.staff.templates.searchPlaceholder" class="pl-9" />
        </div>
      </div>

      <div v-if="filteredTemplates.length === 0" class="py-16 text-center">
        <ClipboardList class="mx-auto size-16 text-muted-foreground/50" />
        <h2 class="mt-4 text-lg font-semibold">{{ t.staff.templates.noTemplates }}</h2>
        <p class="mt-2 text-muted-foreground">
          {{
            search ? t.staff.templates.noTemplatesMatchSearch : t.staff.templates.noTemplatesDesc
          }}
        </p>
      </div>

      <DataTable v-else :columns="columns" :data="filteredTemplates" :on-row-click="openBuilder" />
    </template>

    <TemplateCreateDialog v-model:open="showCreateDialog" @created="handleCreated" />
    <GenerateTemplateDialog v-model:open="showGenerateDialog" @generated="handleCreated" />

    <Dialog v-model:open="showDeleteDialog">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{ t.staff.templates.deleteTitle }}</DialogTitle>
          <DialogDescription>{{
            t.staff.templates.deleteDesc(selectedTemplate?.title ?? '')
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
