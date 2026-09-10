<script setup lang="ts">
import { ref, h, computed, onMounted } from 'vue'
import type { ColumnDef } from '@tanstack/vue-table'
import { useTagsStore, normalizeTagName, type Tag } from '@/stores/tags'
import { useCurriculumStore } from '@/stores/curriculum'
import {
  AlertTriangle,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Tags,
  Trash2,
} from 'lucide-vue-next'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { DataTable } from '@/components/ui/data-table'
import { Field, FieldLabel, FieldDescription, FieldError } from '@/components/ui/field'
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
import CurriculumMultiSelect, {
  type CurriculumMultiSelectGroup,
} from '@/components/shared/CurriculumMultiSelect.vue'
import { toast } from 'vue-sonner'
import { formatDate } from '@/lib/date'
import { useT } from '@/composables/useT'

/**
 * Admin management of the global learning-point tag library (decision 57).
 * Each tag names ONE learning point and is reused across questions; names
 * are stored normalized (lowercased + trimmed).
 *
 * A tag is also SCOPED to the topics it applies to (P19a): the topic is the
 * level practice and assessment share, so one scope serves both pickers. A
 * tag scoped to nothing is offered nowhere — the table flags those.
 */
const t = useT()
const tagsStore = useTagsStore()
const curriculumStore = useCurriculumStore()

const search = ref('')

const showFormDialog = ref(false)
const showDeleteDialog = ref(false)
const editingTag = ref<Tag | null>(null)
const selectedTag = ref<Tag | null>(null)
const tagName = ref('')
const tagTopicIds = ref<string[]>([])
const formError = ref<string | null>(null)
const isSaving = ref(false)
const isDeleting = ref(false)

onMounted(async () => {
  const [{ error }] = await Promise.all([
    tagsStore.fetchTags(),
    curriculumStore.gradeLevels.length === 0 ? curriculumStore.fetchCurriculum() : null,
  ])
  if (error) toast.error(error)
})

/**
 * Every topic in the curriculum, grouped by where it sits, so the picker
 * reads "Year 4 · Mathematics" over its topics.
 */
const topicGroups = computed<CurriculumMultiSelectGroup[]>(() =>
  curriculumStore.gradeLevels.flatMap((gradeLevel) =>
    gradeLevel.subjects.map((subject) => ({
      label: `${gradeLevel.name} · ${subject.name}`,
      items: subject.topics.map((topic) => ({ id: topic.id, name: topic.name })),
    })),
  ),
)

/** Topic id → its name, for the table's scope column. */
const topicNames = computed(() => {
  const names = new Map<string, string>()
  for (const group of topicGroups.value) {
    for (const topic of group.items) names.set(topic.id, topic.name)
  }
  return names
})

const filteredTags = computed(() => {
  const query = normalizeTagName(search.value)
  if (!query) return tagsStore.tags
  return tagsStore.tags.filter((tag) => tag.name.includes(query))
})

function openCreate() {
  editingTag.value = null
  tagName.value = ''
  tagTopicIds.value = []
  formError.value = null
  showFormDialog.value = true
}

function openEdit(tag: Tag) {
  editingTag.value = tag
  tagName.value = tag.name
  tagTopicIds.value = [...tag.topicIds]
  formError.value = null
  showFormDialog.value = true
}

function openDelete(tag: Tag) {
  selectedTag.value = tag
  showDeleteDialog.value = true
}

async function handleSave() {
  const normalized = normalizeTagName(tagName.value)
  if (!normalized) {
    formError.value = t.value.admin.tags.validationName
    return
  }
  const duplicate = tagsStore.tags.some(
    (tag) => tag.name === normalized && tag.id !== editingTag.value?.id,
  )
  if (duplicate) {
    formError.value = t.value.admin.tags.validationDuplicate
    return
  }
  if (tagTopicIds.value.length === 0) {
    formError.value = t.value.admin.tags.validationTopics
    return
  }
  formError.value = null

  isSaving.value = true
  try {
    if (editingTag.value) {
      const { error } = await tagsStore.renameTag(editingTag.value.id, normalized)
      if (error) {
        toast.error(error)
        return
      }
      const { error: scopeError } = await tagsStore.setTagTopics(
        editingTag.value.id,
        tagTopicIds.value,
      )
      if (scopeError) {
        toast.error(scopeError)
        return
      }
      toast.success(t.value.admin.tags.toastSaved)
    } else {
      const { error } = await tagsStore.createTag(normalized, tagTopicIds.value)
      if (error) {
        toast.error(error)
        return
      }
      toast.success(t.value.admin.tags.toastCreated)
    }
    showFormDialog.value = false
  } finally {
    isSaving.value = false
  }
}

async function handleDelete() {
  if (!selectedTag.value) return

  isDeleting.value = true
  try {
    const { error } = await tagsStore.deleteTag(selectedTag.value.id)
    if (error) {
      toast.error(error)
      return
    }
    toast.success(t.value.admin.tags.toastDeleted)
    showDeleteDialog.value = false
    selectedTag.value = null
  } finally {
    isDeleting.value = false
  }
}

const columns = computed<ColumnDef<Tag>[]>(() => [
  {
    accessorKey: 'name',
    header: () => t.value.admin.tags.nameCol,
    cell: ({ row }) => h(Badge, { variant: 'secondary' }, () => row.original.name),
  },
  {
    id: 'topics',
    header: () => t.value.admin.tags.topicsCol,
    cell: ({ row }) => {
      const ids = row.original.topicIds
      if (ids.length === 0) {
        return h('div', { class: 'flex items-center gap-1.5 text-sm text-destructive' }, [
          h(AlertTriangle, { class: 'size-4 shrink-0' }),
          t.value.admin.tags.noTopicsWarning,
        ])
      }
      return h(
        'div',
        { class: 'flex flex-wrap gap-1' },
        ids.map((id) =>
          h(Badge, { key: id, variant: 'outline' }, () => topicNames.value.get(id) ?? id),
        ),
      )
    },
  },
  {
    accessorKey: 'questionCount',
    header: () => t.value.admin.tags.questionsCol,
    cell: ({ row }) => h('div', {}, String(row.original.questionCount)),
  },
  {
    accessorKey: 'createdAt',
    header: () => t.value.admin.tags.createdCol,
    cell: ({ row }) => h('div', {}, formatDate(row.original.createdAt)),
  },
  {
    id: 'actions',
    cell: ({ row }) => {
      const tag = row.original
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
                    openEdit(tag)
                  },
                },
                () => [h(Pencil, { class: 'mr-2 size-4' }), t.value.admin.tags.edit],
              ),
              h(
                DropdownMenuItem,
                {
                  class: 'text-destructive focus:text-destructive',
                  onClick: (event: Event) => {
                    event.stopPropagation()
                    openDelete(tag)
                  },
                },
                () => [h(Trash2, { class: 'mr-2 size-4' }), t.value.admin.tags.delete],
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
    <div class="mb-6 flex items-center justify-end">
      <Button :disabled="tagsStore.isLoading" @click="openCreate">
        <Plus class="mr-2 size-4" />
        {{ t.admin.tags.addTagBtn }}
      </Button>
    </div>

    <!-- Loading State -->
    <div v-if="tagsStore.isLoading" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <template v-else>
      <!-- Search Bar -->
      <div class="mb-4">
        <div class="relative w-[300px]">
          <Search class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input v-model="search" :placeholder="t.admin.tags.searchPlaceholder" class="pl-9" />
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="filteredTags.length === 0" class="py-16 text-center">
        <Tags class="mx-auto size-16 text-muted-foreground/50" />
        <h2 class="mt-4 text-lg font-semibold">{{ t.admin.tags.noTags }}</h2>
        <p class="mt-2 text-muted-foreground">
          {{ search ? t.admin.tags.noTagsMatchSearch : t.admin.tags.noTagsDesc }}
        </p>
      </div>

      <!-- Data Table -->
      <DataTable v-else :columns="columns" :data="filteredTags" />
    </template>

    <!-- Create / edit dialog -->
    <Dialog v-model:open="showFormDialog">
      <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{{
            editingTag ? t.admin.tags.editTitle : t.admin.tags.createTitle
          }}</DialogTitle>
          <DialogDescription>{{
            editingTag ? t.admin.tags.editDesc : t.admin.tags.createDesc
          }}</DialogDescription>
        </DialogHeader>

        <form class="space-y-4 py-4" @submit.prevent="handleSave">
          <Field :data-invalid="!!formError">
            <FieldLabel for="tag-name"
              >{{ t.admin.tags.nameLabel }} <span class="text-destructive">*</span></FieldLabel
            >
            <Input
              id="tag-name"
              v-model="tagName"
              :placeholder="t.admin.tags.namePlaceholder"
              :disabled="isSaving"
              :aria-invalid="!!formError"
            />
            <FieldDescription>{{ t.admin.tags.nameHint }}</FieldDescription>
          </Field>

          <Field>
            <FieldLabel
              >{{ t.admin.tags.topicsLabel }} <span class="text-destructive">*</span></FieldLabel
            >
            <CurriculumMultiSelect
              v-model="tagTopicIds"
              :groups="topicGroups"
              :disabled="isSaving"
              :add-label="t.admin.tags.addTopic"
            />
            <FieldDescription>{{ t.admin.tags.topicsHint }}</FieldDescription>
          </Field>

          <FieldError :errors="formError ? [formError] : []" />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              :disabled="isSaving"
              @click="showFormDialog = false"
            >
              {{ t.admin.tags.cancel }}
            </Button>
            <Button type="submit" :disabled="isSaving">
              <Loader2 v-if="isSaving" class="mr-2 size-4 animate-spin" />
              {{ editingTag ? t.admin.tags.save : t.admin.tags.create }}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <!-- Delete confirmation -->
    <Dialog v-model:open="showDeleteDialog">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{ t.admin.tags.deleteTitle }}</DialogTitle>
          <DialogDescription>{{
            t.admin.tags.deleteDesc(selectedTag?.name ?? '', selectedTag?.questionCount ?? 0)
          }}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" :disabled="isDeleting" @click="showDeleteDialog = false">
            {{ t.admin.tags.cancel }}
          </Button>
          <Button variant="destructive" :disabled="isDeleting" @click="handleDelete">
            <Loader2 v-if="isDeleting" class="mr-2 size-4 animate-spin" />
            {{ t.admin.tags.deleteConfirm }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
