<script setup lang="ts">
import { ref, h, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import type { ColumnDef } from '@tanstack/vue-table'
import { useAssessmentTemplatesStore, type AssessmentTemplate } from '@/stores/assessment-templates'
import { ArrowUpDown, Copy, Eye, Library, Loader2, Search } from 'lucide-vue-next'
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
import { toast } from 'vue-sonner'
import { useT } from '@/composables/useT'
import { useActiveClassroom } from '@/composables/useActiveClassroom'

/**
 * A teacher's template library: published admin templates are strictly
 * READ-ONLY here (the DB blocks every write). "Use Template" clones one into
 * the classroom in the URL as a normal editable draft — a copy of each bank
 * question, so nothing the admin edits later reaches it.
 */
const t = useT()
const router = useRouter()
const templatesStore = useAssessmentTemplatesStore()
const { classroomId, classroom, basePath } = useActiveClassroom()

const search = ref('')

/**
 * Only templates the classroom in the URL can actually take (decision 81).
 * Cloning targets that classroom and the RPC rejects a mismatched grade or
 * subject, so offering the rest would be a row whose only action fails.
 */
const scopedTemplates = computed(() => {
  const active = classroom.value
  if (!active) return []
  return templatesStore.templates.filter(
    (item) => item.gradeLevelId === active.gradeLevelId && item.subjectId === active.subjectId,
  )
})

const filteredTemplates = computed(() => {
  const query = search.value.toLowerCase().trim()
  if (!query) return scopedTemplates.value
  return scopedTemplates.value.filter(
    (item) =>
      item.title.toLowerCase().includes(query) ||
      (item.description ?? '').toLowerCase().includes(query),
  )
})

onMounted(async () => {
  const { error } = await templatesStore.fetchTemplates()
  if (error) {
    toast.error(t.value.staff.templates.toastLoadFailed)
  }
})

function openPreview(item: AssessmentTemplate) {
  router.push(`${basePath.value}/templates/${item.id}`)
}

// "Use template" confirmation (the copy explains the clone semantics)
const showUseDialog = ref(false)
const selectedTemplate = ref<AssessmentTemplate | null>(null)
const isCloning = ref(false)

function openUseTemplate(item: AssessmentTemplate) {
  selectedTemplate.value = item
  showUseDialog.value = true
}

async function handleUseTemplate() {
  if (!selectedTemplate.value) return

  isCloning.value = true
  try {
    const targetClassroomId = classroomId.value
    if (!targetClassroomId) {
      toast.error(t.value.shared.errors.failedCloneTemplate)
      return
    }
    const { id, error } = await templatesStore.cloneTemplate(
      selectedTemplate.value.id,
      targetClassroomId,
    )
    if (error || !id) {
      toast.error(error ?? t.value.shared.errors.failedCloneTemplate)
      return
    }
    toast.success(t.value.staff.templates.toastCloned)
    showUseDialog.value = false
    router.push(`${basePath.value}/assessments/${id}`)
  } finally {
    isCloning.value = false
  }
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
        { class: 'max-w-[16rem] truncate font-medium', title: row.original.title },
        row.original.title,
      ),
  },
  {
    accessorKey: 'description',
    header: () => t.value.staff.templates.descriptionCol,
    cell: ({ row }) =>
      h(
        'div',
        {
          class: 'max-w-[24rem] truncate text-muted-foreground',
          title: row.original.description ?? '',
        },
        row.original.description ?? '—',
      ),
  },
  {
    accessorKey: 'questionCount',
    header: () => t.value.staff.assessments.questionsCol,
    cell: ({ row }) => h('div', {}, String(row.original.questionCount)),
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const item = row.original
      return h('div', { class: 'flex items-center justify-end gap-2' }, [
        h(
          Button,
          {
            variant: 'outline',
            size: 'sm',
            onClick: (event: Event) => {
              event.stopPropagation()
              openPreview(item)
            },
          },
          () => [h(Eye, { class: 'mr-2 size-4' }), t.value.staff.templates.previewAction],
        ),
        h(
          Button,
          {
            size: 'sm',
            onClick: (event: Event) => {
              event.stopPropagation()
              openUseTemplate(item)
            },
          },
          () => [h(Copy, { class: 'mr-2 size-4' }), t.value.staff.templates.useTemplate],
        ),
      ])
    },
  },
])
</script>

<template>
  <div class="p-6">
    <!-- Loading State -->
    <div v-if="templatesStore.isLoading" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <template v-else>
      <!-- Search Bar -->
      <div class="mb-4">
        <div class="relative w-[400px]">
          <Search class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input v-model="search" :placeholder="t.staff.templates.searchPlaceholder" class="pl-9" />
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="filteredTemplates.length === 0" class="py-16 text-center">
        <Library class="mx-auto size-16 text-muted-foreground/50" />
        <h2 class="mt-4 text-lg font-semibold">{{ t.staff.templates.libraryEmpty }}</h2>
        <p class="mt-2 text-muted-foreground">
          {{
            search ? t.staff.templates.noTemplatesMatchSearch : t.staff.templates.libraryEmptyDesc
          }}
        </p>
      </div>

      <!-- Data Table -->
      <DataTable v-else :columns="columns" :data="filteredTemplates" :on-row-click="openPreview" />
    </template>

    <!-- Use template confirmation -->
    <Dialog v-model:open="showUseDialog">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{ t.staff.templates.useTemplateTitle }}</DialogTitle>
          <DialogDescription>{{
            t.staff.templates.useTemplateDesc(selectedTemplate?.title ?? '')
          }}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" :disabled="isCloning" @click="showUseDialog = false">
            {{ t.staff.assessments.cancel }}
          </Button>
          <Button :disabled="isCloning" @click="handleUseTemplate">
            <Loader2 v-if="isCloning" class="mr-2 size-4 animate-spin" />
            {{ t.staff.templates.useTemplateConfirm }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
