<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useCurriculumStore } from '@/stores/curriculum'
import {
  curriculumEntityConfig,
  type CurriculumIds,
  type CurriculumLevel,
} from '@/lib/curriculumEntityConfig'
import CurriculumAddDialog from '@/components/admin/CurriculumAddDialog.vue'
import CurriculumDeleteDialog from '@/components/admin/CurriculumDeleteDialog.vue'
import CurriculumItemList from '@/components/admin/CurriculumItemList.vue'
import SubTopicQuestionsPanel from '@/components/admin/SubTopicQuestionsPanel.vue'
import SaveStatusPill from '@/components/shared/SaveStatusPill.vue'
import { Loader2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import { useAutosave } from '@/composables/useAutosave'
import { removeStorageObjects } from '@/lib/storage'
import { useT } from '@/composables/useT'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

const t = useT()
const curriculumStore = useCurriculumStore()

// Navigation state (from store for persistence)
const selectedGradeLevelId = computed({
  get: () => curriculumStore.adminCurriculumNavigation.selectedGradeLevelId,
  set: (val) => curriculumStore.setAdminCurriculumGradeLevel(val),
})
const selectedSubjectId = computed({
  get: () => curriculumStore.adminCurriculumNavigation.selectedSubjectId,
  set: (val) => curriculumStore.setAdminCurriculumSubject(val),
})
const selectedTopicId = computed({
  get: () => curriculumStore.adminCurriculumNavigation.selectedTopicId,
  set: (val) => curriculumStore.setAdminCurriculumTopic(val),
})
const selectedSubTopicId = computed({
  get: () => curriculumStore.adminCurriculumNavigation.selectedSubTopicId,
  set: (val) => curriculumStore.setAdminCurriculumSubTopic(val),
})

// Computed for navigation
const selectedGradeLevel = computed(() => {
  if (!selectedGradeLevelId.value) return null
  return curriculumStore.gradeLevels.find((g) => g.id === selectedGradeLevelId.value) ?? null
})

const selectedSubject = computed(() => {
  if (!selectedGradeLevel.value || !selectedSubjectId.value) return null
  return selectedGradeLevel.value.subjects.find((s) => s.id === selectedSubjectId.value) ?? null
})

const selectedTopic = computed(() => {
  if (!selectedSubject.value || !selectedTopicId.value) return null
  return selectedSubject.value.topics.find((t) => t.id === selectedTopicId.value) ?? null
})

const selectedSubTopic = computed(() => {
  if (!selectedTopic.value || !selectedSubTopicId.value) return null
  return selectedTopic.value.subTopics.find((st) => st.id === selectedSubTopicId.value) ?? null
})

function getImageUrl(coverImagePath: string | null): string {
  if (!coverImagePath) return ''
  if (coverImagePath.startsWith('http')) {
    return coverImagePath
  }
  return curriculumStore.getOptimizedImageUrl(coverImagePath)
}

// Fetch curriculum on mount
onMounted(async () => {
  await curriculumStore.fetchCurriculum()
})

/** The one expanded (in-place editor) row of the visible level list. */
const expandedId = ref<string | null>(null)

// Navigation functions (any navigation collapses the open editor)
function selectGradeLevel(gradeLevelId: string) {
  selectedGradeLevelId.value = gradeLevelId
  selectedSubjectId.value = null
  selectedTopicId.value = null
  selectedSubTopicId.value = null
  expandedId.value = null
}

function selectSubject(subjectId: string) {
  selectedSubjectId.value = subjectId
  selectedTopicId.value = null
  selectedSubTopicId.value = null
  expandedId.value = null
}

function selectTopic(topicId: string) {
  selectedTopicId.value = topicId
  selectedSubTopicId.value = null
  expandedId.value = null
}

function selectSubTopic(subTopicId: string) {
  selectedSubTopicId.value = subTopicId
  expandedId.value = null
}

function goBackToGradeLevels() {
  selectedGradeLevelId.value = null
  selectedSubjectId.value = null
  selectedTopicId.value = null
  selectedSubTopicId.value = null
  expandedId.value = null
}

function goBackToSubjects() {
  selectedSubjectId.value = null
  selectedTopicId.value = null
  selectedSubTopicId.value = null
  expandedId.value = null
}

function goBackToTopics() {
  selectedTopicId.value = null
  selectedSubTopicId.value = null
  expandedId.value = null
}

function goBackToSubTopics() {
  selectedSubTopicId.value = null
  expandedId.value = null
}

// Add dialog state
const showAddDialog = ref(false)
const addType = ref<CurriculumLevel>('grade')
const addDialogGradeLevelId = ref('')
const addDialogSubjectId = ref('')
const addDialogTopicId = ref('')

function openAddDialog(type: CurriculumLevel) {
  addType.value = type
  addDialogGradeLevelId.value = selectedGradeLevelId.value ?? ''
  addDialogSubjectId.value = selectedSubjectId.value ?? ''
  addDialogTopicId.value = selectedTopicId.value ?? ''
  showAddDialog.value = true
}

// Delete dialog state
const showDeleteDialog = ref(false)
const deleteType = ref<CurriculumLevel>('grade')
const deleteItemName = ref('')
const deleteGradeLevelId = ref('')
const deleteSubjectId = ref('')
const deleteTopicId = ref('')
const deleteSubTopicId = ref('')

function openDeleteDialog(
  type: CurriculumLevel,
  itemName: string,
  gradeLevelId: string,
  subjectId?: string,
  topicId?: string,
  subTopicId?: string,
) {
  deleteType.value = type
  deleteItemName.value = itemName
  deleteGradeLevelId.value = gradeLevelId
  deleteSubjectId.value = subjectId ?? ''
  deleteTopicId.value = topicId ?? ''
  deleteSubTopicId.value = subTopicId ?? ''
  showDeleteDialog.value = true
}

function handleDeleted(type: CurriculumLevel, ids: { subjectId: string; topicId: string }) {
  if (type === 'subject' && selectedSubjectId.value === ids.subjectId) {
    selectedSubjectId.value = null
    selectedTopicId.value = null
  }
  if (type === 'topic' && selectedTopicId.value === ids.topicId) {
    selectedTopicId.value = null
  }
}

// Background autosave (decision 72b, extended by P10c): reorders, renames
// and cover-image changes all apply instantly in the store and persist
// debounced/coalesced in the background — the pill in the header is the only
// affordance. Keys isolate independent saves so they never cross-coalesce.
const { status: saveStatus, enqueue: enqueueSave } = useAutosave({
  onError: (message) => toast.error(message),
})

function handleReorderGradeLevels(orderedIds: string[]) {
  const previousIds = curriculumStore.applyGradeLevelOrder(orderedIds)
  if (!previousIds) return
  enqueueSave('grade-levels', orderedIds, {
    previous: previousIds,
    save: (ids) => curriculumStore.persistGradeLevelOrder(ids),
    rollback: (ids) => void curriculumStore.applyGradeLevelOrder(ids),
  })
}

function handleReorderSubjects(orderedIds: string[]) {
  if (!selectedGradeLevel.value) return
  const gradeLevelId = selectedGradeLevel.value.id
  const previousIds = curriculumStore.applySubjectOrder(gradeLevelId, orderedIds)
  if (!previousIds) return
  enqueueSave(`subjects:${gradeLevelId}`, orderedIds, {
    previous: previousIds,
    save: (ids) => curriculumStore.persistSubjectOrder(gradeLevelId, ids),
    rollback: (ids) => void curriculumStore.applySubjectOrder(gradeLevelId, ids),
  })
}

function handleReorderTopics(orderedIds: string[]) {
  if (!selectedGradeLevel.value || !selectedSubject.value) return
  const gradeLevelId = selectedGradeLevel.value.id
  const subjectId = selectedSubject.value.id
  const previousIds = curriculumStore.applyTopicOrder(gradeLevelId, subjectId, orderedIds)
  if (!previousIds) return
  enqueueSave(`topics:${subjectId}`, orderedIds, {
    previous: previousIds,
    save: (ids) => curriculumStore.persistTopicOrder(subjectId, ids),
    rollback: (ids) => void curriculumStore.applyTopicOrder(gradeLevelId, subjectId, ids),
  })
}

function handleReorderSubTopics(orderedIds: string[]) {
  if (!selectedGradeLevel.value || !selectedSubject.value || !selectedTopic.value) return
  const gradeLevelId = selectedGradeLevel.value.id
  const subjectId = selectedSubject.value.id
  const topicId = selectedTopic.value.id
  const previousIds = curriculumStore.applySubTopicOrder(
    gradeLevelId,
    subjectId,
    topicId,
    orderedIds,
  )
  if (!previousIds) return
  enqueueSave(`sub-topics:${topicId}`, orderedIds, {
    previous: previousIds,
    save: (ids) => curriculumStore.persistSubTopicOrder(topicId, ids),
    rollback: (ids) =>
      void curriculumStore.applySubTopicOrder(gradeLevelId, subjectId, topicId, ids),
  })
}

// ── in-place rename / cover image (dissolved edit dialogs) ─────────────────

function idsFor(level: CurriculumLevel, itemId: string): CurriculumIds {
  return {
    gradeLevelId: level === 'grade' ? itemId : (selectedGradeLevelId.value ?? ''),
    subjectId: level === 'subject' ? itemId : (selectedSubjectId.value ?? ''),
    topicId: level === 'topic' ? itemId : (selectedTopicId.value ?? ''),
    subTopicId: level === 'subtopic' ? itemId : '',
  }
}

function handleRename(level: CurriculumLevel, item: { id: string; name: string }, name: string) {
  const previous = item.name
  if (name === previous) return
  item.name = name
  const ids = idsFor(level, item.id)
  enqueueSave(`name:${item.id}`, name, {
    previous,
    save: (value) => curriculumEntityConfig[level].updateName(curriculumStore, ids, value),
    rollback: (confirmed) => {
      item.name = confirmed
    },
  })
}

/** Cover image upload in flight for this row (spinner in the editor). */
const uploadingImageId = ref<string | null>(null)

/**
 * Replaced/removed cover objects per item id (decision 78). Deleted only
 * once a cover-image save CONFIRMS the row no longer points at them — a
 * failed save rolls back to the confirmed path, so deleting earlier would
 * leave a broken image. Pending paths of a finally-failed save are dropped
 * (the fresh upload becomes the orphan instead).
 */
const pendingCoverDeletes = new Map<string, Set<string>>()

function queueCoverDelete(itemId: string, path: string) {
  let pending = pendingCoverDeletes.get(itemId)
  if (!pending) {
    pending = new Set()
    pendingCoverDeletes.set(itemId, pending)
  }
  pending.add(path)
}

/** After a CONFIRMED save: delete every pending object the row no longer points at. */
function flushCoverDeletes(itemId: string, savedPath: string | null) {
  const pending = pendingCoverDeletes.get(itemId)
  if (!pending) return
  const removable = [...pending].filter((path) => path !== savedPath)
  for (const path of removable) pending.delete(path)
  void removeStorageObjects('curriculum-images', removable)
}

function enqueueCoverImageSave(
  level: 'subject' | 'topic' | 'subtopic',
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

async function handleImageSelected(
  level: 'subject' | 'topic' | 'subtopic',
  item: { id: string; name: string; coverImagePath: string | null },
  file: File,
) {
  const previous = item.coverImagePath
  uploadingImageId.value = item.id
  const result = await curriculumStore.uploadCurriculumImage(file, level)
  uploadingImageId.value = null
  if (result.error || !result.path) {
    toast.error(result.error ?? '')
    return
  }
  enqueueCoverImageSave(level, item, previous, result.path)
}

function handleImageRemoved(
  level: 'subject' | 'topic' | 'subtopic',
  item: { id: string; name: string; coverImagePath: string | null },
) {
  const previous = item.coverImagePath
  if (!previous) return
  enqueueCoverImageSave(level, item, previous, null)
}
</script>

<template>
  <div class="p-6">
    <div class="editor-column">
      <!-- Header -->
      <div class="mb-6">
        <div class="flex items-center gap-3">
          <h1 class="text-2xl font-bold">{{ t.admin.curriculum.title }}</h1>
          <SaveStatusPill :status="saveStatus" />
        </div>
        <p class="text-muted-foreground">{{ t.admin.curriculum.subtitle }}</p>
      </div>

      <!-- Breadcrumb Navigation -->
      <Breadcrumb class="mb-4">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink v-if="selectedGradeLevel" as-child>
              <button @click="goBackToGradeLevels">{{ t.admin.curriculum.gradeLevels }}</button>
            </BreadcrumbLink>
            <BreadcrumbPage v-else>{{ t.admin.curriculum.gradeLevels }}</BreadcrumbPage>
          </BreadcrumbItem>
          <template v-if="selectedGradeLevel">
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink v-if="selectedSubject" as-child>
                <button @click="goBackToSubjects">{{ selectedGradeLevel.name }}</button>
              </BreadcrumbLink>
              <BreadcrumbPage v-else>{{ selectedGradeLevel.name }}</BreadcrumbPage>
            </BreadcrumbItem>
          </template>
          <template v-if="selectedSubject">
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink v-if="selectedTopic" as-child>
                <button @click="goBackToTopics">{{ selectedSubject.name }}</button>
              </BreadcrumbLink>
              <BreadcrumbPage v-else>{{ selectedSubject.name }}</BreadcrumbPage>
            </BreadcrumbItem>
          </template>
          <template v-if="selectedTopic">
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink v-if="selectedSubTopic" as-child>
                <button @click="goBackToSubTopics">{{ selectedTopic.name }}</button>
              </BreadcrumbLink>
              <BreadcrumbPage v-else>{{ selectedTopic.name }}</BreadcrumbPage>
            </BreadcrumbItem>
          </template>
          <template v-if="selectedSubTopic">
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{{ selectedSubTopic.name }}</BreadcrumbPage>
            </BreadcrumbItem>
          </template>
        </BreadcrumbList>
      </Breadcrumb>

      <!-- Loading State -->
      <div v-if="curriculumStore.isLoading" class="flex items-center justify-center py-12">
        <Loader2 class="size-8 animate-spin text-muted-foreground" />
      </div>

      <!-- Grade Level Selection (Level 1) -->
      <CurriculumItemList
        v-else-if="!selectedGradeLevel"
        v-model:expanded-id="expandedId"
        :items="curriculumStore.gradeLevels"
        :get-description="(g) => t.admin.curriculum.subjectCount(g.subjects.length)"
        :empty-title="t.admin.curriculum.noGradeLevels"
        :empty-description="t.admin.curriculum.noGradeLevelsDesc"
        :add-label="t.admin.curriculum.addGradeLevel"
        @select="(g) => selectGradeLevel(g.id)"
        @reorder="handleReorderGradeLevels"
        @rename="(g, name) => handleRename('grade', g, name)"
        @delete="(g) => openDeleteDialog('grade', g.name, g.id)"
        @add="openAddDialog('grade')"
      />

      <!-- Subject Selection (Level 2) -->
      <CurriculumItemList
        v-else-if="!selectedSubject"
        v-model:expanded-id="expandedId"
        :items="selectedGradeLevel.subjects"
        has-image
        :get-cover-image-url="(s) => (s.coverImagePath ? getImageUrl(s.coverImagePath) : null)"
        :get-description="(s) => t.admin.curriculum.topicCount(s.topics.length)"
        :uploading-image-id="uploadingImageId"
        :empty-title="t.admin.curriculum.noSubjects"
        :empty-description="t.admin.curriculum.noSubjectsDesc(selectedGradeLevel.name)"
        :add-label="t.admin.curriculum.addSubject"
        @select="(s) => selectSubject(s.id)"
        @reorder="handleReorderSubjects"
        @rename="(s, name) => handleRename('subject', s, name)"
        @image-selected="(s, file) => handleImageSelected('subject', s, file)"
        @image-removed="(s) => handleImageRemoved('subject', s)"
        @delete="(s) => openDeleteDialog('subject', s.name, selectedGradeLevel!.id, s.id)"
        @add="openAddDialog('subject')"
      />

      <!-- Topic Selection (Level 3) -->
      <CurriculumItemList
        v-else-if="!selectedTopic"
        v-model:expanded-id="expandedId"
        :items="selectedSubject.topics"
        has-image
        :get-cover-image-url="(t) => (t.coverImagePath ? getImageUrl(t.coverImagePath) : null)"
        :get-description="(topic) => t.admin.curriculum.subTopicCount(topic.subTopics.length)"
        :uploading-image-id="uploadingImageId"
        :empty-title="t.admin.curriculum.noTopics"
        :empty-description="t.admin.curriculum.noTopicsDesc(selectedSubject.name)"
        :add-label="t.admin.curriculum.addTopic"
        @select="(t) => selectTopic(t.id)"
        @reorder="handleReorderTopics"
        @rename="(t, name) => handleRename('topic', t, name)"
        @image-selected="(t, file) => handleImageSelected('topic', t, file)"
        @image-removed="(t) => handleImageRemoved('topic', t)"
        @delete="
          (t) =>
            openDeleteDialog('topic', t.name, selectedGradeLevel!.id, selectedSubject!.id, t.id)
        "
        @add="openAddDialog('topic')"
      />

      <!-- Sub-Topic Questions (Level 5) — decision 42: per-sub-topic question CRUD -->
      <SubTopicQuestionsPanel v-else-if="selectedSubTopic" :sub-topic="selectedSubTopic" />

      <!-- Sub-Topic Learning Path (Level 4) — display_order IS the student map order -->
      <CurriculumItemList
        v-else
        v-model:expanded-id="expandedId"
        :items="selectedTopic.subTopics"
        has-image
        :get-cover-image-url="(st) => (st.coverImagePath ? getImageUrl(st.coverImagePath) : null)"
        :get-description="(st) => t.admin.curriculum.questionCount(st.questionCount)"
        :uploading-image-id="uploadingImageId"
        :list-title="t.admin.curriculum.pathOrderTitle"
        :list-description="t.admin.curriculum.pathOrderDesc"
        :empty-title="t.admin.curriculum.noSubTopics"
        :empty-description="t.admin.curriculum.noSubTopicsDesc(selectedTopic.name)"
        :add-label="t.admin.curriculum.addSubTopic"
        @select="(st) => selectSubTopic(st.id)"
        @reorder="handleReorderSubTopics"
        @rename="(st, name) => handleRename('subtopic', st, name)"
        @image-selected="(st, file) => handleImageSelected('subtopic', st, file)"
        @image-removed="(st) => handleImageRemoved('subtopic', st)"
        @delete="
          (st) =>
            openDeleteDialog(
              'subtopic',
              st.name,
              selectedGradeLevel!.id,
              selectedSubject!.id,
              selectedTopic!.id,
              st.id,
            )
        "
        @add="openAddDialog('subtopic')"
      />

      <!-- Dialogs -->
      <CurriculumAddDialog
        v-model:open="showAddDialog"
        :add-type="addType"
        :grade-level-id="addDialogGradeLevelId"
        :subject-id="addDialogSubjectId"
        :topic-id="addDialogTopicId"
      />

      <CurriculumDeleteDialog
        v-model:open="showDeleteDialog"
        :delete-type="deleteType"
        :item-name="deleteItemName"
        :grade-level-id="deleteGradeLevelId"
        :subject-id="deleteSubjectId"
        :topic-id="deleteTopicId"
        :sub-topic-id="deleteSubTopicId"
        @deleted="handleDeleted"
      />
    </div>
  </div>
</template>
