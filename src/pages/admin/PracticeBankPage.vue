<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useCurriculumStore } from '@/stores/curriculum'
import { curriculumEntityConfig, type CurriculumIds } from '@/lib/curriculumEntityConfig'
import CurriculumAddDialog from '@/components/admin/CurriculumAddDialog.vue'
import CurriculumDeleteDialog from '@/components/admin/CurriculumDeleteDialog.vue'
import CurriculumItemList from '@/components/admin/CurriculumItemList.vue'
import StageQuestionsPanel from '@/components/admin/StageQuestionsPanel.vue'
import CurriculumTopicPicker from '@/components/shared/CurriculumTopicPicker.vue'
import SaveStatusPill from '@/components/shared/SaveStatusPill.vue'
import { Loader2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { toast } from 'vue-sonner'
import { useAutosave } from '@/composables/useAutosave'
import { removeStorageObjects } from '@/lib/storage'
import { useT } from '@/composables/useT'

/**
 * The practice bank (P19b): a topic's STAGES and the questions filed under
 * them. The curriculum page owns the trunk, so this page starts from a topic
 * picked in one interaction (the tree popover) and then shows exactly two
 * things — the learning path (stage order IS the student's map order) and,
 * once a stage is selected, its questions.
 */
const t = useT()
const curriculumStore = useCurriculumStore()

const selectedTopicId = ref<string | null>(null)
const selectedStageId = ref<string | null>(null)
/** The one expanded stage row (in-place name + cover editor). */
const expandedId = ref<string | null>(null)

onMounted(async () => {
  await curriculumStore.fetchCurriculum()
})

const topic = computed(() =>
  selectedTopicId.value ? (curriculumStore.getTopicById(selectedTopicId.value) ?? null) : null,
)
const stages = computed(() => topic.value?.stages ?? [])
const selectedStage = computed(() =>
  selectedStageId.value ? (curriculumStore.getStageById(selectedStageId.value) ?? null) : null,
)

function selectTopic(topicId: string) {
  selectedTopicId.value = topicId
  selectedStageId.value = null
  expandedId.value = null
}

function selectStage(stageId: string) {
  selectedStageId.value = stageId
  expandedId.value = null
}

const getImageUrl = (path: string | null) =>
  path ? curriculumStore.getOptimizedImageUrl(path) : null

// ── dialogs ────────────────────────────────────────────────────────────────

const showAddDialog = ref(false)
const showDeleteDialog = ref(false)
const deleteStageId = ref('')
const deleteStageName = ref('')

function openDeleteDialog(stage: { id: string; name: string }) {
  deleteStageId.value = stage.id
  deleteStageName.value = stage.name
  showDeleteDialog.value = true
}

function handleDeleted() {
  if (selectedStageId.value === deleteStageId.value) selectedStageId.value = null
  expandedId.value = null
}

// ── background autosave (decision 72b) ─────────────────────────────────────

const { status: saveStatus, enqueue: enqueueSave } = useAutosave({
  onError: (message) => toast.error(message),
})

function idsFor(stageId: string): CurriculumIds {
  const hierarchy = curriculumStore.getStageWithHierarchy(stageId)
  return {
    gradeLevelId: hierarchy?.gradeLevel.id ?? '',
    subjectId: hierarchy?.subject.id ?? '',
    topicId: hierarchy?.topic.id ?? selectedTopicId.value ?? '',
    stageId,
    subTopicId: '',
  }
}

function handleReorder(orderedIds: string[]) {
  const topicId = selectedTopicId.value
  if (!topicId) return
  const previousIds = curriculumStore.applyStageOrder(topicId, orderedIds)
  if (!previousIds) return
  enqueueSave(`stages:${topicId}`, orderedIds, {
    previous: previousIds,
    save: (ids) => curriculumStore.persistStageOrder(topicId, ids),
    rollback: (ids) => void curriculumStore.applyStageOrder(topicId, ids),
  })
}

function handleRename(stage: { id: string; name: string }, name: string) {
  const previous = stage.name
  if (name === previous) return
  stage.name = name
  enqueueSave(`name:${stage.id}`, name, {
    previous,
    save: (value) =>
      curriculumEntityConfig.stage.updateName(curriculumStore, idsFor(stage.id), value),
    rollback: (confirmed) => {
      stage.name = confirmed
    },
  })
}

// ── cover images (decision 78) ─────────────────────────────────────────────

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
  stage: { id: string; coverImagePath: string | null },
  previous: string | null,
  path: string | null,
) {
  stage.coverImagePath = path
  if (previous) queueCoverDelete(stage.id, previous)
  enqueueSave(`image:${stage.id}`, path, {
    previous,
    save: async (value) => {
      const result = await curriculumEntityConfig.stage.updateCoverImage(
        curriculumStore,
        idsFor(stage.id),
        value,
      )
      if (!result.error) flushCoverDeletes(stage.id, value)
      return result
    },
    rollback: (confirmed) => {
      pendingCoverDeletes.delete(stage.id)
      stage.coverImagePath = confirmed
    },
  })
}

async function handleImageSelected(
  stage: { id: string; coverImagePath: string | null },
  file: File,
) {
  const previous = stage.coverImagePath
  uploadingImageId.value = stage.id
  const result = await curriculumStore.uploadCurriculumImage(file, 'stage')
  uploadingImageId.value = null
  if (result.error || !result.path) {
    toast.error(result.error ?? '')
    return
  }
  enqueueCoverImageSave(stage, previous, result.path)
}

function handleImageRemoved(stage: { id: string; coverImagePath: string | null }) {
  if (!stage.coverImagePath) return
  enqueueCoverImageSave(stage, stage.coverImagePath, null)
}
</script>

<template>
  <div class="p-6">
    <div class="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-center gap-2">
        <CurriculumTopicPicker
          :model-value="selectedTopicId"
          :placeholder="t.admin.practiceBank.pickTopic"
          @update:model-value="selectTopic"
        />
        <Button v-if="selectedStage" variant="ghost" size="sm" @click="selectedStageId = null">
          {{ t.admin.practiceBank.backToStages }}
        </Button>
      </div>
      <SaveStatusPill :status="saveStatus" />
    </div>

    <div v-if="curriculumStore.isLoading" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <!-- No topic chosen yet -->
    <div v-else-if="!topic" class="rounded-lg border border-dashed p-12 text-center">
      <h3 class="text-lg font-medium">{{ t.admin.practiceBank.noTopicTitle }}</h3>
      <p class="mt-2 text-sm text-muted-foreground">{{ t.admin.practiceBank.noTopicDesc }}</p>
    </div>

    <!-- One stage open: its questions -->
    <StageQuestionsPanel v-else-if="selectedStage" :stage="selectedStage" />

    <!-- The topic's learning path -->
    <CurriculumItemList
      v-else
      v-model:expanded-id="expandedId"
      :items="stages"
      has-image
      :get-cover-image-url="(stage) => getImageUrl(stage.coverImagePath)"
      :get-description="(stage) => t.admin.curriculum.questionCount(stage.questionCount)"
      :uploading-image-id="uploadingImageId"
      :list-title="t.admin.practiceBank.pathOrderTitle"
      :list-description="t.admin.practiceBank.pathOrderDesc"
      :empty-title="t.admin.practiceBank.noStages"
      :empty-description="t.admin.practiceBank.noStagesDesc(topic.name)"
      :add-label="t.admin.practiceBank.addStage"
      @select="(stage) => selectStage(stage.id)"
      @reorder="handleReorder"
      @rename="handleRename"
      @image-selected="handleImageSelected"
      @image-removed="handleImageRemoved"
      @delete="openDeleteDialog"
      @add="showAddDialog = true"
    />

    <CurriculumAddDialog
      v-model:open="showAddDialog"
      add-type="stage"
      grade-level-id=""
      subject-id=""
      :topic-id="selectedTopicId ?? ''"
    />

    <CurriculumDeleteDialog
      v-model:open="showDeleteDialog"
      delete-type="stage"
      :item-name="deleteStageName"
      grade-level-id=""
      subject-id=""
      :topic-id="selectedTopicId ?? ''"
      :stage-id="deleteStageId"
      sub-topic-id=""
      @deleted="handleDeleted"
    />
  </div>
</template>
