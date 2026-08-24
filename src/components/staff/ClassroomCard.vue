<script setup lang="ts">
import { computed } from 'vue'

import { createBucketImageHelpers } from '@/lib/storage'
import { GraduationCap, School, Users } from 'lucide-vue-next'
import { Card, CardContent } from '@/components/ui/card'
import { useT } from '@/composables/useT'

/**
 * One classroom as a card, shared by the manager's grid and the teacher's and
 * student's pickers so a cover uploaded once is seen everywhere.
 *
 * The cover is the point: two classes can differ only by a trailing "A" or
 * "B", and a picture is the fastest way to tell them apart. Without one the
 * header falls back to a tint derived from the classroom id — stable per
 * classroom, so it still reads as that class's colour.
 */
/**
 * Only what the card renders, so both the staff `ClassroomListItem` and the
 * student scope store's lighter `ScopedClassroom` satisfy it structurally.
 */
interface ClassroomCardItem {
  id: string
  name: string
  coverImagePath: string | null
  teacherCount?: number
  studentCount?: number
}

const props = defineProps<{
  classroom: ClassroomCardItem
  /** Rosters are only meaningful to staff; a student's counts are RLS-filtered. */
  showCounts?: boolean
  /** Cards that navigate get the affordance; a managed card does not. */
  clickable?: boolean
}>()

const t = useT()
const { getImageUrl } = createBucketImageHelpers('classroom-images')

const coverUrl = computed(() =>
  props.classroom.coverImagePath ? getImageUrl(props.classroom.coverImagePath) : '',
)

/**
 * Deterministic hue from the id, so a coverless class keeps one colour.
 *
 * Spread by the golden angle rather than a plain modulo: sibling classrooms
 * often have ids differing in a single character ("…0001" / "…0002"), and a
 * plain `% 360` maps those to neighbouring hues — two cards the eye reads as
 * the same colour, which is exactly what this is meant to prevent.
 */
const GOLDEN_ANGLE = 137.508

const fallbackHue = computed(() => {
  let hash = 0
  for (const char of props.classroom.id) hash = (hash * 31 + char.charCodeAt(0)) | 0
  return Math.floor((Math.abs(hash) * GOLDEN_ANGLE) % 360)
})
</script>

<template>
  <!-- `py-0 gap-0` overrides Card's default vertical padding and gap so the
       cover is flush with the card's top and side borders. -->
  <Card
    class="gap-0 overflow-hidden py-0 transition-shadow"
    :class="clickable ? 'cursor-pointer hover:border-primary/40 hover:shadow-md' : ''"
  >
    <!-- 3:1, matching the proportions of a Google Classroom class card, whose
         banner takes roughly the top third. A fixed height instead would
         change the crop at every breakpoint. -->
    <div class="relative aspect-[3/1] w-full">
      <img v-if="coverUrl" :src="coverUrl" alt="" class="size-full object-cover" />
      <div
        v-else
        class="size-full"
        :style="{
          background: `linear-gradient(135deg, hsl(${fallbackHue} 65% 62%), hsl(${(fallbackHue + 40) % 360} 65% 48%))`,
        }"
      />
      <slot name="actions" />
    </div>

    <CardContent class="space-y-3 py-4">
      <div class="flex items-start gap-2">
        <School class="mt-0.5 size-5 shrink-0 text-primary" />
        <span class="min-w-0 break-words font-semibold leading-tight">{{ classroom.name }}</span>
      </div>

      <div v-if="showCounts" class="flex items-center gap-4 text-sm text-muted-foreground">
        <span class="flex items-center gap-1">
          <Users class="size-4" />
          {{ t.staff.classroomPicker.students(classroom.studentCount ?? 0) }}
        </span>
        <span class="flex items-center gap-1">
          <GraduationCap class="size-4" />
          {{ t.staff.classroomPicker.teachers(classroom.teacherCount ?? 0) }}
        </span>
      </div>
    </CardContent>
  </Card>
</template>
