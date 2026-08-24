<script setup lang="ts">
import { useBreadcrumbs } from '@/composables/useBreadcrumbs'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb'

/**
 * The header trail that replaces every page's own title block (decision 84).
 * On narrow screens all but the last crumb are hidden — the current page is
 * the part that must always be readable.
 */
const { crumbs } = useBreadcrumbs()
</script>

<template>
  <Breadcrumb v-if="crumbs.length > 0" class="min-w-0">
    <BreadcrumbList class="flex-nowrap">
      <template v-for="(crumb, index) in crumbs" :key="`${crumb.label}-${index}`">
        <BreadcrumbItem :class="index < crumbs.length - 1 ? 'hidden md:inline-flex' : ''">
          <BreadcrumbLink
            v-if="crumb.to"
            class="cursor-pointer truncate"
            @click="$router.push(crumb.to)"
          >
            {{ crumb.label }}
          </BreadcrumbLink>
          <BreadcrumbPage v-else class="truncate">{{ crumb.label }}</BreadcrumbPage>
        </BreadcrumbItem>
        <BreadcrumbSeparator
          v-if="index < crumbs.length - 1"
          :class="index < crumbs.length - 1 ? 'hidden md:block' : ''"
        />
      </template>
    </BreadcrumbList>
  </Breadcrumb>
</template>
