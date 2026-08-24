<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useClassroomScopeStore } from '@/stores/classroom-scope'
import { useClassroomsStore } from '@/stores/classrooms'
import { useActiveClassroom } from '@/composables/useActiveClassroom'
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
 * The classroom switcher, directly under the product name in the sidebar.
 * Every data surface below it belongs to the classroom named here, so it reads
 * as a context header rather than a filter control.
 *
 * Two roles, two mechanisms, one control. A teacher's classroom lives in the
 * URL (decision 83), so picking one NAVIGATES; a student's is still selected
 * state (decision 79), so picking one sets it. Managers and admins are
 * unscoped and see nothing here.
 *
 * With a single classroom it degrades to a static label — a dropdown that
 * cannot change anything would be a dead affordance.
 */
const t = useT()
const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const scope = useClassroomScopeStore()
const classroomsStore = useClassroomsStore()
const { classroomId } = useActiveClassroom()

interface SwitcherItem {
  id: string
  name: string
  gradeLevelName: string
  subjectName: string
}

const applies = computed(() => authStore.isTeacher || scope.appliesToCurrentUser)

const items = computed<SwitcherItem[]>(() =>
  authStore.isTeacher ? classroomsStore.classrooms : scope.classrooms,
)

const activeId = computed(() => (authStore.isTeacher ? classroomId.value : scope.selectedId))

const active = computed(() => items.value.find((item) => item.id === activeId.value) ?? null)

/** Known to belong to nothing — as opposed to still loading. */
const belongsToNothing = computed(() =>
  authStore.isTeacher
    ? classroomsStore.hasLoaded && items.value.length === 0
    : scope.hasNoClassrooms,
)

/**
 * Which classroom-scoped section the teacher is in, so a switch keeps them
 * where they were. Deliberately section-level, not path-level: an assessment
 * id belongs to the classroom being left, so it must not travel along.
 */
function currentSection(): string {
  const name = String(route.name ?? '')
  if (name.startsWith('teacher-assessment')) return 'assessments'
  if (name === 'teacher-template-library') return 'templates'
  return 'dashboard'
}

function choose(id: string) {
  if (!authStore.isTeacher) {
    scope.select(id)
    return
  }
  void router.push(`/teacher/classrooms/${id}/${currentSection()}`)
}
</script>

<template>
  <div v-if="applies" class="px-2 pb-1">
    <!-- Sole classroom: show the context, but not a menu that goes nowhere. -->
    <div v-if="items.length === 1 && active" class="flex items-center gap-2 rounded-md px-2 py-1.5">
      <School class="size-4 shrink-0 text-muted-foreground" />
      <div class="grid flex-1 text-left leading-tight">
        <span class="truncate text-sm font-medium">{{ active.name }}</span>
        <span class="truncate text-xs text-muted-foreground">
          {{ active.gradeLevelName }} · {{ active.subjectName }}
        </span>
      </div>
    </div>

    <SidebarMenu v-else-if="items.length > 1">
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
                  {{ active?.name ?? t.shared.layout.sidebar.classroomScope.none }}
                </span>
                <span v-if="active" class="truncate text-xs text-muted-foreground">
                  {{ active.gradeLevelName }} · {{ active.subjectName }}
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
              v-for="classroom in items"
              :key="classroom.id"
              class="gap-2"
              @click="choose(classroom.id)"
            >
              <div class="grid flex-1 leading-tight">
                <span class="truncate text-sm font-medium">{{ classroom.name }}</span>
                <span class="truncate text-xs text-muted-foreground">
                  {{ classroom.gradeLevelName }} · {{ classroom.subjectName }}
                </span>
              </div>
              <Check v-if="classroom.id === activeId" class="size-4 shrink-0" />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>

    <!-- Belongs to nothing: say so here, since every page below will be empty. -->
    <div v-else-if="belongsToNothing" class="rounded-md px-2 py-1.5 text-xs text-muted-foreground">
      {{ t.shared.layout.sidebar.classroomScope.none }}
    </div>
  </div>
</template>
