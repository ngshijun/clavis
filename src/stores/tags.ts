import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { handleError } from '@/lib/errors'

export interface Tag {
  id: string
  name: string
  /** Number of questions carrying this tag (from the list embed). */
  questionCount: number
  /**
   * The topics this learning point applies to (P19a). A tag picker in the
   * context of a topic offers only the tags linked to it, so a tag with no
   * topics here is offered nowhere. The topic is the level practice and
   * assessment share, so one scope serves both.
   */
  topicIds: string[]
  createdAt: string
}

/**
 * The DB CHECK on `tags.name` rejects anything that is not lowercased and
 * trimmed — every write path MUST normalize first (P7a decision 57).
 */
export function normalizeTagName(name: string): string {
  return name.trim().toLowerCase()
}

/**
 * Platform-global learning-point vocabulary. Readable by all authenticated
 * users (the picker); writes are RLS-gated to admin.
 */
export const useTagsStore = defineStore('tags', () => {
  const tags = ref<Tag[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function fetchTags(): Promise<{ error: string | null }> {
    isLoading.value = true
    error.value = null

    try {
      const { data, error: fetchError } = await supabase
        .from('tags')
        .select('id, name, created_at, question_tags(count), tag_topics(topic_id)')
        .order('name')

      if (fetchError) throw fetchError

      tags.value = (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        questionCount: (row.question_tags as { count: number }[])[0]?.count ?? 0,
        topicIds: row.tag_topics.map((link) => link.topic_id),
        createdAt: row.created_at,
      }))

      return { error: null }
    } catch (err) {
      const message = handleError(err, 'failedFetchTags')
      error.value = message
      return { error: message }
    } finally {
      isLoading.value = false
    }
  }

  /**
   * Create a tag (name normalized to lower+trim before insert), scoped to
   * `topicIds` — a learning point nobody can pick is useless, so the scope is
   * written with it. If the normalized name already exists (unique
   * violation), the existing tag is returned instead and its scope widened to
   * cover the requested topics: "create" in a picker is always safe to retry,
   * and always yields a tag that picker can offer.
   */
  async function createTag(
    name: string,
    topicIds: string[],
  ): Promise<{ tag: Tag | null; error: string | null }> {
    const normalized = normalizeTagName(name)
    if (!normalized) return { tag: null, error: handleError(null, 'failedCreateTag') }

    const existing = tags.value.find((tag) => tag.name === normalized)
    if (existing) {
      const widened = [...new Set([...existing.topicIds, ...topicIds])]
      if (widened.length > existing.topicIds.length) {
        const { error: linkError } = await setTagTopics(existing.id, widened)
        if (linkError) return { tag: null, error: linkError }
      }
      return { tag: existing, error: null }
    }

    try {
      const { data, error: insertError } = await supabase
        .from('tags')
        .insert({ name: normalized })
        .select('id, name, created_at')
        .single()

      if (insertError) {
        // Unique violation: someone created it concurrently — reuse it
        if (insertError.code === '23505') {
          const { data: existingRow, error: fetchError } = await supabase
            .from('tags')
            .select('id, name, created_at')
            .eq('name', normalized)
            .single()
          if (fetchError) throw fetchError
          const tag: Tag = {
            id: existingRow.id,
            name: existingRow.name,
            questionCount: 0,
            topicIds: [],
            createdAt: existingRow.created_at,
          }
          tags.value = [...tags.value.filter((t) => t.id !== tag.id), tag].sort((a, b) =>
            a.name.localeCompare(b.name),
          )

          const { error: linkError } = await setTagTopics(tag.id, topicIds)
          if (linkError) return { tag: null, error: linkError }

          return { tag, error: null }
        }
        throw insertError
      }

      const tag: Tag = {
        id: data.id,
        name: data.name,
        questionCount: 0,
        topicIds: [],
        createdAt: data.created_at,
      }
      tags.value = [...tags.value, tag].sort((a, b) => a.name.localeCompare(b.name))

      const { error: linkError } = await setTagTopics(tag.id, topicIds)
      if (linkError) return { tag: null, error: linkError }

      return { tag, error: null }
    } catch (err) {
      return { tag: null, error: handleError(err, 'failedCreateTag') }
    }
  }

  /**
   * Replace a tag's topic scope with exactly `topicIds`. Written as a delete
   * of what went and an insert of what came, so re-saving an unchanged scope
   * is a no-op rather than a churn of rows.
   */
  async function setTagTopics(id: string, topicIds: string[]): Promise<{ error: string | null }> {
    const tag = tags.value.find((candidate) => candidate.id === id)
    const current = tag?.topicIds ?? []
    const next = [...new Set(topicIds)]
    const removed = current.filter((topicId) => !next.includes(topicId))
    const added = next.filter((topicId) => !current.includes(topicId))

    try {
      if (removed.length > 0) {
        const { error: deleteError } = await supabase
          .from('tag_topics')
          .delete()
          .eq('tag_id', id)
          .in('topic_id', removed)
        if (deleteError) throw deleteError
      }

      if (added.length > 0) {
        const { error: insertError } = await supabase
          .from('tag_topics')
          .insert(added.map((topicId) => ({ tag_id: id, topic_id: topicId })))
        if (insertError) throw insertError
      }

      if (tag) tag.topicIds = next
      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedUpdateTag') }
    }
  }

  async function renameTag(id: string, name: string): Promise<{ error: string | null }> {
    const normalized = normalizeTagName(name)
    if (!normalized) return { error: handleError(null, 'failedUpdateTag') }

    try {
      const { error: updateError } = await supabase
        .from('tags')
        .update({ name: normalized })
        .eq('id', id)

      if (updateError) throw updateError

      const tag = tags.value.find((t) => t.id === id)
      if (tag) tag.name = normalized
      tags.value = [...tags.value].sort((a, b) => a.name.localeCompare(b.name))
      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedUpdateTag') }
    }
  }

  /** Deleting a tag cascades its question_tags rows (untags every question). */
  async function deleteTag(id: string): Promise<{ error: string | null }> {
    try {
      const { error: deleteError } = await supabase.from('tags').delete().eq('id', id)

      if (deleteError) throw deleteError

      tags.value = tags.value.filter((t) => t.id !== id)
      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedDeleteTag') }
    }
  }

  function $reset() {
    tags.value = []
    isLoading.value = false
    error.value = null
  }

  return {
    tags,
    isLoading,
    error,
    fetchTags,
    createTag,
    setTagTopics,
    renameTag,
    deleteTag,
    $reset,
  }
})
