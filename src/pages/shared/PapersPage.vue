<script setup lang="ts">
import { ref, h, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import type { ColumnDef } from '@tanstack/vue-table'
import { usePapersStore, type Paper } from '@/stores/papers'
import { useAuthStore } from '@/stores/auth'
import { useActiveClassroom } from '@/composables/useActiveClassroom'
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import PaperCreateDialog from '@/components/shared/PaperCreateDialog.vue'
import GeneratePaperDialog from '@/components/shared/GeneratePaperDialog.vue'
import { toast } from 'vue-sonner'
import { formatDate } from '@/lib/date'
import { useT } from '@/composables/useT'

/**
 * The paper library (decision 91). One page for both owners: an admin sees
 * the PLATFORM's papers and nothing else, a teacher sees their center's, with
 * the platform library beside it as a second tab to adopt from or deliver.
 *
 * A paper carries no grade+subject of its own — the items decide that — so
 * there is no scope column and nothing to pick when creating one. What the
 * items decide is what scopes the list: inside a classroom only papers that
 * cover its grade and subject are offered, which is also the rule
 * `deliver_paper` enforces. A paper with no items yet covers nothing, so it
 * stays visible until it holds one.
 */
const t = useT()
const router = useRouter()
const authStore = useAuthStore()
const papersStore = usePapersStore()
const { classroom, basePath } = useActiveClassroom()

/** A teacher browses a second library; an admin owns the only one there is. */
const showsPlatformLibrary = computed(() => !authStore.isAdmin)

const search = ref('')
const activeTab = ref<'own' | 'library'>('own')

/** Papers this classroom can actually take (every paper, outside a classroom). */
function coversClassroom(paper: Paper): boolean {
  const active = classroom.value
  if (!active) return true
  if (paper.pairings.length === 0) return true
  return paper.pairings.some(
    (pairing) =>
      pairing.gradeLevelId === active.gradeLevelId && pairing.subjectId === active.subjectId,
  )
}

function matches(items: Paper[]): Paper[] {
  const query = search.value.toLowerCase().trim()
  const scoped = items.filter(coversClassroom)
  if (!query) return scoped
  return scoped.filter(
    (item) =>
      item.title.toLowerCase().includes(query) ||
      (item.description ?? '').toLowerCase().includes(query),
  )
}

const filteredOwn = computed(() => matches(papersStore.ownPapers))
const emptyOwnDesc = computed(() =>
  classroom.value ? t.value.staff.papers.noPapersForClassDesc : t.value.staff.papers.noPapersDesc,
)
const filteredLibrary = computed(() => matches(papersStore.libraryPapers))

onMounted(async () => {
  const results = await Promise.all([
    papersStore.fetchOwnPapers(),
    showsPlatformLibrary.value
      ? papersStore.fetchLibraryPapers()
      : Promise.resolve({ error: null }),
  ])
  const failed = results.find((result) => result.error)
  if (failed?.error) toast.error(failed.error)
})

const paperPath = (id: string) =>
  authStore.isAdmin ? `/admin/papers/${id}` : `${basePath.value}/papers/${id}`

function openBuilder(item: Paper) {
  router.push(paperPath(item.id))
}

function handleCreated(id: string) {
  router.push(paperPath(id))
}

const showCreateDialog = ref(false)
const showGenerateDialog = ref(false)
const showDeleteDialog = ref(false)
const selectedPaper = ref<Paper | null>(null)
const isDeleting = ref(false)

function openDelete(item: Paper) {
  selectedPaper.value = item
  showDeleteDialog.value = true
}

async function handleDelete() {
  if (!selectedPaper.value) return
  isDeleting.value = true
  try {
    const { error } = await papersStore.deletePaper(selectedPaper.value.id)
    if (error) {
      toast.error(error)
      return
    }
    toast.success(t.value.staff.papers.toastDeleted)
    showDeleteDialog.value = false
    selectedPaper.value = null
  } finally {
    isDeleting.value = false
  }
}

function statusBadge(status: Paper['status']) {
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

const titleColumn: ColumnDef<Paper> = {
  accessorKey: 'title',
  header: ({ column }) =>
    h(
      Button,
      { variant: 'ghost', onClick: () => column.toggleSorting(column.getIsSorted() === 'asc') },
      () => [t.value.staff.assessments.titleCol, h(ArrowUpDown, { class: 'ml-2 size-4' })],
    ),
  cell: ({ row }) =>
    h(
      'div',
      { class: 'max-w-[20rem] truncate font-medium', title: row.original.title },
      row.original.title,
    ),
}

const itemsColumn: ColumnDef<Paper> = {
  accessorKey: 'itemCount',
  header: () => t.value.staff.assessments.questionsCol,
  cell: ({ row }) => h('div', {}, String(row.original.itemCount)),
}

const updatedColumn: ColumnDef<Paper> = {
  accessorKey: 'updatedAt',
  header: ({ column }) =>
    h(
      Button,
      { variant: 'ghost', onClick: () => column.toggleSorting(column.getIsSorted() === 'asc') },
      () => [t.value.staff.assessments.updatedCol, h(ArrowUpDown, { class: 'ml-2 size-4' })],
    ),
  cell: ({ row }) => h('div', {}, formatDate(row.original.updatedAt)),
}

/** Status only means something for a platform paper: it gates who sees it. */
const ownColumns = computed<ColumnDef<Paper>[]>(() => [
  titleColumn,
  ...(authStore.isAdmin
    ? [
        {
          accessorKey: 'status',
          header: () => t.value.staff.assessments.statusCol,
          cell: ({ row }) => statusBadge(row.original.status),
        } as ColumnDef<Paper>,
      ]
    : []),
  itemsColumn,
  updatedColumn,
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

const libraryColumns = computed<ColumnDef<Paper>[]>(() => [titleColumn, itemsColumn, updatedColumn])
</script>

<template>
  <div class="p-6">
    <div class="mb-6 flex items-center justify-end gap-2">
      <Button
        variant="outline"
        :disabled="papersStore.isLoading"
        @click="showGenerateDialog = true"
      >
        <Sparkles class="mr-2 size-4" />
        {{ t.staff.generate.btn }}
      </Button>
      <Button :disabled="papersStore.isLoading" @click="showCreateDialog = true">
        <Plus class="mr-2 size-4" />
        {{ t.staff.papers.createBtn }}
      </Button>
    </div>

    <div v-if="papersStore.isLoading" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <template v-else>
      <div class="mb-4">
        <div class="relative w-[400px] max-w-full">
          <Search class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input v-model="search" :placeholder="t.staff.papers.searchPlaceholder" class="pl-9" />
        </div>
      </div>

      <Tabs
        v-if="showsPlatformLibrary"
        :model-value="activeTab"
        @update:model-value="(value) => (activeTab = value === 'library' ? 'library' : 'own')"
      >
        <TabsList class="mb-4">
          <TabsTrigger value="own">{{ t.staff.papers.ourPapers }}</TabsTrigger>
          <TabsTrigger value="library">{{ t.staff.papers.platformLibrary }}</TabsTrigger>
        </TabsList>

        <TabsContent value="own">
          <div v-if="filteredOwn.length === 0" class="py-16 text-center">
            <ClipboardList class="mx-auto size-16 text-muted-foreground/50" />
            <h2 class="mt-4 text-lg font-semibold">{{ t.staff.papers.noPapers }}</h2>
            <p class="mt-2 text-muted-foreground">
              {{ search ? t.staff.papers.noPapersMatchSearch : emptyOwnDesc }}
            </p>
          </div>
          <DataTable v-else :columns="ownColumns" :data="filteredOwn" :on-row-click="openBuilder" />
        </TabsContent>

        <TabsContent value="library">
          <div v-if="filteredLibrary.length === 0" class="py-16 text-center">
            <ClipboardList class="mx-auto size-16 text-muted-foreground/50" />
            <h2 class="mt-4 text-lg font-semibold">{{ t.staff.papers.libraryEmpty }}</h2>
            <p class="mt-2 text-muted-foreground">
              {{ search ? t.staff.papers.noPapersMatchSearch : t.staff.papers.libraryEmptyDesc }}
            </p>
          </div>
          <DataTable
            v-else
            :columns="libraryColumns"
            :data="filteredLibrary"
            :on-row-click="openBuilder"
          />
        </TabsContent>
      </Tabs>

      <template v-else>
        <div v-if="filteredOwn.length === 0" class="py-16 text-center">
          <ClipboardList class="mx-auto size-16 text-muted-foreground/50" />
          <h2 class="mt-4 text-lg font-semibold">{{ t.staff.papers.noPapers }}</h2>
          <p class="mt-2 text-muted-foreground">
            {{ search ? t.staff.papers.noPapersMatchSearch : emptyOwnDesc }}
          </p>
        </div>
        <DataTable v-else :columns="ownColumns" :data="filteredOwn" :on-row-click="openBuilder" />
      </template>
    </template>

    <PaperCreateDialog v-model:open="showCreateDialog" @created="handleCreated" />
    <GeneratePaperDialog v-model:open="showGenerateDialog" @generated="handleCreated" />

    <Dialog v-model:open="showDeleteDialog">
      <DialogContent class="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{{ t.staff.papers.deleteTitle }}</DialogTitle>
          <DialogDescription>{{
            t.staff.papers.deleteDesc(selectedPaper?.title ?? '')
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
