<script setup lang="ts">
import { useClassroomScopeStore } from '@/stores/classroom-scope'
import { useT } from '@/composables/useT'
import { Check, ChevronsUpDown, School } from 'lucide-vue-next'
import { SidebarMenu, SidebarMenuItem, SidebarMenuButton } from '@/components/ui/sidebar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/**
 * The classroom scope switcher (decision 79), directly under the product name
 * in the sidebar. Every data surface below it belongs to the classroom named
 * here, so it reads as a context header rather than a filter control.
 *
 * Rendered only for students, teachers and managers; admins are unscoped.
 * With a single classroom it degrades to a static label — a dropdown that
 * cannot change anything would be a dead affordance.
 */
const scope = useClassroomScopeStore()
const t = useT()
</script>

<template>
  <div v-if="scope.appliesToCurrentUser" class="px-2 pb-1">
    <!-- Sole classroom: show the context, but not a menu that goes nowhere. -->
    <div
      v-if="scope.classrooms.length === 1 && scope.selected"
      class="flex items-center gap-2 rounded-md px-2 py-1.5"
    >
      <School class="size-4 shrink-0 text-muted-foreground" />
      <div class="grid flex-1 text-left leading-tight">
        <span class="truncate text-sm font-medium">{{ scope.selected.name }}</span>
        <span class="truncate text-xs text-muted-foreground">
          {{ scope.selected.gradeLevelName }} · {{ scope.selected.subjectName }}
        </span>
      </div>
    </div>

    <SidebarMenu v-else-if="scope.classrooms.length > 1">
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <SidebarMenuButton
              data-tour="sidebar-classroom"
              size="lg"
              :aria-label="t.shared.layout.sidebar.classroomScope.switchLabel"
              class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <School class="size-4 shrink-0 text-muted-foreground" />
              <div class="grid flex-1 text-left leading-tight">
                <span class="truncate text-sm font-medium">
                  {{ scope.selected?.name ?? t.shared.layout.sidebar.classroomScope.none }}
                </span>
                <span v-if="scope.selected" class="truncate text-xs text-muted-foreground">
                  {{ scope.selected.gradeLevelName }} · {{ scope.selected.subjectName }}
                </span>
              </div>
              <ChevronsUpDown class="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            class="w-[--reka-popper-anchor-width] min-w-56 rounded-lg"
            side="bottom"
            align="start"
            :side-offset="4"
          >
            <DropdownMenuLabel class="text-xs text-muted-foreground">
              {{ t.shared.layout.sidebar.classroomScope.label }}
            </DropdownMenuLabel>
            <DropdownMenuItem
              v-for="classroom in scope.classrooms"
              :key="classroom.id"
              class="gap-2"
              @click="scope.select(classroom.id)"
            >
              <div class="grid flex-1 leading-tight">
                <span class="truncate text-sm font-medium">{{ classroom.name }}</span>
                <span class="truncate text-xs text-muted-foreground">
                  {{ classroom.gradeLevelName }} · {{ classroom.subjectName }}
                </span>
              </div>
              <Check v-if="classroom.id === scope.selectedId" class="size-4 shrink-0" />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>

    <!-- Belongs to nothing: say so here, since every page below will be empty. -->
    <div
      v-else-if="scope.hasNoClassrooms"
      class="rounded-md px-2 py-1.5 text-xs text-muted-foreground"
    >
      {{ t.shared.layout.sidebar.classroomScope.none }}
    </div>
  </div>
</template>
