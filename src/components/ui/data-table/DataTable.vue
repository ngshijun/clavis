<script setup lang="ts" generic="TData, TValue">
import type {
  ColumnDef,
  SortingState,
  ColumnFiltersState,
  PaginationState,
} from '@tanstack/vue-table'
import {
  FlexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useVueTable,
} from '@tanstack/vue-table'
import { ref, computed, watch } from 'vue'
import { valueUpdater } from '@/lib/utils'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-vue-next'

const props = defineProps<{
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  searchColumn?: string
  searchValue?: string
  onRowClick?: (row: TData) => void
  // Optional initial sorting state
  initialSorting?: SortingState
  // Optional external pagination state
  pageIndex?: number
  pageSize?: number
  onPageIndexChange?: (index: number) => void
  onPageSizeChange?: (size: number) => void
  // Server-side pagination: when true, pagination is handled externally
  manualPagination?: boolean
  // Total row count for server-side pagination
  rowCount?: number
}>()

const sorting = ref<SortingState>(props.initialSorting ?? [])
const columnFilters = ref<ColumnFiltersState>([])

// Internal pagination state (used when external state is not provided)
const internalPagination = ref<PaginationState>({
  pageIndex: 0,
  pageSize: 10,
})

// Use external pagination if provided, otherwise use internal
const pagination = computed<PaginationState>(() => ({
  pageIndex: props.pageIndex ?? internalPagination.value.pageIndex,
  pageSize: props.pageSize ?? internalPagination.value.pageSize,
}))

// Sync internal state with external props when they change
watch(
  () => props.pageIndex,
  (newIndex) => {
    if (newIndex !== undefined) {
      internalPagination.value.pageIndex = newIndex
    }
  },
)

watch(
  () => props.pageSize,
  (newSize) => {
    if (newSize !== undefined) {
      internalPagination.value.pageSize = newSize
    }
  },
)

const table = useVueTable({
  get data() {
    return props.data
  },
  get columns() {
    return props.columns
  },
  getCoreRowModel: getCoreRowModel(),
  ...(props.manualPagination ? {} : { getPaginationRowModel: getPaginationRowModel() }),
  getSortedRowModel: getSortedRowModel(),
  getFilteredRowModel: getFilteredRowModel(),
  manualPagination: props.manualPagination,
  get rowCount() {
    return props.rowCount
  },
  onSortingChange: (updaterOrValue) => valueUpdater(updaterOrValue, sorting),
  onColumnFiltersChange: (updaterOrValue) => valueUpdater(updaterOrValue, columnFilters),
  onPaginationChange: (updaterOrValue) => {
    const newPagination =
      typeof updaterOrValue === 'function' ? updaterOrValue(pagination.value) : updaterOrValue

    // Update internal state
    internalPagination.value = newPagination

    // Notify parent if callbacks provided
    if (props.onPageIndexChange && newPagination.pageIndex !== pagination.value.pageIndex) {
      props.onPageIndexChange(newPagination.pageIndex)
    }
    if (props.onPageSizeChange && newPagination.pageSize !== pagination.value.pageSize) {
      props.onPageSizeChange(newPagination.pageSize)
    }
  },
  state: {
    get sorting() {
      return sorting.value
    },
    get columnFilters() {
      return columnFilters.value
    },
    get pagination() {
      return pagination.value
    },
  },
  globalFilterFn: 'includesString',
})

// Watch for search value changes from parent
if (props.searchColumn) {
  table.getColumn(props.searchColumn)?.setFilterValue(props.searchValue ?? '')
}

defineExpose({ table })
</script>

<template>
  <div>
    <div class="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
            <TableHead
              v-for="header in headerGroup.headers"
              :key="header.id"
              :style="{
                width: header.column.columnDef.size
                  ? `${header.column.columnDef.size}px`
                  : undefined,
                minWidth: header.column.columnDef.minSize
                  ? `${header.column.columnDef.minSize}px`
                  : undefined,
                maxWidth: header.column.columnDef.maxSize
                  ? `${header.column.columnDef.maxSize}px`
                  : undefined,
              }"
            >
              <FlexRender
                v-if="!header.isPlaceholder"
                :render="header.column.columnDef.header"
                :props="header.getContext()"
              />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <template v-if="table.getRowModel().rows?.length">
            <TableRow
              v-for="row in table.getRowModel().rows"
              :key="row.id"
              :data-state="row.getIsSelected() ? 'selected' : undefined"
              :class="{ 'cursor-pointer hover:bg-muted/50': !!props.onRowClick }"
              @click="props.onRowClick?.(row.original)"
            >
              <TableCell v-for="cell in row.getVisibleCells()" :key="cell.id">
                <FlexRender :render="cell.column.columnDef.cell" :props="cell.getContext()" />
              </TableCell>
            </TableRow>
          </template>
          <template v-else>
            <TableRow>
              <TableCell :colspan="columns.length" class="h-24 text-center">
                No results.
              </TableCell>
            </TableRow>
          </template>
        </TableBody>
      </Table>
    </div>

    <!-- Pagination -->
    <div class="flex items-center justify-between px-2 py-4">
      <div class="text-sm text-muted-foreground">
        {{
          props.manualPagination ? (props.rowCount ?? 0) : table.getFilteredRowModel().rows.length
        }}
        row(s) total.
      </div>
      <div class="flex items-center space-x-6 lg:space-x-8">
        <div class="flex items-center space-x-2">
          <p class="text-sm font-medium">Rows per page</p>
          <Select
            :model-value="`${table.getState().pagination.pageSize}`"
            @update:model-value="(value) => table.setPageSize(Number(value))"
          >
            <SelectTrigger class="h-8 w-[70px]">
              <SelectValue :placeholder="`${table.getState().pagination.pageSize}`" />
            </SelectTrigger>
            <SelectContent side="top">
              <SelectItem
                v-for="pageSize in [10, 20, 30, 40, 50]"
                :key="pageSize"
                :value="`${pageSize}`"
              >
                {{ pageSize }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div class="flex w-[100px] items-center justify-center text-sm font-medium">
          Page {{ table.getState().pagination.pageIndex + 1 }} of {{ table.getPageCount() }}
        </div>
        <div class="flex items-center space-x-2">
          <Button
            variant="outline"
            class="hidden size-8 p-0 lg:flex"
            :disabled="!table.getCanPreviousPage()"
            @click="table.setPageIndex(0)"
          >
            <span class="sr-only">Go to first page</span>
            <ChevronsLeft class="size-4" />
          </Button>
          <Button
            variant="outline"
            class="size-8 p-0"
            :disabled="!table.getCanPreviousPage()"
            @click="table.previousPage()"
          >
            <span class="sr-only">Go to previous page</span>
            <ChevronLeft class="size-4" />
          </Button>
          <Button
            variant="outline"
            class="size-8 p-0"
            :disabled="!table.getCanNextPage()"
            @click="table.nextPage()"
          >
            <span class="sr-only">Go to next page</span>
            <ChevronRight class="size-4" />
          </Button>
          <Button
            variant="outline"
            class="hidden size-8 p-0 lg:flex"
            :disabled="!table.getCanNextPage()"
            @click="table.setPageIndex(table.getPageCount() - 1)"
          >
            <span class="sr-only">Go to last page</span>
            <ChevronsRight class="size-4" />
          </Button>
        </div>
      </div>
    </div>
  </div>
</template>
