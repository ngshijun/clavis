import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { handleError } from '@/lib/errors'

export interface OrganizationManager {
  id: string
  name: string
  email: string
  joinedAt: string | null
}

export interface Organization {
  id: string
  name: string
  createdAt: string
  managers: OrganizationManager[]
}

/**
 * Platform-admin view of tenancy: the organizations (tuition centers) on the
 * platform and the managing accounts attached to each one.
 */
export const useAdminOrganizationsStore = defineStore('adminOrganizations', () => {
  const organizations = ref<Organization[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const filters = ref({ search: '' })
  const pagination = ref({ pageIndex: 0, pageSize: 10 })

  const filteredOrganizations = computed(() => {
    const query = filters.value.search.toLowerCase().trim()
    if (!query) return organizations.value

    return organizations.value.filter(
      (organization) =>
        organization.name.toLowerCase().includes(query) ||
        organization.managers.some(
          (manager) =>
            manager.name.toLowerCase().includes(query) ||
            manager.email.toLowerCase().includes(query),
        ),
    )
  })

  /**
   * Fetch every organization with its managers (two queries, grouped locally —
   * the manager set is small and this keeps one row per organization).
   */
  async function fetchOrganizations(): Promise<{ error: string | null }> {
    isLoading.value = true
    error.value = null

    try {
      const [{ data: orgRows, error: orgError }, { data: managerRows, error: managerError }] =
        await Promise.all([
          supabase.from('organizations').select('id, name, created_at').order('name'),
          supabase
            .from('profiles')
            .select('id, name, email, created_at, organization_id')
            .eq('user_type', 'manager')
            .order('name'),
        ])

      if (orgError) throw orgError
      if (managerError) throw managerError

      const managersByOrg = new Map<string, OrganizationManager[]>()
      for (const manager of managerRows ?? []) {
        if (!manager.organization_id) continue
        const list = managersByOrg.get(manager.organization_id) ?? []
        list.push({
          id: manager.id,
          name: manager.name,
          email: manager.email,
          joinedAt: manager.created_at,
        })
        managersByOrg.set(manager.organization_id, list)
      }

      organizations.value = (orgRows ?? []).map((organization) => ({
        id: organization.id,
        name: organization.name,
        createdAt: organization.created_at,
        managers: managersByOrg.get(organization.id) ?? [],
      }))

      return { error: null }
    } catch (err) {
      const message = handleError(err, 'failedFetchOrganizations')
      error.value = message
      return { error: message }
    } finally {
      isLoading.value = false
    }
  }

  async function createOrganization(name: string): Promise<{ error: string | null }> {
    try {
      const { data, error: insertError } = await supabase
        .from('organizations')
        .insert({ name })
        .select('id, name, created_at')
        .single()

      if (insertError) throw insertError

      organizations.value.push({
        id: data.id,
        name: data.name,
        createdAt: data.created_at,
        managers: [],
      })
      organizations.value.sort((a, b) => a.name.localeCompare(b.name))

      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedCreateOrganization') }
    }
  }

  async function renameOrganization(id: string, name: string): Promise<{ error: string | null }> {
    try {
      const { error: updateError } = await supabase
        .from('organizations')
        .update({ name })
        .eq('id', id)

      if (updateError) throw updateError

      const organization = organizations.value.find((o) => o.id === id)
      if (organization) organization.name = name
      organizations.value.sort((a, b) => a.name.localeCompare(b.name))

      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'failedUpdateOrganization') }
    }
  }

  function getOrganizationById(id: string): Organization | undefined {
    return organizations.value.find((organization) => organization.id === id)
  }

  function setSearch(value: string) {
    filters.value.search = value
    pagination.value.pageIndex = 0
  }

  function setPageIndex(value: number) {
    pagination.value.pageIndex = value
  }

  function setPageSize(value: number) {
    pagination.value.pageSize = value
    pagination.value.pageIndex = 0
  }

  function $reset() {
    organizations.value = []
    isLoading.value = false
    error.value = null
    filters.value = { search: '' }
    pagination.value = { pageIndex: 0, pageSize: 10 }
  }

  return {
    organizations,
    isLoading,
    error,
    filteredOrganizations,
    filters,
    setSearch,
    pagination,
    setPageIndex,
    setPageSize,
    fetchOrganizations,
    createOrganization,
    renameOrganization,
    getOrganizationById,
    $reset,
  }
})
