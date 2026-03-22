import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import type { Database } from '@/types/database.types'
import { handleError } from '@/lib/errors'
import { getStorageImageUrl, type ImageTransformOptions } from '@/lib/storage'

type GradeLevelRow = Database['public']['Tables']['grade_levels']['Row']
type SubjectRow = Database['public']['Tables']['subjects']['Row']
type TopicRow = Database['public']['Tables']['topics']['Row']
type SubTopicRow = Database['public']['Tables']['sub_topics']['Row']

export interface SubTopic {
  id: string
  name: string
  coverImagePath: string | null
  displayOrder: number
  topicId: string
  questionCount: number
}

export interface Topic {
  id: string
  name: string
  coverImagePath: string | null
  displayOrder: number
  subjectId: string
  subTopics: SubTopic[]
}

export interface Subject {
  id: string
  name: string
  coverImagePath: string | null
  displayOrder: number
  gradeLevelId: string
  topics: Topic[]
}

export interface GradeLevel {
  id: string
  name: string
  displayOrder: number
  subjects: Subject[]
}

// Cache TTL for curriculum data (rarely changes)
const CURRICULUM_CACHE_TTL = 10 * 60 * 1000 // 10 minutes

// Type for sub-topic with full hierarchy info (for O(1) lookups)
export interface SubTopicWithHierarchy {
  subTopic: SubTopic
  topic: Topic
  subject: Subject
  gradeLevel: GradeLevel
}

export interface TopicWithHierarchy {
  topic: Topic
  subject: Subject
  gradeLevel: GradeLevel
}

export const useCurriculumStore = defineStore('curriculum', () => {
  const gradeLevels = ref<GradeLevel[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Flat lists for easier access
  const allSubjects = ref<SubjectRow[]>([])
  const allTopics = ref<TopicRow[]>([])
  const allSubTopics = ref<SubTopicRow[]>([])

  // Cache timestamp for staleness tracking
  const lastFetched = ref<number | null>(null)

  // ============================================
  // O(1) Lookup Maps (built after fetch, updated on CRUD)
  // ============================================
  const gradeLevelMap = ref<Map<string, GradeLevel>>(new Map())
  const subjectMap = ref<Map<string, Subject>>(new Map())
  const topicMap = ref<Map<string, Topic>>(new Map())
  const subTopicMap = ref<Map<string, SubTopic>>(new Map())
  const subTopicHierarchyMap = ref<Map<string, SubTopicWithHierarchy>>(new Map())
  const topicHierarchyMap = ref<Map<string, TopicWithHierarchy>>(new Map())

  // Admin CurriculumPage navigation state (persisted across navigation)
  const adminCurriculumNavigation = ref({
    selectedGradeLevelId: null as string | null,
    selectedSubjectId: null as string | null,
    selectedTopicId: null as string | null,
  })

  /**
   * Check if curriculum cache is stale
   */
  function isCacheStale(): boolean {
    if (!lastFetched.value || gradeLevels.value.length === 0) return true
    return Date.now() - lastFetched.value > CURRICULUM_CACHE_TTL
  }

  /**
   * Build O(1) lookup maps from hierarchical data
   * Called after fetchCurriculum() and after CRUD operations
   */
  function buildLookupMaps(): void {
    gradeLevelMap.value.clear()
    subjectMap.value.clear()
    topicMap.value.clear()
    subTopicMap.value.clear()
    subTopicHierarchyMap.value.clear()
    topicHierarchyMap.value.clear()

    for (const gradeLevel of gradeLevels.value) {
      gradeLevelMap.value.set(gradeLevel.id, gradeLevel)

      for (const subject of gradeLevel.subjects) {
        subjectMap.value.set(subject.id, subject)

        for (const topic of subject.topics) {
          topicMap.value.set(topic.id, topic)
          topicHierarchyMap.value.set(topic.id, { topic, subject, gradeLevel })

          for (const subTopic of topic.subTopics) {
            subTopicMap.value.set(subTopic.id, subTopic)
            subTopicHierarchyMap.value.set(subTopic.id, {
              subTopic,
              topic,
              subject,
              gradeLevel,
            })
          }
        }
      }
    }
  }

  /**
   * Fetch all curriculum data (grade levels, subjects, topics, sub_topics)
   * Uses parallel queries for better performance
   */
  async function fetchCurriculum(force = false): Promise<void> {
    // Skip if cache is still valid and not forced
    if (!force && !isCacheStale()) {
      return
    }

    isLoading.value = true
    error.value = null

    try {
      // Fetch all data in parallel for better performance
      // Use resource embedding on sub_topics to get question counts efficiently
      // (avoids Supabase's default 1000-row limit on a separate questions query)
      const [gradeResult, subjectResult, topicResult, subTopicResult] = await Promise.all([
        supabase.from('grade_levels').select('*').order('display_order', { ascending: true }),
        supabase.from('subjects').select('*').order('display_order', { ascending: true }),
        supabase.from('topics').select('*').order('display_order', { ascending: true }),
        supabase
          .from('sub_topics')
          .select('*, questions(count)')
          .order('display_order', { ascending: true }),
      ])

      // Check for errors
      if (gradeResult.error) throw gradeResult.error
      if (subjectResult.error) throw subjectResult.error
      if (topicResult.error) throw topicResult.error
      if (subTopicResult.error) throw subTopicResult.error

      const gradeData = gradeResult.data
      const subjectData = subjectResult.data
      const topicData = topicResult.data
      const subTopicData = subTopicResult.data

      // Build question count map from embedded counts
      const questionCountMap = new Map<string, number>()
      for (const st of subTopicData ?? []) {
        const count = (st.questions as unknown as { count: number }[])?.[0]?.count ?? 0
        questionCountMap.set(st.id, count)
      }

      // Store flat lists
      allSubjects.value = subjectData ?? []
      allTopics.value = topicData ?? []
      allSubTopics.value = subTopicData ?? []

      // Build hierarchical structure
      const gradeMap = new Map<string, GradeLevel>()

      // Initialize grade levels
      for (const grade of gradeData ?? []) {
        gradeMap.set(grade.id, {
          id: grade.id,
          name: grade.name,
          displayOrder: grade.display_order ?? 0,
          subjects: [],
        })
      }

      // Map subjects to grade levels
      const subjectMap = new Map<string, Subject>()
      for (const subject of subjectData ?? []) {
        const gradeLevel = gradeMap.get(subject.grade_level_id)
        if (gradeLevel) {
          const subjectObj: Subject = {
            id: subject.id,
            name: subject.name,
            coverImagePath: subject.cover_image_path,
            displayOrder: subject.display_order ?? 0,
            gradeLevelId: subject.grade_level_id,
            topics: [],
          }
          subjectMap.set(subject.id, subjectObj)
          gradeLevel.subjects.push(subjectObj)
        }
      }

      // Map topics to subjects
      const topicMap = new Map<string, Topic>()
      for (const topic of topicData ?? []) {
        const subject = subjectMap.get(topic.subject_id)
        if (subject) {
          const topicObj: Topic = {
            id: topic.id,
            name: topic.name,
            coverImagePath: topic.cover_image_path,
            displayOrder: topic.display_order ?? 0,
            subjectId: topic.subject_id,
            subTopics: [],
          }
          topicMap.set(topic.id, topicObj)
          subject.topics.push(topicObj)
        }
      }

      // Map sub_topics to topics
      for (const subTopic of subTopicData ?? []) {
        const topic = topicMap.get(subTopic.topic_id)
        if (topic) {
          topic.subTopics.push({
            id: subTopic.id,
            name: subTopic.name,
            coverImagePath: subTopic.cover_image_path,
            displayOrder: subTopic.display_order ?? 0,
            topicId: subTopic.topic_id,
            questionCount: questionCountMap.get(subTopic.id) ?? 0,
          })
        }
      }

      gradeLevels.value = Array.from(gradeMap.values())
      lastFetched.value = Date.now()

      // Build O(1) lookup maps after hierarchy is constructed
      buildLookupMaps()
    } catch (err) {
      console.error('Error fetching curriculum:', err)
      error.value = handleError(err, 'Failed to fetch curriculum.')
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Add a new grade level
   */
  async function addGradeLevel(
    name: string,
  ): Promise<{ success: boolean; error: string | null; id?: string }> {
    try {
      // Get max display order
      const maxOrder = Math.max(0, ...gradeLevels.value.map((g) => g.displayOrder))

      const { data, error: insertError } = await supabase
        .from('grade_levels')
        .insert({
          name,
          display_order: maxOrder + 1,
        })
        .select()
        .single()

      if (insertError) throw insertError

      // Add to local state
      const newGradeLevel: GradeLevel = {
        id: data.id,
        name: data.name,
        displayOrder: data.display_order ?? 0,
        subjects: [],
      }
      gradeLevels.value.push(newGradeLevel)

      // Update lookup map
      gradeLevelMap.value.set(newGradeLevel.id, newGradeLevel)

      return { success: true, error: null, id: data.id }
    } catch (err) {
      console.error('Error adding grade level:', err)
      const message = handleError(err, 'Failed to add grade level.')
      return { success: false, error: message }
    }
  }

  /**
   * Update a grade level
   */
  async function updateGradeLevel(
    id: string,
    name: string,
  ): Promise<{ success: boolean; error: string | null }> {
    try {
      const { error: updateError } = await supabase
        .from('grade_levels')
        .update({ name })
        .eq('id', id)

      if (updateError) throw updateError

      // Update local state
      const grade = gradeLevels.value.find((g) => g.id === id)
      if (grade) {
        grade.name = name
      }

      return { success: true, error: null }
    } catch (err) {
      console.error('Error updating grade level:', err)
      const message = handleError(err, 'Failed to update grade level.')
      return { success: false, error: message }
    }
  }

  /**
   * Delete a grade level
   */
  async function deleteGradeLevel(id: string): Promise<{ success: boolean; error: string | null }> {
    try {
      const { error: deleteError } = await supabase.from('grade_levels').delete().eq('id', id)

      if (deleteError) throw deleteError

      // Remove from local state and rebuild maps (cascade removes subjects/topics/subtopics)
      const index = gradeLevels.value.findIndex((g) => g.id === id)
      if (index !== -1) {
        gradeLevels.value.splice(index, 1)
        // Rebuild all maps to remove cascaded items
        buildLookupMaps()
      }

      return { success: true, error: null }
    } catch (err) {
      console.error('Error deleting grade level:', err)
      const message = handleError(err, 'Failed to delete grade level.')
      return { success: false, error: message }
    }
  }

  /**
   * Add a new subject
   */
  async function addSubject(
    gradeLevelId: string,
    name: string,
    coverImagePath?: string,
  ): Promise<{ success: boolean; error: string | null; id?: string }> {
    try {
      const gradeLevel = gradeLevels.value.find((g) => g.id === gradeLevelId)
      if (!gradeLevel) {
        return { success: false, error: 'Grade level not found' }
      }

      // Get max display order for this grade level
      const maxOrder = Math.max(0, ...gradeLevel.subjects.map((s) => s.displayOrder))

      const { data, error: insertError } = await supabase
        .from('subjects')
        .insert({
          grade_level_id: gradeLevelId,
          name,
          cover_image_path: coverImagePath ?? null,
          display_order: maxOrder + 1,
        })
        .select()
        .single()

      if (insertError) throw insertError

      // Add to local state
      const newSubject: Subject = {
        id: data.id,
        name: data.name,
        coverImagePath: data.cover_image_path,
        displayOrder: data.display_order ?? 0,
        gradeLevelId: data.grade_level_id,
        topics: [],
      }
      gradeLevel.subjects.push(newSubject)

      // Update lookup map
      subjectMap.value.set(newSubject.id, newSubject)

      return { success: true, error: null, id: data.id }
    } catch (err) {
      console.error('Error adding subject:', err)
      const message = handleError(err, 'Failed to add subject.')
      return { success: false, error: message }
    }
  }

  /**
   * Update a subject
   */
  async function updateSubject(
    gradeLevelId: string,
    subjectId: string,
    updates: { name?: string; coverImagePath?: string | null },
  ): Promise<{ success: boolean; error: string | null }> {
    try {
      const updateData: { name?: string; cover_image_path?: string | null } = {}
      if (updates.name !== undefined) updateData.name = updates.name
      if (updates.coverImagePath !== undefined) updateData.cover_image_path = updates.coverImagePath

      const { error: updateError } = await supabase
        .from('subjects')
        .update(updateData)
        .eq('id', subjectId)

      if (updateError) throw updateError

      // Update local state
      const gradeLevel = gradeLevels.value.find((g) => g.id === gradeLevelId)
      const subject = gradeLevel?.subjects.find((s) => s.id === subjectId)
      if (subject) {
        if (updates.name !== undefined) subject.name = updates.name
        if (updates.coverImagePath !== undefined) subject.coverImagePath = updates.coverImagePath
      }

      return { success: true, error: null }
    } catch (err) {
      console.error('Error updating subject:', err)
      const message = handleError(err, 'Failed to update subject.')
      return { success: false, error: message }
    }
  }

  /**
   * Update subject cover image (convenience method)
   */
  async function updateSubjectCoverImage(
    gradeLevelId: string,
    subjectId: string,
    coverImagePath: string | null,
  ): Promise<{ success: boolean; error: string | null }> {
    return updateSubject(gradeLevelId, subjectId, { coverImagePath })
  }

  /**
   * Delete a subject
   */
  async function deleteSubject(
    gradeLevelId: string,
    subjectId: string,
  ): Promise<{ success: boolean; error: string | null }> {
    try {
      const { error: deleteError } = await supabase.from('subjects').delete().eq('id', subjectId)

      if (deleteError) throw deleteError

      // Remove from local state and rebuild maps (cascade removes topics/subtopics)
      const gradeLevel = gradeLevels.value.find((g) => g.id === gradeLevelId)
      if (gradeLevel) {
        const index = gradeLevel.subjects.findIndex((s) => s.id === subjectId)
        if (index !== -1) {
          gradeLevel.subjects.splice(index, 1)
          // Rebuild all maps to remove cascaded items
          buildLookupMaps()
        }
      }

      return { success: true, error: null }
    } catch (err) {
      console.error('Error deleting subject:', err)
      const message = handleError(err, 'Failed to delete subject.')
      return { success: false, error: message }
    }
  }

  /**
   * Add a new topic
   */
  async function addTopic(
    gradeLevelId: string,
    subjectId: string,
    name: string,
    coverImagePath?: string,
  ): Promise<{ success: boolean; error: string | null; id?: string }> {
    try {
      const gradeLevel = gradeLevels.value.find((g) => g.id === gradeLevelId)
      const subject = gradeLevel?.subjects.find((s) => s.id === subjectId)
      if (!subject) {
        return { success: false, error: 'Subject not found' }
      }

      // Get max display order for this subject
      const maxOrder = Math.max(0, ...subject.topics.map((t) => t.displayOrder))

      const { data, error: insertError } = await supabase
        .from('topics')
        .insert({
          subject_id: subjectId,
          name,
          cover_image_path: coverImagePath ?? null,
          display_order: maxOrder + 1,
        })
        .select()
        .single()

      if (insertError) throw insertError

      // Add to local state
      const newTopic: Topic = {
        id: data.id,
        name: data.name,
        coverImagePath: data.cover_image_path,
        displayOrder: data.display_order ?? 0,
        subjectId: data.subject_id,
        subTopics: [],
      }
      subject.topics.push(newTopic)

      // Update lookup maps (gradeLevel already available from earlier lookup)
      if (gradeLevel && subject) {
        topicMap.value.set(newTopic.id, newTopic)
        topicHierarchyMap.value.set(newTopic.id, { topic: newTopic, subject, gradeLevel })
      }

      return { success: true, error: null, id: data.id }
    } catch (err) {
      console.error('Error adding topic:', err)
      const message = handleError(err, 'Failed to add topic.')
      return { success: false, error: message }
    }
  }

  /**
   * Update a topic
   */
  async function updateTopic(
    gradeLevelId: string,
    subjectId: string,
    topicId: string,
    updates: { name?: string; coverImagePath?: string | null },
  ): Promise<{ success: boolean; error: string | null }> {
    try {
      const updateData: { name?: string; cover_image_path?: string | null } = {}
      if (updates.name !== undefined) updateData.name = updates.name
      if (updates.coverImagePath !== undefined) updateData.cover_image_path = updates.coverImagePath

      const { error: updateError } = await supabase
        .from('topics')
        .update(updateData)
        .eq('id', topicId)

      if (updateError) throw updateError

      // Update local state
      const gradeLevel = gradeLevels.value.find((g) => g.id === gradeLevelId)
      const subject = gradeLevel?.subjects.find((s) => s.id === subjectId)
      const topic = subject?.topics.find((t) => t.id === topicId)
      if (topic) {
        if (updates.name !== undefined) topic.name = updates.name
        if (updates.coverImagePath !== undefined) topic.coverImagePath = updates.coverImagePath
      }

      return { success: true, error: null }
    } catch (err) {
      console.error('Error updating topic:', err)
      const message = handleError(err, 'Failed to update topic.')
      return { success: false, error: message }
    }
  }

  /**
   * Update topic cover image (convenience method)
   */
  async function updateTopicCoverImage(
    gradeLevelId: string,
    subjectId: string,
    topicId: string,
    coverImagePath: string | null,
  ): Promise<{ success: boolean; error: string | null }> {
    return updateTopic(gradeLevelId, subjectId, topicId, { coverImagePath })
  }

  /**
   * Delete a topic
   */
  async function deleteTopic(
    gradeLevelId: string,
    subjectId: string,
    topicId: string,
  ): Promise<{ success: boolean; error: string | null }> {
    try {
      const { error: deleteError } = await supabase.from('topics').delete().eq('id', topicId)

      if (deleteError) throw deleteError

      // Remove from local state and rebuild maps (cascade removes subtopics)
      const gradeLevel = gradeLevels.value.find((g) => g.id === gradeLevelId)
      const subject = gradeLevel?.subjects.find((s) => s.id === subjectId)
      if (subject) {
        const index = subject.topics.findIndex((t) => t.id === topicId)
        if (index !== -1) {
          subject.topics.splice(index, 1)
          // Rebuild all maps to remove cascaded items
          buildLookupMaps()
        }
      }

      return { success: true, error: null }
    } catch (err) {
      console.error('Error deleting topic:', err)
      const message = handleError(err, 'Failed to delete topic.')
      return { success: false, error: message }
    }
  }

  /**
   * Add a new sub_topic
   */
  async function addSubTopic(
    gradeLevelId: string,
    subjectId: string,
    topicId: string,
    name: string,
    coverImagePath?: string,
  ): Promise<{ success: boolean; error: string | null; id?: string }> {
    try {
      const gradeLevel = gradeLevels.value.find((g) => g.id === gradeLevelId)
      const subject = gradeLevel?.subjects.find((s) => s.id === subjectId)
      const topic = subject?.topics.find((t) => t.id === topicId)
      if (!topic) {
        return { success: false, error: 'Topic not found' }
      }

      // Get max display order for this topic
      const maxOrder = Math.max(0, ...topic.subTopics.map((st) => st.displayOrder))

      const { data, error: insertError } = await supabase
        .from('sub_topics')
        .insert({
          topic_id: topicId,
          name,
          cover_image_path: coverImagePath ?? null,
          display_order: maxOrder + 1,
        })
        .select()
        .single()

      if (insertError) throw insertError

      // Add to local state
      const newSubTopic: SubTopic = {
        id: data.id,
        name: data.name,
        coverImagePath: data.cover_image_path,
        displayOrder: data.display_order ?? 0,
        topicId: data.topic_id,
        questionCount: 0,
      }
      topic.subTopics.push(newSubTopic)

      // Update lookup maps (gradeLevel/subject already available from earlier lookup)
      if (gradeLevel && subject && topic) {
        subTopicMap.value.set(newSubTopic.id, newSubTopic)
        subTopicHierarchyMap.value.set(newSubTopic.id, {
          subTopic: newSubTopic,
          topic,
          subject,
          gradeLevel,
        })
      }

      return { success: true, error: null, id: data.id }
    } catch (err) {
      console.error('Error adding sub_topic:', err)
      const message = handleError(err, 'Failed to add sub-topic.')
      return { success: false, error: message }
    }
  }

  /**
   * Update a sub_topic
   */
  async function updateSubTopic(
    gradeLevelId: string,
    subjectId: string,
    topicId: string,
    subTopicId: string,
    updates: { name?: string; coverImagePath?: string | null },
  ): Promise<{ success: boolean; error: string | null }> {
    try {
      const updateData: { name?: string; cover_image_path?: string | null } = {}
      if (updates.name !== undefined) updateData.name = updates.name
      if (updates.coverImagePath !== undefined) updateData.cover_image_path = updates.coverImagePath

      const { error: updateError } = await supabase
        .from('sub_topics')
        .update(updateData)
        .eq('id', subTopicId)

      if (updateError) throw updateError

      // Update local state
      const gradeLevel = gradeLevels.value.find((g) => g.id === gradeLevelId)
      const subject = gradeLevel?.subjects.find((s) => s.id === subjectId)
      const topic = subject?.topics.find((t) => t.id === topicId)
      const subTopic = topic?.subTopics.find((st) => st.id === subTopicId)
      if (subTopic) {
        if (updates.name !== undefined) subTopic.name = updates.name
        if (updates.coverImagePath !== undefined) subTopic.coverImagePath = updates.coverImagePath
      }

      return { success: true, error: null }
    } catch (err) {
      console.error('Error updating sub_topic:', err)
      const message = handleError(err, 'Failed to update sub-topic.')
      return { success: false, error: message }
    }
  }

  /**
   * Update sub_topic cover image (convenience method)
   */
  async function updateSubTopicCoverImage(
    gradeLevelId: string,
    subjectId: string,
    topicId: string,
    subTopicId: string,
    coverImagePath: string | null,
  ): Promise<{ success: boolean; error: string | null }> {
    return updateSubTopic(gradeLevelId, subjectId, topicId, subTopicId, { coverImagePath })
  }

  /**
   * Delete a sub_topic
   */
  async function deleteSubTopic(
    gradeLevelId: string,
    subjectId: string,
    topicId: string,
    subTopicId: string,
  ): Promise<{ success: boolean; error: string | null }> {
    try {
      const { error: deleteError } = await supabase.from('sub_topics').delete().eq('id', subTopicId)

      if (deleteError) throw deleteError

      // Remove from local state and maps
      const gradeLevel = gradeLevels.value.find((g) => g.id === gradeLevelId)
      const subject = gradeLevel?.subjects.find((s) => s.id === subjectId)
      const topic = subject?.topics.find((t) => t.id === topicId)
      if (topic) {
        const index = topic.subTopics.findIndex((st) => st.id === subTopicId)
        if (index !== -1) {
          topic.subTopics.splice(index, 1)
          // Remove from maps
          subTopicMap.value.delete(subTopicId)
          subTopicHierarchyMap.value.delete(subTopicId)
        }
      }

      return { success: true, error: null }
    } catch (err) {
      console.error('Error deleting sub_topic:', err)
      const message = handleError(err, 'Failed to delete sub-topic.')
      return { success: false, error: message }
    }
  }

  /**
   * Upload an image to Supabase storage
   */
  async function uploadCurriculumImage(
    file: File,
    type: 'subject' | 'topic' | 'subtopic',
    id: string,
    oldPath?: string | null,
  ): Promise<{ success: boolean; path: string | null; error: string | null }> {
    try {
      const fileExt = file.name.split('.').pop()
      // For subtopic, store in subtopics folder
      const folder = type === 'subtopic' ? 'subtopics' : `${type}s`
      const filePath = `${folder}/${crypto.randomUUID()}.${fileExt}`

      const { error: uploadError } = await supabase.storage
        .from('curriculum-images')
        .upload(filePath, file, {
          cacheControl: '31536000', // 1 year cache for CDN
        })

      if (uploadError) throw uploadError

      // Best-effort cleanup of old file (don't block the upload result)
      if (oldPath) {
        supabase.storage
          .from('curriculum-images')
          .remove([oldPath])
          .catch(() => {})
      }

      return { success: true, path: filePath, error: null }
    } catch (err) {
      console.error('Error uploading image:', err)
      const message = handleError(err, 'Failed to upload image.')
      return { success: false, path: null, error: message }
    }
  }

  function getCurriculumImageUrl(path: string | null, transform?: ImageTransformOptions): string {
    return getStorageImageUrl('curriculum-images', path, transform)
  }

  /**
   * Get optimized image URL for curriculum display (cards)
   */
  function getOptimizedImageUrl(path: string | null): string {
    return getCurriculumImageUrl(path, { width: 800, quality: 80 })
  }

  // ============================================
  // O(1) Lookup Helpers (using pre-built maps)
  // ============================================

  // Helper to find a grade level by ID - O(1)
  function getGradeLevelById(id: string): GradeLevel | undefined {
    return gradeLevelMap.value.get(id)
  }

  // Helper to find a subject by ID - O(1)
  function getSubjectById(subjectId: string): Subject | undefined {
    return subjectMap.value.get(subjectId)
  }

  // Helper to find a topic by ID - O(1)
  function getTopicById(topicId: string): Topic | undefined {
    return topicMap.value.get(topicId)
  }

  // Get topic with full hierarchy info - O(1)
  function getTopicWithHierarchy(topicId: string): TopicWithHierarchy | null {
    return topicHierarchyMap.value.get(topicId) ?? null
  }

  // Helper to find a sub_topic by ID - O(1)
  function getSubTopicById(subTopicId: string): SubTopic | undefined {
    return subTopicMap.value.get(subTopicId)
  }

  // Get sub_topic with full hierarchy info - O(1)
  // (now used by questions/practice stores - major performance improvement)
  function getSubTopicWithHierarchy(subTopicId: string): SubTopicWithHierarchy | null {
    return subTopicHierarchyMap.value.get(subTopicId) ?? null
  }

  // Admin CurriculumPage navigation setters
  function setAdminCurriculumGradeLevel(gradeLevelId: string | null) {
    adminCurriculumNavigation.value.selectedGradeLevelId = gradeLevelId
    // Reset dependent selections when grade level changes
    if (gradeLevelId === null) {
      adminCurriculumNavigation.value.selectedSubjectId = null
      adminCurriculumNavigation.value.selectedTopicId = null
    }
  }

  function setAdminCurriculumSubject(subjectId: string | null) {
    adminCurriculumNavigation.value.selectedSubjectId = subjectId
    // Reset dependent selection when subject changes
    if (subjectId === null) {
      adminCurriculumNavigation.value.selectedTopicId = null
    }
  }

  function setAdminCurriculumTopic(topicId: string | null) {
    adminCurriculumNavigation.value.selectedTopicId = topicId
  }

  function resetAdminCurriculumNavigation() {
    adminCurriculumNavigation.value = {
      selectedGradeLevelId: null,
      selectedSubjectId: null,
      selectedTopicId: null,
    }
  }

  return {
    // State
    gradeLevels,
    isLoading,
    error,

    // Admin CurriculumPage navigation state
    adminCurriculumNavigation,
    setAdminCurriculumGradeLevel,
    setAdminCurriculumSubject,
    setAdminCurriculumTopic,
    resetAdminCurriculumNavigation,

    // Actions
    fetchCurriculum,
    addGradeLevel,
    updateGradeLevel,
    deleteGradeLevel,
    addSubject,
    updateSubject,
    updateSubjectCoverImage,
    deleteSubject,
    addTopic,
    updateTopic,
    updateTopicCoverImage,
    deleteTopic,
    addSubTopic,
    updateSubTopic,
    updateSubTopicCoverImage,
    deleteSubTopic,
    uploadCurriculumImage,
    getCurriculumImageUrl,
    getOptimizedImageUrl,

    // Helpers
    getGradeLevelById,
    getSubjectById,
    getTopicById,
    getTopicWithHierarchy,
    getSubTopicById,
    getSubTopicWithHierarchy,

    $reset() {
      gradeLevels.value = []
      allSubjects.value = []
      allTopics.value = []
      allSubTopics.value = []
      isLoading.value = false
      error.value = null
      lastFetched.value = null
      gradeLevelMap.value.clear()
      subjectMap.value.clear()
      topicMap.value.clear()
      subTopicMap.value.clear()
      subTopicHierarchyMap.value.clear()
      topicHierarchyMap.value.clear()
      resetAdminCurriculumNavigation()
    },
  }
})
