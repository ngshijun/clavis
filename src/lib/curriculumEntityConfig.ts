import type { useCurriculumStore } from '@/stores/curriculum'

/**
 * The trunk (grade → subject → topic) plus a topic's two branches: `stage`
 * (the practice path) and `subtopic` (assessment bank filing).
 */
export type CurriculumLevel = 'grade' | 'subject' | 'topic' | 'stage' | 'subtopic'

export interface CurriculumIds {
  gradeLevelId: string
  subjectId: string
  topicId: string
  stageId: string
  subTopicId: string
}

type CurriculumStore = ReturnType<typeof useCurriculumStore>

interface CurriculumEntityEntry {
  label: string
  inputLabel: string
  hasImage: boolean
  imageType: 'subject' | 'topic' | 'stage' | null
  addDescription: string
  deleteDescription: string
  add: (
    store: CurriculumStore,
    ids: CurriculumIds,
    name: string,
  ) => Promise<{ error: string | null; id?: string }>
  updateName: (
    store: CurriculumStore,
    ids: CurriculumIds,
    name: string,
  ) => Promise<{ error: string | null }>
  delete: (store: CurriculumStore, ids: CurriculumIds) => Promise<{ error: string | null }>
  updateCoverImage: (
    store: CurriculumStore,
    ids: CurriculumIds,
    path: string | null,
  ) => Promise<{ error: string | null }>
  getItemId: (ids: CurriculumIds) => string
}

export const curriculumEntityConfig: Record<CurriculumLevel, CurriculumEntityEntry> = {
  grade: {
    label: 'Grade Level',
    inputLabel: 'Grade Level Name',
    hasImage: false,
    imageType: null,
    addDescription: 'Add a new grade level to the curriculum.',
    deleteDescription:
      'This will permanently delete this grade level and all its subjects, topics, stages, sub-topics, questions, and practice sessions. This action cannot be undone.',
    add: (store, _ids, name) => store.addGradeLevel(name),
    updateName: (store, ids, name) => store.updateGradeLevel(ids.gradeLevelId, name),
    delete: (store, ids) => store.deleteGradeLevel(ids.gradeLevelId),
    updateCoverImage: () => Promise.resolve({ error: null }),
    getItemId: (ids) => ids.gradeLevelId,
  },
  subject: {
    label: 'Subject',
    inputLabel: 'Subject Name',
    hasImage: true,
    imageType: 'subject',
    addDescription: 'Add a new subject with an optional cover image.',
    deleteDescription:
      'This will permanently delete this subject and all its topics, stages, sub-topics, questions, and practice sessions. This action cannot be undone.',
    add: (store, ids, name) => store.addSubject(ids.gradeLevelId, name),
    updateName: (store, ids, name) =>
      store.updateSubject(ids.gradeLevelId, ids.subjectId, { name }),
    delete: (store, ids) => store.deleteSubject(ids.gradeLevelId, ids.subjectId),
    updateCoverImage: (store, ids, path) =>
      store.updateSubjectCoverImage(ids.gradeLevelId, ids.subjectId, path),
    getItemId: (ids) => ids.subjectId,
  },
  topic: {
    label: 'Topic',
    inputLabel: 'Topic Name',
    hasImage: true,
    imageType: 'topic',
    addDescription: 'Add a new topic with an optional cover image.',
    deleteDescription:
      'This will permanently delete this topic and all its stages, sub-topics, questions, and practice sessions. This action cannot be undone.',
    add: (store, ids, name) => store.addTopic(ids.gradeLevelId, ids.subjectId, name),
    updateName: (store, ids, name) =>
      store.updateTopic(ids.gradeLevelId, ids.subjectId, ids.topicId, { name }),
    delete: (store, ids) => store.deleteTopic(ids.gradeLevelId, ids.subjectId, ids.topicId),
    updateCoverImage: (store, ids, path) =>
      store.updateTopicCoverImage(ids.gradeLevelId, ids.subjectId, ids.topicId, path),
    getItemId: (ids) => ids.topicId,
  },
  stage: {
    label: 'Stage',
    inputLabel: 'Stage Name',
    hasImage: true,
    imageType: 'stage',
    addDescription: 'Add a new practice stage with an optional cover image.',
    deleteDescription:
      'This will permanently delete this stage and all its practice questions and practice sessions. This action cannot be undone.',
    add: (store, ids, name) => store.addStage(ids.topicId, name),
    updateName: (store, ids, name) => store.updateStage(ids.stageId, { name }),
    delete: (store, ids) => store.deleteStage(ids.stageId),
    updateCoverImage: (store, ids, path) => store.updateStageCoverImage(ids.stageId, path),
    getItemId: (ids) => ids.stageId,
  },
  subtopic: {
    label: 'Sub-Topic',
    inputLabel: 'Sub-Topic Name',
    hasImage: false,
    imageType: null,
    addDescription: 'Add a new sub-topic to file assessment bank questions under.',
    deleteDescription:
      'This will permanently delete this sub-topic. Bank questions filed under it must be refiled or deleted first. This action cannot be undone.',
    add: (store, ids, name) => store.addSubTopic(ids.topicId, name),
    updateName: (store, ids, name) => store.updateSubTopic(ids.subTopicId, { name }),
    delete: (store, ids) => store.deleteSubTopic(ids.subTopicId),
    updateCoverImage: () => Promise.resolve({ error: null }),
    getItemId: (ids) => ids.subTopicId,
  },
}
