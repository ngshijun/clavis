import { ref, watch } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { SCHOOL_NOT_LISTED_ID } from '@/lib/constants'

type School = { id: string; name: string }

const SEARCH_LIMIT = 50
const DEBOUNCE_MS = 300

// Module-level cache — persists across navigations within the same session
let cachedInitialSchools: School[] | null = null

/**
 * Server-side school search with debounce.
 * Loads an initial batch on first use, then fetches matches as the user types.
 */
export function useSchoolSearch() {
  const schools = ref<School[]>([])
  const searchTerm = ref('')
  const isSearching = ref(false)
  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  let currentVersion = 0

  async function fetchSchools(query: string) {
    const version = ++currentVersion
    isSearching.value = true
    try {
      let builder = supabase
        .from('schools')
        .select('id, name')
        .neq('id', SCHOOL_NOT_LISTED_ID)
        .order('name')
        .limit(SEARCH_LIMIT)

      if (query) {
        builder = builder.ilike('name', `%${query}%`)
      }

      const { data } = await builder
      // Discard stale responses
      if (version !== currentVersion) return
      schools.value = data ?? []

      // Cache the initial (no-query) results
      if (!query && !cachedInitialSchools) {
        cachedInitialSchools = schools.value
      }
    } finally {
      if (version === currentVersion) isSearching.value = false
    }
  }

  // Seed with cached results or fetch
  if (cachedInitialSchools) {
    schools.value = cachedInitialSchools
  } else {
    fetchSchools('')
  }

  watch(searchTerm, (value) => {
    if (debounceTimer) clearTimeout(debounceTimer)

    // Reset to initial results immediately when search is cleared
    if (!value.trim() && cachedInitialSchools) {
      currentVersion++
      schools.value = cachedInitialSchools
      isSearching.value = false
      return
    }

    debounceTimer = setTimeout(() => fetchSchools(value.trim()), DEBOUNCE_MS)
  })

  return { schools, searchTerm, isSearching }
}
