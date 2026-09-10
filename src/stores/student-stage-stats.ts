import { defineStore } from 'pinia'
import { ref } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAuthStore } from './auth'
import { handleError, errorMessages } from '@/lib/errors'
import type { StageStats } from '@/lib/learningMap'

/**
 * The signed-in student's `student_stage_stats` rows, keyed by stage_id.
 * Read-only on the client — rows are written exclusively by the
 * `submit_practice_session` RPC. A fetch failure is non-fatal: the learning
 * map renders with every node defaulting to not-started.
 */
export const useStudentStageStatsStore = defineStore('studentStageStats', () => {
  const statsByStageId = ref<Map<string, StageStats>>(new Map())
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
        .from('student_stage_stats')
        .select('stage_id, best_score_percent, sessions_completed, last_completed_at')
        .eq('student_id', studentId)

      if (fetchError) throw fetchError

      const map = new Map<string, StageStats>()
      for (const row of data ?? []) {
        map.set(row.stage_id, {
          bestScorePercent: row.best_score_percent,
          sessionsCompleted: row.sessions_completed,
          lastCompletedAt: row.last_completed_at,
        })
      }
      statsByStageId.value = map

      return { error: null }
    } catch (err) {
      const message = handleError(err, 'failedFetchStageStats')
      error.value = message
      return { error: message }
    } finally {
      isLoading.value = false
    }
  }

  function getStats(stageId: string): StageStats | null {
    return statsByStageId.value.get(stageId) ?? null
  }

  function $reset() {
    statsByStageId.value = new Map()
    isLoading.value = false
    error.value = null
  }

  return {
    statsByStageId,
    isLoading,
    error,
    fetchStats,
    getStats,
    $reset,
  }
})
