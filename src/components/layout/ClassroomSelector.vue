<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useClassroomScopeStore } from '@/stores/classroom-scope'
import { useClassroomsStore } from '@/stores/classrooms'
import { useActiveClassroom } from '@/composables/useActiveClassroom'
import { useT } from '@/composables/useT'
import { ChevronRight, School } from 'lucide-vue-next'
import { SidebarMenu, SidebarMenuItem, SidebarMenuButton } from '@/components/ui/sidebar'

/**
 * The classroom context header, directly under the product name in the sidebar.
 * Every data surface below it belongs to the classroom named here.
 *
 * Changing class goes through the picker rather than a dropdown (decision 86):
 * the picker is the one place that shows each class as a card with its cover,
 * and duplicating that list into a menu meant maintaining two pickers. It is
 * also the only route back to the picker now that the sidebar no longer links
 * to it.
 *
 * With a single classroom it degrades to a static label for a teacher or a
 * student — their picker redirects straight back in when there is only one
 * class, so a link there would bounce. A manager's `/manager/classrooms` is a
 * real management page that never redirects, so their header always links.
 *
 * A manager only sees this once they are INSIDE a classroom (decision 87);
 * above that altitude there is no active classroom to name. Admins are
 * unscoped and see nothing here at all.
 */
const t = useT()
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

const applies = computed(() =>
  authStore.isManager ? classroomId.value !== null : authStore.isTeacher || authStore.isStudent,
)

const items = computed<SwitcherItem[]>(() =>
  authStore.isTeacher || authStore.isManager ? classroomsStore.classrooms : scope.classrooms,
)

/** Only the auto-redirecting pickers make a sole-classroom link pointless. */
const collapsesWhenSole = computed(() => authStore.isTeacher || authStore.isStudent)

const active = computed(() => items.value.find((item) => item.id === classroomId.value) ?? null)

const pickerPath = computed(() => `/${authStore.userType}/classrooms`)

/** Known to belong to nothing — as opposed to still loading. */
const belongsToNothing = computed(() =>
  authStore.isTeacher || authStore.isManager
    ? classroomsStore.hasLoaded && items.value.length === 0
    : scope.hasNoClassrooms,
)
</script>

<template>
  <div v-if="applies" class="px-2 pb-1">
    <!-- Sole classroom: show the context, but not a control that goes nowhere. -->
    <div
      v-if="collapsesWhenSole && items.length === 1 && active"
      class="flex items-center gap-2 rounded-md px-2 py-1.5"
    >
      <School class="size-4 shrink-0 text-muted-foreground" />
      <div class="grid flex-1 text-left leading-tight">
        <span class="truncate text-sm font-medium">{{ active.name }}</span>
        <span class="truncate text-xs text-muted-foreground">
          {{ active.gradeLevelName }} · {{ active.subjectName }}
        </span>
      </div>
    </div>

    <SidebarMenu v-else-if="items.length > 0">
      <SidebarMenuItem>
        <SidebarMenuButton
          as-child
          size="lg"
          :aria-label="t.shared.layout.sidebar.classroomScope.switchLabel"
        >
          <RouterLink :to="pickerPath">
            <School class="size-4 shrink-0 text-muted-foreground" />
            <div class="grid flex-1 text-left leading-tight">
              <span class="truncate text-sm font-medium">
                {{ active?.name ?? t.shared.layout.sidebar.classroomScope.none }}
              </span>
              <span v-if="active" class="truncate text-xs text-muted-foreground">
                {{ active.gradeLevelName }} · {{ active.subjectName }}
              </span>
            </div>
            <ChevronRight class="ml-auto size-4" />
          </RouterLink>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>

    <!-- Belongs to nothing: say so here, since every page below will be empty. -->
    <div v-else-if="belongsToNothing" class="rounded-md px-2 py-1.5 text-xs text-muted-foreground">
      {{ t.shared.layout.sidebar.classroomScope.none }}
    </div>
  </div>
</template>
