<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useCurriculumStore } from '@/stores/curriculum'
import CurriculumAddDialog from '@/components/admin/CurriculumAddDialog.vue'
import CurriculumEditImageDialog from '@/components/admin/CurriculumEditImageDialog.vue'
import CurriculumDeleteDialog from '@/components/admin/CurriculumDeleteDialog.vue'
import CurriculumEditNameDialog from '@/components/admin/CurriculumEditNameDialog.vue'
import CurriculumLevelPanel from '@/components/admin/CurriculumLevelPanel.vue'
import { Plus, Loader2 } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

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
      return 'Add Grade Level'
    case 'subject':
      return 'Add Subject'
    case 'topic':
      return 'Add Topic'
    case 'subtopic':
      return 'Add Sub-Topic'
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
}

function selectSubject(subjectId: string) {
  selectedSubjectId.value = subjectId
  selectedTopicId.value = null
}

function selectTopic(topicId: string) {
  selectedTopicId.value = topicId
}

function goBackToGradeLevels() {
  selectedGradeLevelId.value = null
  selectedSubjectId.value = null
  selectedTopicId.value = null
}

function goBackToSubjects() {
  selectedSubjectId.value = null
  selectedTopicId.value = null
}

function goBackToTopics() {
  selectedTopicId.value = null
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
        <h1 class="text-2xl font-bold">Curriculum</h1>
        <p class="text-muted-foreground">Manage grade levels, subjects, topics, and sub-topics</p>
      </div>
      <!-- Dynamic Add Button -->
      <Button :disabled="curriculumStore.isLoading" @click="openAddDialog(currentAddType)">
        <Plus class="mr-2 size-4" />
        {{ addButtonLabel }}
      </Button>
    </div>

    <!-- Breadcrumb Navigation -->
    <Breadcrumb class="mb-4">
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink v-if="selectedGradeLevel" as-child>
            <button @click="goBackToGradeLevels">Grade Levels</button>
          </BreadcrumbLink>
          <BreadcrumbPage v-else>Grade Levels</BreadcrumbPage>
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
            <BreadcrumbPage>{{ selectedTopic.name }}</BreadcrumbPage>
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
      :get-description="
        (g) => `${g.subjects.length} ${g.subjects.length === 1 ? 'subject' : 'subjects'}`
      "
      empty-title="No grade levels yet"
      empty-description="Get started by adding your first grade level."
      add-label="Add Grade Level"
      @select="(g) => selectGradeLevel(g.id)"
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
      :get-description="(s) => `${s.topics.length} ${s.topics.length === 1 ? 'topic' : 'topics'}`"
      empty-title="No subjects yet"
      :empty-description="`Add subjects to ${selectedGradeLevel.name}.`"
      add-label="Add Subject"
      @select="(s) => selectSubject(s.id)"
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
      :get-description="
        (t) => `${t.subTopics.length} ${t.subTopics.length === 1 ? 'sub-topic' : 'sub-topics'}`
      "
      empty-title="No topics yet"
      :empty-description="`Add topics to ${selectedSubject.name}.`"
      add-label="Add Topic"
      @select="(t) => selectTopic(t.id)"
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

    <!-- Sub-Topic Selection (Level 4) -->
    <CurriculumLevelPanel
      v-else
      :items="selectedTopic.subTopics"
      has-image
      :get-cover-image-url="(st) => (st.coverImagePath ? getImageUrl(st.coverImagePath) : null)"
      :get-description="() => 'Sub-Topic'"
      empty-title="No sub-topics yet"
      :empty-description="`Add sub-topics to ${selectedTopic.name}.`"
      add-label="Add Sub-Topic"
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
