import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAuthStore } from './auth'
import { handleError, errorMessages } from '@/lib/errors'
import type { SubTopicStats } from '@/lib/learningMap'

/**
 * The signed-in student's `student_sub_topic_stats` rows, keyed by
 * sub_topic_id. Read-only on the client — rows are written exclusively by
 * the `complete_practice_session` RPC. A fetch failure is non-fatal: the
 * learning map renders with every node defaulting to not-started.
 */
export const useStudentSubTopicStatsStore = defineStore('studentSubTopicStats', () => {
  const statsBySubTopicId = ref<Map<string, SubTopicStats>>(new Map())
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  async function fetchStats(): Promise<{ error: string | null }> {
    const authStore = useAuthStore()
    const studentId = authStore.user?.id
    if (!studentId || authStore.user?.userType !== 'student') {
      return { error: errorMessages().notAStudent }
    }

    isLoading.value = true
    error.value = null

    try {
      const { data, error: fetchError } = await supabase
        .from('student_sub_topic_stats')
        .select('sub_topic_id, best_score_percent, sessions_completed, last_completed_at')
        .eq('student_id', studentId)

      if (fetchError) throw fetchError

      const map = new Map<string, SubTopicStats>()
      for (const row of data ?? []) {
        map.set(row.sub_topic_id, {
          bestScorePercent: row.best_score_percent,
          sessionsCompleted: row.sessions_completed,
          lastCompletedAt: row.last_completed_at,
        })
      }
      statsBySubTopicId.value = map

      return { error: null }
    } catch (err) {
      const message = handleError(err, 'failedFetchSubTopicStats')
      error.value = message
      return { error: message }
    } finally {
      isLoading.value = false
    }
  }

  function getStats(subTopicId: string): SubTopicStats | null {
    return statsBySubTopicId.value.get(subTopicId) ?? null
  }

  function $reset() {
    statsBySubTopicId.value = new Map()
    isLoading.value = false
    error.value = null
  }

  return {
    statsBySubTopicId,
    isLoading,
    error,
    fetchStats,
    getStats,
    $reset,
  }
})
