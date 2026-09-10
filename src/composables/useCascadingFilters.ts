import { ref, type Ref } from 'vue'
import type { DateRangeFilter } from '@/lib/sessionFilters'

const ALL_VALUE = '__all__'

interface CascadingFiltersBase {
  gradeLevel: string
  subject: string
  topic: string
  stage: string
}

interface CascadingFiltersWithDateRange extends CascadingFiltersBase {
  dateRange: DateRangeFilter
}

interface CascadingFiltersWithSearch extends CascadingFiltersBase {
  search: string
}

interface CascadingFiltersWithBoth extends CascadingFiltersBase {
  dateRange: DateRangeFilter
  search: string
}

type CascadingFilters =
  | CascadingFiltersBase
  | CascadingFiltersWithDateRange
  | CascadingFiltersWithSearch
  | CascadingFiltersWithBoth

interface Pagination {
  pageIndex: number
  pageSize: number
}

// Map options to the correct filter type
type FilterType<
  D extends DateRangeFilter | undefined,
  S extends boolean,
> = D extends DateRangeFilter
  ? S extends true
    ? CascadingFiltersWithBoth
    : CascadingFiltersWithDateRange
  : S extends true
    ? CascadingFiltersWithSearch
    : CascadingFiltersBase

// Map options to the correct return type
type CascadingFilterReturn<D extends DateRangeFilter | undefined, S extends boolean> = {
  filters: Ref<FilterType<D, S>>
  pagination: Ref<Pagination>
  setGradeLevel: (value: string) => void
  setSubject: (value: string) => void
  setTopic: (value: string) => void
  setStage: (value: string) => void
  setPageIndex: (value: number) => void
  setPageSize: (value: number) => void
  resetFilters: (overrides?: Partial<CascadingFilters>) => void
} & (D extends DateRangeFilter ? { setDateRange: (value: DateRangeFilter) => void } : object) &
  (S extends true ? { setSearch: (value: string) => void } : object)

export function useCascadingFilters<
  D extends DateRangeFilter | undefined = undefined,
  S extends boolean = false,
>(
  options: { defaultDateRange?: D; hasSearch?: S } = {} as { defaultDateRange?: D; hasSearch?: S },
): CascadingFilterReturn<D, S> {
  const { defaultDateRange, hasSearch = false as S } = options

  function buildDefaultFilters(): CascadingFilters {
    const base: CascadingFiltersBase = {
      gradeLevel: ALL_VALUE,
      subject: ALL_VALUE,
      topic: ALL_VALUE,
      stage: ALL_VALUE,
    }
    if (defaultDateRange !== undefined && hasSearch) {
      return { ...base, dateRange: defaultDateRange, search: '' }
    }
    if (defaultDateRange !== undefined) {
      return { ...base, dateRange: defaultDateRange }
    }
    if (hasSearch) {
      return { ...base, search: '' }
    }
    return base
  }

  const filters = ref(buildDefaultFilters())
  const pagination = ref<Pagination>({ pageIndex: 0, pageSize: 10 })

  function setGradeLevel(value: string) {
    filters.value.gradeLevel = value
    filters.value.subject = ALL_VALUE
    filters.value.topic = ALL_VALUE
    filters.value.stage = ALL_VALUE
    pagination.value.pageIndex = 0
  }

  function setSubject(value: string) {
    filters.value.subject = value
    filters.value.topic = ALL_VALUE
    filters.value.stage = ALL_VALUE
    pagination.value.pageIndex = 0
  }

  function setTopic(value: string) {
    filters.value.topic = value
    filters.value.stage = ALL_VALUE
    pagination.value.pageIndex = 0
  }

  function setStage(value: string) {
    filters.value.stage = value
    pagination.value.pageIndex = 0
  }

  function setPageIndex(value: number) {
    pagination.value.pageIndex = value
  }

  function setPageSize(value: number) {
    pagination.value.pageSize = value
    pagination.value.pageIndex = 0
  }

  function resetFilters(overrides?: Partial<CascadingFilters>) {
    const defaults = buildDefaultFilters()
    filters.value = overrides ? { ...defaults, ...overrides } : defaults
    pagination.value = { pageIndex: 0, pageSize: 10 }
  }

  const result: Record<string, unknown> = {
    filters,
    pagination,
    setGradeLevel,
    setSubject,
    setTopic,
    setStage,
    setPageIndex,
    setPageSize,
    resetFilters,
  }

  if (defaultDateRange !== undefined) {
    result.setDateRange = (value: DateRangeFilter) => {
      ;(filters.value as CascadingFiltersWithDateRange).dateRange = value
      pagination.value.pageIndex = 0
    }
  }

  if (hasSearch) {
    result.setSearch = (value: string) => {
      ;(filters.value as CascadingFiltersWithSearch).search = value
      pagination.value.pageIndex = 0
    }
  }

  return result as CascadingFilterReturn<D, S>
}
