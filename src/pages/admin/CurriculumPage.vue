<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useCurriculumStore } from '@/stores/curriculum'
import { curriculumEntityConfig, type CurriculumLevel } from '@/lib/curriculumEntityConfig'
import CurriculumAddDialog from '@/components/admin/CurriculumAddDialog.vue'
import CurriculumDeleteDialog from '@/components/admin/CurriculumDeleteDialog.vue'
import CurriculumTreeNode, {
  type CurriculumTreeItem,
} from '@/components/admin/CurriculumTreeNode.vue'
import SaveStatusPill from '@/components/shared/SaveStatusPill.vue'
import { Loader2, Plus } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { toast } from 'vue-sonner'
import { useAutosave } from '@/composables/useAutosave'
import { removeStorageObjects } from '@/lib/storage'
import { useT } from '@/composables/useT'

/**
 * The global curriculum setter (P19b): ONE tree over the trunk both products
 * share — grade level → subject → topic. It stops at the topic by design: a
 * topic's practice stages live on the practice bank page and its assessment
 * sub-topics on the assessment bank page, each next to the questions filed
 * under them.
 *
 * Everything is editable in place and saved in the background (decision 72b):
 * renames, reorders and cover images apply to the store immediately and
 * persist debounced, with the header pill as the only affordance. Adding and
 * deleting still use dialogs — one needs a name, the other a confirmation.
 */
const t = useT()
const curriculumStore = useCurriculumStore()

onMounted(async () => {
  await curriculumStore.fetchCurriculum()
})

const getCoverImageUrl = (path: string) => curriculumStore.getOptimizedImageUrl(path)

/**
 * The store's hierarchy as tree nodes. A topic is a leaf here; its counts say
 * what waits on the two bank pages.
 */
const treeNodes = computed<CurriculumTreeItem[]>(() =>
  curriculumStore.gradeLevels.map((gradeLevel) => ({
    id: gradeLevel.id,
    name: gradeLevel.name,
    level: 'grade' as CurriculumLevel,
    coverImagePath: null,
    description: t.value.admin.curriculum.subjectCount(gradeLevel.subjects.length),
    childLevel: 'subject' as CurriculumLevel,
    addChildLabel: t.value.admin.curriculum.addSubject,
    children: gradeLevel.subjects.map((subject) => ({
      id: subject.id,
      name: subject.name,
      level: 'subject' as CurriculumLevel,
      coverImagePath: subject.coverImagePath,
      description: t.value.admin.curriculum.topicCount(subject.topics.length),
      childLevel: 'topic' as CurriculumLevel,
      addChildLabel: t.value.admin.curriculum.addTopic,
      children: subject.topics.map((topic) => ({
        id: topic.id,
        name: topic.name,
        level: 'topic' as CurriculumLevel,
        coverImagePath: topic.coverImagePath,
        description: t.value.admin.curriculum.branchCount(
          topic.stages.length,
          topic.subTopics.length,
        ),
        childLevel: null,
        addChildLabel: null,
        children: null,
      })),
    })),
  })),
)

// ── add / delete dialogs ───────────────────────────────────────────────────

const showAddDialog = ref(false)
const addType = ref<CurriculumLevel>('grade')
const addDialogGradeLevelId = ref('')
const addDialogSubjectId = ref('')

function openAddDialog(level: CurriculumLevel, parentId: string) {
  addType.value = level
  addDialogGradeLevelId.value = level === 'subject' ? parentId : ''
  addDialogSubjectId.value = level === 'topic' ? parentId : ''
  showAddDialog.value = true
}

const showDeleteDialog = ref(false)
const deleteType = ref<CurriculumLevel>('grade')
const deleteItemName = ref('')
const deleteGradeLevelId = ref('')
const deleteSubjectId = ref('')
const deleteTopicId = ref('')

function openDeleteDialog(level: CurriculumLevel, id: string, name: string) {
  deleteType.value = level
  deleteItemName.value = name

  if (level === 'grade') {
    deleteGradeLevelId.value = id
    deleteSubjectId.value = ''
    deleteTopicId.value = ''
    showDeleteDialog.value = true
    return
  }

  if (level === 'subject') {
    const subject = curriculumStore.getSubjectById(id)
    if (!subject) return
    deleteGradeLevelId.value = subject.gradeLevelId
    deleteSubjectId.value = id
    deleteTopicId.value = ''
    showDeleteDialog.value = true
    return
  }

  const hierarchy = curriculumStore.getTopicWithHierarchy(id)
  if (!hierarchy) return
  deleteGradeLevelId.value = hierarchy.gradeLevel.id
  deleteSubjectId.value = hierarchy.subject.id
  deleteTopicId.value = id
  showDeleteDialog.value = true
}

// ── background autosave (decision 72b) ─────────────────────────────────────

const { status: saveStatus, enqueue: enqueueSave } = useAutosave({
  onError: (message) => toast.error(message),
})

function handleReorder(level: CurriculumLevel, parentId: string, orderedIds: string[]) {
  if (level === 'grade') {
    const previousIds = curriculumStore.applyGradeLevelOrder(orderedIds)
    if (!previousIds) return
    enqueueSave('grade-levels', orderedIds, {
      previous: previousIds,
      save: (ids) => curriculumStore.persistGradeLevelOrder(ids),
      rollback: (ids) => void curriculumStore.applyGradeLevelOrder(ids),
    })
    return
  }

  if (level === 'subject') {
    const previousIds = curriculumStore.applySubjectOrder(parentId, orderedIds)
    if (!previousIds) return
    enqueueSave(`subjects:${parentId}`, orderedIds, {
      previous: previousIds,
      save: (ids) => curriculumStore.persistSubjectOrder(parentId, ids),
      rollback: (ids) => void curriculumStore.applySubjectOrder(parentId, ids),
    })
    return
  }

  if (level === 'topic') {
    const subject = curriculumStore.getSubjectById(parentId)
    if (!subject) return
    const previousIds = curriculumStore.applyTopicOrder(subject.gradeLevelId, parentId, orderedIds)
    if (!previousIds) return
    enqueueSave(`topics:${parentId}`, orderedIds, {
      previous: previousIds,
      save: (ids) => curriculumStore.persistTopicOrder(parentId, ids),
      rollback: (ids) => void curriculumStore.applyTopicOrder(subject.gradeLevelId, parentId, ids),
    })
  }
}

/** The ids a store write for this row needs (the levels above it). */
function idsFor(level: CurriculumLevel, id: string) {
  const base = { gradeLevelId: '', subjectId: '', topicId: '', stageId: '', subTopicId: '' }
  if (level === 'grade') return { ...base, gradeLevelId: id }
  if (level === 'subject') {
    const subject = curriculumStore.getSubjectById(id)
    return { ...base, gradeLevelId: subject?.gradeLevelId ?? '', subjectId: id }
  }
  const hierarchy = curriculumStore.getTopicWithHierarchy(id)
  return {
    ...base,
    gradeLevelId: hierarchy?.gradeLevel.id ?? '',
    subjectId: hierarchy?.subject.id ?? '',
    topicId: id,
  }
}

function handleRename(level: CurriculumLevel, id: string, name: string) {
  // Mutate the store's own node — the tree renders from it, so the edit shows
  // instantly and a failed save rolls the same object back.
  const item =
    level === 'grade'
      ? (curriculumStore.getGradeLevelById(id) ?? null)
      : level === 'subject'
        ? (curriculumStore.getSubjectById(id) ?? null)
        : (curriculumStore.getTopicById(id) ?? null)
  if (!item) return

  const previous = item.name
  if (name === previous) return
  item.name = name
  const ids = idsFor(level, id)
  enqueueSave(`name:${id}`, name, {
    previous,
    save: (value) => curriculumEntityConfig[level].updateName(curriculumStore, ids, value),
    rollback: (confirmed) => {
      item.name = confirmed
    },
  })
}

// ── cover images (decision 78: delete the replaced object once saved) ──────

const uploadingImageId = ref<string | null>(null)
const pendingCoverDeletes = new Map<string, Set<string>>()

function queueCoverDelete(itemId: string, path: string) {
  let pending = pendingCoverDeletes.get(itemId)
  if (!pending) {
    pending = new Set()
    pendingCoverDeletes.set(itemId, pending)
  }
  pending.add(path)
}

function flushCoverDeletes(itemId: string, savedPath: string | null) {
  const pending = pendingCoverDeletes.get(itemId)
  if (!pending) return
  const removable = [...pending].filter((path) => path !== savedPath)
  for (const path of removable) pending.delete(path)
  void removeStorageObjects('curriculum-images', removable)
}

function enqueueCoverImageSave(
  level: CurriculumLevel,
  item: { id: string; coverImagePath: string | null },
  previous: string | null,
  path: string | null,
) {
  item.coverImagePath = path
  if (previous) queueCoverDelete(item.id, previous)
  const ids = idsFor(level, item.id)
  enqueueSave(`image:${item.id}`, path, {
    previous,
    save: async (value) => {
      const result = await curriculumEntityConfig[level].updateCoverImage(
        curriculumStore,
        ids,
        value,
      )
      if (!result.error) flushCoverDeletes(item.id, value)
      return result
    },
    rollback: (confirmed) => {
      pendingCoverDeletes.delete(item.id)
      item.coverImagePath = confirmed
    },
  })
}

async function handleImageSelected(level: CurriculumLevel, id: string, file: File) {
  const imageType = curriculumEntityConfig[level].imageType
  const item =
    level === 'subject' ? curriculumStore.getSubjectById(id) : curriculumStore.getTopicById(id)
  if (!item || !imageType) return

  const previous = item.coverImagePath
  uploadingImageId.value = id
  const result = await curriculumStore.uploadCurriculumImage(file, imageType)
  uploadingImageId.value = null
  if (result.error || !result.path) {
    toast.error(result.error ?? '')
    return
  }
  enqueueCoverImageSave(level, item, previous, result.path)
}

function handleImageRemoved(level: CurriculumLevel, id: string) {
  const item =
    level === 'subject' ? curriculumStore.getSubjectById(id) : curriculumStore.getTopicById(id)
  if (!item?.coverImagePath) return
  enqueueCoverImageSave(level, item, item.coverImagePath, null)
}
</script>

<template>
  <div class="p-6">
    <!-- The page name lives in the header breadcrumb (decision 84); only
         the save state needs a home here. -->
    <div class="mb-6 flex items-start justify-between gap-4">
      <p class="max-w-xl text-sm text-muted-foreground">
        {{ t.admin.curriculum.subtitle }}
      </p>
      <SaveStatusPill :status="saveStatus" />
    </div>

    <div v-if="curriculumStore.isLoading" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <div
      v-else-if="treeNodes.length === 0"
      class="rounded-lg border border-dashed p-12 text-center"
    >
      <div class="mx-auto flex size-12 items-center justify-center rounded-full bg-muted">
        <Plus class="size-6 text-muted-foreground" />
      </div>
      <h3 class="mt-4 text-lg font-medium">{{ t.admin.curriculum.noGradeLevels }}</h3>
      <p class="mt-2 text-sm text-muted-foreground">
        {{ t.admin.curriculum.noGradeLevelsDesc }}
      </p>
      <Button class="mt-4" @click="openAddDialog('grade', '')">
        <Plus class="mr-2 size-4" />
        {{ t.admin.curriculum.addGradeLevel }}
      </Button>
    </div>

    <div v-else class="rounded-lg border bg-card p-2">
      <CurriculumTreeNode
        :nodes="treeNodes"
        parent-id=""
        :depth="0"
        :is-expanded="curriculumStore.isAdminCurriculumExpanded"
        :get-cover-image-url="getCoverImageUrl"
        :uploading-image-id="uploadingImageId"
        @toggle="curriculumStore.toggleAdminCurriculumExpanded"
        @rename="handleRename"
        @reorder="handleReorder"
        @add="openAddDialog"
        @delete="openDeleteDialog"
        @image-selected="handleImageSelected"
        @image-removed="handleImageRemoved"
      />

      <div class="px-2 pb-1 pt-2">
        <Button
          variant="ghost"
          size="sm"
          class="text-muted-foreground"
          @click="openAddDialog('grade', '')"
        >
          <Plus class="mr-2 size-4" />
          {{ t.admin.curriculum.addGradeLevel }}
        </Button>
      </div>
    </div>

    <CurriculumAddDialog
      v-model:open="showAddDialog"
      :add-type="addType"
      :grade-level-id="addDialogGradeLevelId"
      :subject-id="addDialogSubjectId"
      topic-id=""
    />

    <CurriculumDeleteDialog
      v-model:open="showDeleteDialog"
      :delete-type="deleteType"
      :item-name="deleteItemName"
      :grade-level-id="deleteGradeLevelId"
      :subject-id="deleteSubjectId"
      :topic-id="deleteTopicId"
      stage-id=""
      sub-topic-id=""
    />
  </div>
</template>
