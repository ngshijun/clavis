import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { handleError } from '@/lib/errors'

export interface Tag {
  id: string
  name: string
  /** Number of questions carrying this tag (from the list embed). */
  questionCount: number
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
        .select('id, name, created_at, question_tags(count)')
        .order('name')

      if (fetchError) throw fetchError

      tags.value = (data ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        questionCount: (row.question_tags as { count: number }[])[0]?.count ?? 0,
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
   * Create a tag (name normalized to lower+trim before insert). If the
   * normalized name already exists (unique violation), the existing tag is
   * returned instead — "create" in the picker is always safe to retry.
   */
  async function createTag(name: string): Promise<{ tag: Tag | null; error: string | null }> {
    const normalized = normalizeTagName(name)
    if (!normalized) return { tag: null, error: handleError(null, 'failedCreateTag') }

    const existing = tags.value.find((tag) => tag.name === normalized)
    if (existing) return { tag: existing, error: null }

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
            createdAt: existingRow.created_at,
          }
          tags.value = [...tags.value.filter((t) => t.id !== tag.id), tag].sort((a, b) =>
            a.name.localeCompare(b.name),
          )
          return { tag, error: null }
        }
        throw insertError
      }

      const tag: Tag = {
        id: data.id,
        name: data.name,
        questionCount: 0,
        createdAt: data.created_at,
      }
      tags.value = [...tags.value, tag].sort((a, b) => a.name.localeCompare(b.name))
      return { tag, error: null }
    } catch (err) {
      return { tag: null, error: handleError(err, 'failedCreateTag') }
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
    renameTag,
    deleteTag,
    $reset,
  }
})
