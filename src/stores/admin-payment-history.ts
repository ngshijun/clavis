import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAuthStore } from './auth'
import { handleError, errorMessages } from '@/lib/errors'
import type { Database } from '@/types/database.types'

type SubscriptionTier = Database['public']['Enums']['subscription_tier']

/**
 * Extract a profile `name` from a Supabase embedded relation. The relation
 * may arrive as an object ({ name }) or, depending on the inferred cardinality,
 * a single-element array — validate the shape instead of an unchecked cast.
 */
function extractProfileName(relation: unknown): string | null {
  const profile = Array.isArray(relation) ? relation[0] : relation
  if (typeof profile !== 'object' || profile === null) return null
  const name = (profile as { name?: unknown }).name
  return typeof name === 'string' ? name : null
}

export interface AdminPaymentEntry {
  id: string
  createdAt: string | null
  amountCents: number
  currency: string
  tier: SubscriptionTier | null
  status: string
  description: string | null
  studentName: string | null
  studentId: string | null
  parentName: string | null
}

export const useAdminPaymentHistoryStore = defineStore('adminPaymentHistory', () => {
  const authStore = useAuthStore()

  // State
  const payments = ref<AdminPaymentEntry[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Filter state
  const filters = ref({
    search: '',
  })

  // Pagination state
  const pagination = ref({
    pageIndex: 0,
    pageSize: 10,
  })

  /**
   * Fetch all payment history with student and parent names
   */
  async function fetchPayments(): Promise<{ error: string | null }> {
    if (!authStore.user || !authStore.isAdmin) {
      return { error: errorMessages().notAuthenticatedAsAdmin }
    }

    isLoading.value = true
    error.value = null

    try {
      const BATCH_SIZE = 1000
      const selectQuery = `
          id,
          amount_cents,
          currency,
          status,
          tier,
          description,
          created_at,
          student_id,
          student:profiles!payment_history_student_id_fkey (name),
          parent:profiles!payment_history_parent_id_fkey (name)
        `

      const { data: firstBatch, error: firstError } = await supabase
        .from('payment_history')
        .select(selectQuery)
        .order('created_at', { ascending: false })
        .range(0, BATCH_SIZE - 1)

      if (firstError) throw firstError
      const allRows = [...(firstBatch ?? [])]

      let hasMore = (firstBatch?.length ?? 0) === BATCH_SIZE
      let from = BATCH_SIZE
      while (hasMore) {
        const { data, error: fetchError } = await supabase
          .from('payment_history')
          .select(selectQuery)
          .order('created_at', { ascending: false })
          .range(from, from + BATCH_SIZE - 1)

        if (fetchError) throw fetchError
        allRows.push(...(data ?? []))
        hasMore = (data?.length ?? 0) === BATCH_SIZE
        from += BATCH_SIZE
      }

      payments.value = allRows.map((row) => {
        return {
          id: row.id,
          createdAt: row.created_at,
          amountCents: row.amount_cents,
          currency: row.currency,
          tier: row.tier,
          status: row.status,
          description: row.description,
          studentName: extractProfileName(row.student),
          studentId: row.student_id,
          parentName: extractProfileName(row.parent),
        }
      })

      return { error: null }
    } catch (err) {
      const message = handleError(err, 'failedFetchPaymentHistory')
      error.value = message
      return { error: message }
    } finally {
      isLoading.value = false
    }
  }

  // Filtered payments
  const filteredPayments = computed(() => {
    const searchQuery = filters.value.search.toLowerCase().trim()
    if (!searchQuery) return payments.value

    return payments.value.filter(
      (payment) =>
        (payment.studentName && payment.studentName.toLowerCase().includes(searchQuery)) ||
        (payment.parentName && payment.parentName.toLowerCase().includes(searchQuery)) ||
        (payment.description && payment.description.toLowerCase().includes(searchQuery)) ||
        payment.status.toLowerCase().includes(searchQuery),
    )
  })

  // Filter setters
  function setSearch(value: string) {
    filters.value.search = value
    pagination.value.pageIndex = 0
  }

  // Pagination setters
  function setPageIndex(value: number) {
    pagination.value.pageIndex = value
  }

  function setPageSize(value: number) {
    pagination.value.pageSize = value
    pagination.value.pageIndex = 0
  }

  // Reset store state
  function $reset() {
    payments.value = []
    isLoading.value = false
    error.value = null
    filters.value = { search: '' }
    pagination.value = { pageIndex: 0, pageSize: 10 }
  }

  return {
    // State
    payments,
    isLoading,
    error,

    // Computed
    filteredPayments,

    // Filters
    filters,
    setSearch,

    // Pagination
    pagination,
    setPageIndex,
    setPageSize,

    // Actions
    fetchPayments,
    $reset,
  }
})
