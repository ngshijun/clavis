<script setup lang="ts">
import { ref, h, onMounted } from 'vue'
import type { ColumnDef } from '@tanstack/vue-table'
import { useAdminOrganizationsStore, type Organization } from '@/stores/admin-organizations'
import {
  Search,
  Plus,
  Loader2,
  Building2,
  ArrowUpDown,
  MoreHorizontal,
  Pencil,
  UserPlus,
} from 'lucide-vue-next'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/ui/data-table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import OrganizationFormDialog from '@/components/admin/OrganizationFormDialog.vue'
import OrganizationManagersDialog from '@/components/admin/OrganizationManagersDialog.vue'
import ManagerFormDialog from '@/components/admin/ManagerFormDialog.vue'
import { toast } from 'vue-sonner'
import { formatDate } from '@/lib/date'
import { useT } from '@/composables/useT'

const t = useT()
const organizationsStore = useAdminOrganizationsStore()

onMounted(async () => {
  if (organizationsStore.organizations.length === 0 && !organizationsStore.isLoading) {
    const { error } = await organizationsStore.fetchOrganizations()
    if (error) {
      toast.error(t.value.admin.organizations.toastLoadFailed)
    }
  }
})

// Create / rename dialog
const showFormDialog = ref(false)
const editingOrganization = ref<Organization | null>(null)

function openCreateDialog() {
  editingOrganization.value = null
  showFormDialog.value = true
}

function openRenameDialog(organization: Organization) {
  editingOrganization.value = organization
  showFormDialog.value = true
}

// Managers dialog
const showManagersDialog = ref(false)
const selectedOrganization = ref<Organization | null>(null)

function openManagersDialog(organization: Organization) {
  selectedOrganization.value = organization
  showManagersDialog.value = true
}

// Create manager dialog
const showManagerFormDialog = ref(false)

function openManagerFormDialog(organization: Organization) {
  selectedOrganization.value = organization
  showManagersDialog.value = false
  showManagerFormDialog.value = true
}

async function handleManagerCreated() {
  await organizationsStore.fetchOrganizations()
}

const columns: ColumnDef<Organization>[] = [
  {
    accessorKey: 'name',
    header: ({ column }) => {
      return h(
        Button,
        {
          variant: 'ghost',
          onClick: () => column.toggleSorting(column.getIsSorted() === 'asc'),
        },
        () => [t.value.admin.organizations.nameCol, h(ArrowUpDown, { class: 'ml-2 size-4' })],
      )
    },
    cell: ({ row }) => h('div', { class: 'font-medium' }, row.original.name),
  },
  {
    id: 'managers',
    header: () => t.value.admin.organizations.managersCol,
    cell: ({ row }) => {
      const managers = row.original.managers
      if (managers.length === 0) {
        return h(
          'span',
          { class: 'text-sm text-muted-foreground' },
          t.value.admin.organizations.noManagers,
        )
      }
      return h('div', {}, [
        h(
          'div',
          { class: 'font-medium' },
          t.value.admin.organizations.managerCount(managers.length),
        ),
        h(
          'div',
          { class: 'truncate text-sm text-muted-foreground' },
          managers.map((manager) => manager.name).join(', '),
        ),
      ])
    },
  },
  {
    accessorKey: 'createdAt',
    header: ({ column }) => {
      return h(
        Button,
        {
          variant: 'ghost',
          onClick: () => column.toggleSorting(column.getIsSorted() === 'asc'),
        },
        () => [t.value.admin.organizations.createdCol, h(ArrowUpDown, { class: 'ml-2 size-4' })],
      )
    },
    cell: ({ row }) => h('div', {}, formatDate(row.original.createdAt)),
  },
  {
    id: 'actions',
    header: '',
    cell: ({ row }) => {
      const organization = row.original
      return h(
        DropdownMenu,
        {},
        {
          default: () => [
            h(DropdownMenuTrigger, { asChild: true }, () =>
              h(
                Button,
                {
                  variant: 'ghost',
                  size: 'icon',
                  class: 'size-6',
                  onClick: (event: Event) => event.stopPropagation(),
                },
                () => h(MoreHorizontal, { class: 'size-4' }),
              ),
            ),
            h(DropdownMenuContent, { align: 'end' }, () => [
              h(
                DropdownMenuItem,
                {
                  onClick: (event: Event) => {
                    event.stopPropagation()
                    openRenameDialog(organization)
                  },
                },
                () => [h(Pencil, { class: 'mr-2 size-4' }), t.value.admin.organizations.rename],
              ),
              h(
                DropdownMenuItem,
                {
                  onClick: (event: Event) => {
                    event.stopPropagation()
                    openManagerFormDialog(organization)
                  },
                },
                () => [
                  h(UserPlus, { class: 'mr-2 size-4' }),
                  t.value.admin.organizations.addManager,
                ],
              ),
            ]),
          ],
        },
      )
    },
  },
]
</script>

<template>
  <div class="p-6">
    <div class="mb-6 flex items-center justify-end">
      <Button :disabled="organizationsStore.isLoading" @click="openCreateDialog">
        <Plus class="mr-2 size-4" />
        {{ t.admin.organizations.addOrganizationBtn }}
      </Button>
    </div>

    <!-- Loading State -->
    <div v-if="organizationsStore.isLoading" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <template v-else>
      <!-- Search Bar -->
      <div class="mb-4">
        <div class="relative w-[400px]">
          <Search class="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            :model-value="organizationsStore.filters.search"
            :placeholder="t.admin.organizations.searchPlaceholder"
            class="pl-9"
            @update:model-value="organizationsStore.setSearch(String($event))"
          />
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="organizationsStore.filteredOrganizations.length === 0" class="py-16 text-center">
        <Building2 class="mx-auto size-16 text-muted-foreground/50" />
        <p class="mt-4 text-muted-foreground">{{ t.admin.organizations.noOrganizations }}</p>
      </div>

      <!-- Data Table -->
      <DataTable
        v-else
        :columns="columns"
        :data="organizationsStore.filteredOrganizations"
        :on-row-click="openManagersDialog"
        :page-index="organizationsStore.pagination.pageIndex"
        :page-size="organizationsStore.pagination.pageSize"
        :on-page-index-change="organizationsStore.setPageIndex"
        :on-page-size-change="organizationsStore.setPageSize"
      />
    </template>

    <!-- Create / Rename Organization -->
    <OrganizationFormDialog v-model:open="showFormDialog" :organization="editingOrganization" />

    <!-- Managers of an organization -->
    <OrganizationManagersDialog
      v-model:open="showManagersDialog"
      :organization="selectedOrganization"
      @add-manager="selectedOrganization && openManagerFormDialog(selectedOrganization)"
    />

    <!-- Create Manager -->
    <ManagerFormDialog
      v-model:open="showManagerFormDialog"
      :organization="selectedOrganization"
      @created="handleManagerCreated"
    />
  </div>
</template>
