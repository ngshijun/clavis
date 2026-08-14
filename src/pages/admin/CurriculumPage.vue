<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useCurriculumStore } from '@/stores/curriculum'
import CurriculumAddDialog from '@/components/admin/CurriculumAddDialog.vue'
import CurriculumEditImageDialog from '@/components/admin/CurriculumEditImageDialog.vue'
import CurriculumDeleteDialog from '@/components/admin/CurriculumDeleteDialog.vue'
import CurriculumEditNameDialog from '@/components/admin/CurriculumEditNameDialog.vue'
import CurriculumLevelPanel from '@/components/admin/CurriculumLevelPanel.vue'
import SubTopicPathList from '@/components/admin/SubTopicPathList.vue'
import SubTopicQuestionsPanel from '@/components/admin/SubTopicQuestionsPanel.vue'
import OrderSaveStatusPill from '@/components/shared/OrderSaveStatusPill.vue'
import { Plus, Loader2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { toast } from 'vue-sonner'
import { useOrderPersistence } from '@/composables/useOrderPersistence'
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

// Computed for dynamic add button
const currentAddType = computed<'grade' | 'subject' | 'topic' | 'subtopic'>(() => {
  if (!selectedGradeLevel.value) return 'grade'
  if (!selectedSubject.value) return 'subject'
  if (!selectedTopic.value) return 'topic'
  return 'subtopic'
})

const addButtonLabel = computed(() => {
  switch (currentAddType.value) {
    case 'grade':
      return t.value.admin.curriculum.addGradeLevel
    case 'subject':
      return t.value.admin.curriculum.addSubject
    case 'topic':
      return t.value.admin.curriculum.addTopic
    case 'subtopic':
      return t.value.admin.curriculum.addSubTopic
    default:
      return t.value.shared.actions.add
  }
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

// Navigation functions
function selectGradeLevel(gradeLevelId: string) {
  selectedGradeLevelId.value = gradeLevelId
  selectedSubjectId.value = null
  selectedTopicId.value = null
  selectedSubTopicId.value = null
}

function selectSubject(subjectId: string) {
  selectedSubjectId.value = subjectId
  selectedTopicId.value = null
  selectedSubTopicId.value = null
}

function selectTopic(topicId: string) {
  selectedTopicId.value = topicId
  selectedSubTopicId.value = null
}

function selectSubTopic(subTopicId: string) {
  selectedSubTopicId.value = subTopicId
}

function goBackToGradeLevels() {
  selectedGradeLevelId.value = null
  selectedSubjectId.value = null
  selectedTopicId.value = null
  selectedSubTopicId.value = null
}

function goBackToSubjects() {
  selectedSubjectId.value = null
  selectedTopicId.value = null
  selectedSubTopicId.value = null
}

function goBackToTopics() {
  selectedTopicId.value = null
  selectedSubTopicId.value = null
}

function goBackToSubTopics() {
  selectedSubTopicId.value = null
}

// Add dialog state
const showAddDialog = ref(false)
const addType = ref<'grade' | 'subject' | 'topic' | 'subtopic'>('grade')
const addDialogGradeLevelId = ref('')
const addDialogSubjectId = ref('')
const addDialogTopicId = ref('')

function openAddDialog(type: 'grade' | 'subject' | 'topic' | 'subtopic') {
  addType.value = type
  addDialogGradeLevelId.value = selectedGradeLevelId.value ?? ''
  addDialogSubjectId.value = selectedSubjectId.value ?? ''
  addDialogTopicId.value = selectedTopicId.value ?? ''
  showAddDialog.value = true
}

// Edit image dialog state
const showEditImageDialog = ref(false)
const editImageType = ref<'subject' | 'topic' | 'subtopic'>('subject')
const editImageGradeLevelId = ref('')
const editImageSubjectId = ref('')
const editImageTopicId = ref('')
const editImageSubTopicId = ref('')
const editImageItemName = ref('')
const editImageCurrentUrl = ref('')
const editImageCurrentPath = ref<string | null>(null)
const editImageHasCustomImage = ref(false)

function openEditImageDialog(opts: {
  type: 'subject' | 'topic' | 'subtopic'
  gradeLevelId: string
  subjectId: string
  itemName: string
  currentImage: string
  hasCustomImage: boolean
  topicId?: string
  subTopicId?: string
  coverImagePath?: string | null
}) {
  editImageType.value = opts.type
  editImageGradeLevelId.value = opts.gradeLevelId
  editImageSubjectId.value = opts.subjectId
  editImageTopicId.value = opts.topicId ?? ''
  editImageSubTopicId.value = opts.subTopicId ?? ''
  editImageItemName.value = opts.itemName
  editImageCurrentUrl.value = opts.currentImage
  editImageCurrentPath.value = opts.coverImagePath ?? null
  editImageHasCustomImage.value = opts.hasCustomImage
  showEditImageDialog.value = true
}

// Delete dialog state
const showDeleteDialog = ref(false)
const deleteType = ref<'grade' | 'subject' | 'topic' | 'subtopic'>('grade')
const deleteItemName = ref('')
const deleteGradeLevelId = ref('')
const deleteSubjectId = ref('')
const deleteTopicId = ref('')
const deleteSubTopicId = ref('')

function openDeleteDialog(
  type: 'grade' | 'subject' | 'topic' | 'subtopic',
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

function handleDeleted(
  type: 'grade' | 'subject' | 'topic' | 'subtopic',
  ids: { subjectId: string; topicId: string },
) {
  if (type === 'subject' && selectedSubjectId.value === ids.subjectId) {
    selectedSubjectId.value = null
    selectedTopicId.value = null
  }
  if (type === 'topic' && selectedTopicId.value === ids.topicId) {
    selectedTopicId.value = null
  }
}

// Seamless reorder (decision 72b): the drag applies instantly in the store;
// persistence is debounced/coalesced fire-and-forget via the positional RPCs.
// Dragging is never blocked — the pill in the header is the only affordance.
// Keys are per parent so different lists never coalesce with each other.
const { status: orderSaveStatus, enqueue: enqueueOrderSave } = useOrderPersistence({
  onError: (message) => toast.error(message),
})

function handleReorderGradeLevels(orderedIds: string[]) {
  const previousIds = curriculumStore.applyGradeLevelOrder(orderedIds)
  if (!previousIds) return
  enqueueOrderSave('grade-levels', orderedIds, {
    previousIds,
    save: (ids) => curriculumStore.persistGradeLevelOrder(ids),
    rollback: (ids) => void curriculumStore.applyGradeLevelOrder(ids),
  })
}

function handleReorderSubjects(orderedIds: string[]) {
  if (!selectedGradeLevel.value) return
  const gradeLevelId = selectedGradeLevel.value.id
  const previousIds = curriculumStore.applySubjectOrder(gradeLevelId, orderedIds)
  if (!previousIds) return
  enqueueOrderSave(`subjects:${gradeLevelId}`, orderedIds, {
    previousIds,
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
  enqueueOrderSave(`topics:${subjectId}`, orderedIds, {
    previousIds,
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
  enqueueOrderSave(`sub-topics:${topicId}`, orderedIds, {
    previousIds,
    save: (ids) => curriculumStore.persistSubTopicOrder(topicId, ids),
    rollback: (ids) =>
      void curriculumStore.applySubTopicOrder(gradeLevelId, subjectId, topicId, ids),
  })
}

// Edit name dialog state
const showEditNameDialog = ref(false)
const editNameType = ref<'grade' | 'subject' | 'topic' | 'subtopic'>('grade')
const editNameCurrentName = ref('')
const editNameGradeLevelId = ref('')
const editNameSubjectId = ref('')
const editNameTopicId = ref('')
const editNameSubTopicId = ref('')

function openEditNameDialog(
  type: 'grade' | 'subject' | 'topic' | 'subtopic',
  currentName: string,
  gradeLevelId: string,
  subjectId?: string,
  topicId?: string,
  subTopicId?: string,
) {
  editNameType.value = type
  editNameCurrentName.value = currentName
  editNameGradeLevelId.value = gradeLevelId
  editNameSubjectId.value = subjectId ?? ''
  editNameTopicId.value = topicId ?? ''
  editNameSubTopicId.value = subTopicId ?? ''
  showEditNameDialog.value = true
}
</script>

<template>
  <div class="p-6">
    <!-- Header -->
    <div class="mb-6 flex items-center justify-between">
      <div>
        <div class="flex items-center gap-3">
          <h1 class="text-2xl font-bold">{{ t.admin.curriculum.title }}</h1>
          <OrderSaveStatusPill :status="orderSaveStatus" />
        </div>
        <p class="text-muted-foreground">{{ t.admin.curriculum.subtitle }}</p>
      </div>
      <!-- Dynamic Add Button (level 5 has its own question actions) -->
      <Button
        v-if="!selectedSubTopic"
        :disabled="curriculumStore.isLoading"
        @click="openAddDialog(currentAddType)"
      >
        <Plus class="mr-2 size-4" />
        {{ addButtonLabel }}
      </Button>
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
    <CurriculumLevelPanel
      v-else-if="!selectedGradeLevel"
      :items="curriculumStore.gradeLevels"
      clickable
      :get-description="(g) => t.admin.curriculum.subjectCount(g.subjects.length)"
      :empty-title="t.admin.curriculum.noGradeLevels"
      :empty-description="t.admin.curriculum.noGradeLevelsDesc"
      :add-label="t.admin.curriculum.addGradeLevel"
      @select="(g) => selectGradeLevel(g.id)"
      @reorder="handleReorderGradeLevels"
      @edit-name="(g) => openEditNameDialog('grade', g.name, g.id)"
      @delete="(g) => openDeleteDialog('grade', g.name, g.id)"
      @add="openAddDialog('grade')"
    />

    <!-- Subject Selection (Level 2) -->
    <CurriculumLevelPanel
      v-else-if="!selectedSubject"
      :items="selectedGradeLevel.subjects"
      clickable
      has-image
      :get-cover-image-url="(s) => (s.coverImagePath ? getImageUrl(s.coverImagePath) : null)"
      :get-description="(s) => t.admin.curriculum.topicCount(s.topics.length)"
      :empty-title="t.admin.curriculum.noSubjects"
      :empty-description="t.admin.curriculum.noSubjectsDesc(selectedGradeLevel.name)"
      :add-label="t.admin.curriculum.addSubject"
      @select="(s) => selectSubject(s.id)"
      @reorder="handleReorderSubjects"
      @edit-name="(s) => openEditNameDialog('subject', s.name, selectedGradeLevel!.id, s.id)"
      @edit-image="
        (s) =>
          openEditImageDialog({
            type: 'subject',
            gradeLevelId: selectedGradeLevel!.id,
            subjectId: s.id,
            itemName: s.name,
            currentImage: getImageUrl(s.coverImagePath),
            hasCustomImage: !!s.coverImagePath,
            coverImagePath: s.coverImagePath,
          })
      "
      @delete="(s) => openDeleteDialog('subject', s.name, selectedGradeLevel!.id, s.id)"
      @add="openAddDialog('subject')"
    />

    <!-- Topic Selection (Level 3) -->
    <CurriculumLevelPanel
      v-else-if="!selectedTopic"
      :items="selectedSubject.topics"
      clickable
      has-image
      :get-cover-image-url="(t) => (t.coverImagePath ? getImageUrl(t.coverImagePath) : null)"
      :get-description="(topic) => t.admin.curriculum.subTopicCount(topic.subTopics.length)"
      :empty-title="t.admin.curriculum.noTopics"
      :empty-description="t.admin.curriculum.noTopicsDesc(selectedSubject.name)"
      :add-label="t.admin.curriculum.addTopic"
      @select="(t) => selectTopic(t.id)"
      @reorder="handleReorderTopics"
      @edit-name="
        (t) =>
          openEditNameDialog('topic', t.name, selectedGradeLevel!.id, selectedSubject!.id, t.id)
      "
      @edit-image="
        (t) =>
          openEditImageDialog({
            type: 'topic',
            gradeLevelId: selectedGradeLevel!.id,
            subjectId: selectedSubject!.id,
            itemName: t.name,
            currentImage: getImageUrl(t.coverImagePath),
            hasCustomImage: !!t.coverImagePath,
            topicId: t.id,
            coverImagePath: t.coverImagePath,
          })
      "
      @delete="
        (t) => openDeleteDialog('topic', t.name, selectedGradeLevel!.id, selectedSubject!.id, t.id)
      "
      @add="openAddDialog('topic')"
    />

    <!-- Sub-Topic Questions (Level 5) — decision 42: per-sub-topic question CRUD -->
    <SubTopicQuestionsPanel v-else-if="selectedSubTopic" :sub-topic="selectedSubTopic" />

    <!-- Sub-Topic Learning Path (Level 4) — display_order IS the student map order -->
    <SubTopicPathList
      v-else
      :items="selectedTopic.subTopics"
      :get-cover-image-url="(st) => (st.coverImagePath ? getImageUrl(st.coverImagePath) : null)"
      :empty-title="t.admin.curriculum.noSubTopics"
      :empty-description="t.admin.curriculum.noSubTopicsDesc(selectedTopic.name)"
      :add-label="t.admin.curriculum.addSubTopic"
      @select="(st) => selectSubTopic(st.id)"
      @reorder="handleReorderSubTopics"
      @edit-name="
        (st) =>
          openEditNameDialog(
            'subtopic',
            st.name,
            selectedGradeLevel!.id,
            selectedSubject!.id,
            selectedTopic!.id,
            st.id,
          )
      "
      @edit-image="
        (st) =>
          openEditImageDialog({
            type: 'subtopic',
            gradeLevelId: selectedGradeLevel!.id,
            subjectId: selectedSubject!.id,
            itemName: st.name,
            currentImage: getImageUrl(st.coverImagePath),
            hasCustomImage: !!st.coverImagePath,
            topicId: selectedTopic!.id,
            subTopicId: st.id,
            coverImagePath: st.coverImagePath,
          })
      "
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

    <CurriculumEditImageDialog
      v-model:open="showEditImageDialog"
      :image-type="editImageType"
      :grade-level-id="editImageGradeLevelId"
      :subject-id="editImageSubjectId"
      :topic-id="editImageTopicId"
      :sub-topic-id="editImageSubTopicId"
      :item-name="editImageItemName"
      :current-image-url="editImageCurrentUrl"
      :current-image-path="editImageCurrentPath"
      :has-custom-image="editImageHasCustomImage"
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

    <CurriculumEditNameDialog
      v-model:open="showEditNameDialog"
      :edit-type="editNameType"
      :current-name="editNameCurrentName"
      :grade-level-id="editNameGradeLevelId"
      :subject-id="editNameSubjectId"
      :topic-id="editNameTopicId"
      :sub-topic-id="editNameSubTopicId"
    />
  </div>
</template>
