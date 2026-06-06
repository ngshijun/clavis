import { ref, watch, onScopeDispose } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAuthStore } from '@/stores/auth'

export interface FriendSearchResult {
  id: string
  name: string
  avatarPath: string | null
  friendCode: string
}

const DEBOUNCE_MS = 300
const FRIEND_CODE_PATTERN = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/i

export function useFriendSearch() {
  const authStore = useAuthStore()
  const searchTerm = ref('')
  const results = ref<FriendSearchResult[]>([])
  const isSearching = ref(false)
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let currentVersion = 0

  async function search(query: string) {
    const version = ++currentVersion
    const userId = authStore.user?.id
    if (!userId || !query) {
      results.value = []
      return
    }

    isSearching.value = true
    try {
      // Direct student_profiles reads are blocked by the restricted SELECT policy, so
      // both branches go through SECURITY DEFINER RPCs that return only public-safe
      // columns (never coins/xp/tier). A friend-code-shaped query does an exact lookup;
      // anything else is treated as a partial-name search.
      if (FRIEND_CODE_PATTERN.test(query)) {
        const code = query.toUpperCase()
        const { data, error } = await supabase.rpc('search_student_by_friend_code', {
          p_code: code,
        })
        if (error) throw error
        if (version !== currentVersion) return
        // Exact friend-code match, so the searched code applies to every row.
        results.value = (data ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          avatarPath: row.avatar_path,
          friendCode: code,
        }))
      } else {
        const { data, error } = await supabase.rpc('search_students_by_name', { p_query: query })
        if (error) throw error
        if (version !== currentVersion) return
        results.value = (data ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          avatarPath: row.avatar_path,
          friendCode: row.friend_code,
        }))
      }
    } catch {
      if (version === currentVersion) results.value = []
    } finally {
      if (version === currentVersion) isSearching.value = false
    }
  }

  watch(searchTerm, (value) => {
    if (debounceTimer) clearTimeout(debounceTimer)

    const trimmed = value.trim()
    if (!trimmed) {
      currentVersion++
      results.value = []
      isSearching.value = false
      return
    }

    debounceTimer = setTimeout(() => search(trimmed), DEBOUNCE_MS)
  })

  onScopeDispose(() => {
    if (debounceTimer) clearTimeout(debounceTimer)
  })

  function clear() {
    searchTerm.value = ''
    results.value = []
  }

  return { searchTerm, results, isSearching, clear }
}
