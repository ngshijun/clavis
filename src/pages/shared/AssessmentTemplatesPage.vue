<script setup lang="ts">
import { ref, h, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import type { ColumnDef } from '@tanstack/vue-table'
import { useAssessmentsStore, type AssessmentListItem } from '@/stores/assessments'
import { useAuthStore } from '@/stores/auth'
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

/**
 * Staff (manager/teacher) template library: platform templates are strictly
 * READ-ONLY here — no edit, assign, publish or delete affordances exist for
 * a raw template anywhere (the DB blocks those writes too). "Use Template"
 * clones the template into the caller's org as a normal editable draft that
 * then flows through the ordinary builder/assign path.
 */
const t = useT()
const router = useRouter()
const authStore = useAuthStore()
const assessmentsStore = useAssessmentsStore()

const basePath = computed(() => `/${authStore.userType}`)

const search = ref('')

const filteredTemplates = computed(() => {
  const query = search.value.toLowerCase().trim()
  if (!query) return assessmentsStore.templates
  return assessmentsStore.templates.filter(
    (item) =>
      item.title.toLowerCase().includes(query) ||
      (item.description ?? '').toLowerCase().includes(query),
  )
})

onMounted(async () => {
  const { error } = await assessmentsStore.fetchTemplates()
  if (error) {
    toast.error(t.value.staff.assessments.toastTemplatesLoadFailed)
  }
})

function openPreview(item: AssessmentListItem) {
  router.push(`${basePath.value}/assessments/${item.id}`)
}

// "Use template" confirmation (the copy explains the clone semantics)
const showUseDialog = ref(false)
const selectedTemplate = ref<AssessmentListItem | null>(null)
const isCloning = ref(false)

function openUseTemplate(item: AssessmentListItem) {
  selectedTemplate.value = item
  showUseDialog.value = true
}

async function handleUseTemplate() {
  if (!selectedTemplate.value) return

  isCloning.value = true
  try {
    const { id, error } = await assessmentsStore.cloneTemplate(selectedTemplate.value.id)
    if (error || !id) {
      toast.error(error ?? t.value.shared.errors.failedCloneTemplate)
      return
    }
    toast.success(t.value.staff.assessments.toastCloned)
    showUseDialog.value = false
    router.push(`${basePath.value}/assessments/${id}`)
  } finally {
    isCloning.value = false
  }
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
        { class: 'max-w-[16rem] truncate font-medium', title: row.original.title },
        row.original.title,
      ),
  },
  {
    // The grade+subject pairing a template is scoped to: it explains why the
    // template is visible here (a matching classroom exists) and what a clone
    // will be locked to when assigning.
    id: 'scope',
    accessorFn: (row: AssessmentListItem) => `${row.gradeLevelName ?? ''} ${row.subjectName ?? ''}`,
    header: () => t.value.staff.assessments.scopeCol,
    cell: ({ row }) =>
      h(
        'div',
        { class: 'text-muted-foreground' },
        row.original.gradeLevelName && row.original.subjectName
          ? `${row.original.gradeLevelName} · ${row.original.subjectName}`
          : '—',
      ),
  },
  {
    accessorKey: 'description',
    header: () => t.value.staff.assessments.descriptionCol,
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
          () => [h(Eye, { class: 'mr-2 size-4' }), t.value.staff.assessments.previewAction],
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
          () => [h(Copy, { class: 'mr-2 size-4' }), t.value.staff.assessments.useTemplate],
        ),
      ])
    },
  },
])
</script>

<template>
  <div class="p-6">
    <div class="mb-6">
      <h1 class="text-2xl font-bold">{{ t.staff.assessments.libraryTitle }}</h1>
      <p class="text-muted-foreground">{{ t.staff.assessments.librarySubtitle }}</p>
    </div>

    <!-- Loading State -->
    <div v-if="assessmentsStore.isLoadingTemplates" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <template v-else>
      <!-- Search Bar -->
      <div class="mb-4">
        <div class="relative w-[400px]">
          <Search class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            v-model="search"
            :placeholder="t.staff.assessments.searchTemplatesPlaceholder"
            class="pl-9"
          />
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="filteredTemplates.length === 0" class="py-16 text-center">
        <Library class="mx-auto size-16 text-muted-foreground/50" />
        <h2 class="mt-4 text-lg font-semibold">{{ t.staff.assessments.libraryEmpty }}</h2>
        <p class="mt-2 text-muted-foreground">
          {{
            search
              ? t.staff.assessments.noTemplatesMatchSearch
              : t.staff.assessments.libraryEmptyDesc
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
          <DialogTitle>{{ t.staff.assessments.useTemplateTitle }}</DialogTitle>
          <DialogDescription>{{
            t.staff.assessments.useTemplateDesc(selectedTemplate?.title ?? '')
          }}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" :disabled="isCloning" @click="showUseDialog = false">
            {{ t.staff.assessments.cancel }}
          </Button>
          <Button :disabled="isCloning" @click="handleUseTemplate">
            <Loader2 v-if="isCloning" class="mr-2 size-4 animate-spin" />
            {{ t.staff.assessments.useTemplateConfirm }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
