<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useClassroomsStore } from '@/stores/classrooms'
import { GraduationCap, Loader2, School, Users } from 'lucide-vue-next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'vue-sonner'
import { useT } from '@/composables/useT'

/**
 * The teacher's class picker (decision 83) — the Google Classroom shape: pick
 * a class, and everything after that belongs to it.
 *
 * A teacher with exactly ONE classroom is redirected straight in. A landing
 * grid of a single card is a dead screen, and that is the common case; the
 * grid earns its place only when there is a genuine choice to make.
 */
const t = useT()
const router = useRouter()
const classroomsStore = useClassroomsStore()

const classrooms = computed(() => classroomsStore.classrooms)

function open(classroomId: string) {
  void router.push(`/teacher/classrooms/${classroomId}/dashboard`)
}

/**
 * `replace`, not `push` — the picker must not sit in history behind the
 * classroom, or Back from the dashboard would bounce straight forward again.
 */
function skipWhenSole() {
  if (!classroomsStore.hasLoaded) return
  const sole = classrooms.value.length === 1 ? classrooms.value[0] : null
  if (sole) void router.replace(`/teacher/classrooms/${sole.id}/dashboard`)
}

onMounted(async () => {
  if (!classroomsStore.hasLoaded && !classroomsStore.isLoading) {
    const { error } = await classroomsStore.fetchClassrooms()
    if (error) toast.error(t.value.staff.classrooms.toastLoadFailed)
  }
  skipWhenSole()
})

// The guard may still have the list in flight when this mounts.
watch(() => classroomsStore.hasLoaded, skipWhenSole)
</script>

<template>
  <div class="p-6">
    <div class="mb-6">
      <h1 class="text-2xl font-bold">{{ t.staff.classroomPicker.title }}</h1>
      <p class="text-muted-foreground">{{ t.staff.classroomPicker.subtitle }}</p>
    </div>

    <div v-if="classroomsStore.isLoading" class="flex items-center justify-center py-16">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <div v-else-if="classrooms.length === 0" class="py-16 text-center">
      <School class="mx-auto size-16 text-muted-foreground/50" />
      <p class="mt-4 text-muted-foreground">{{ t.staff.classroomPicker.empty }}</p>
    </div>

    <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Card
        v-for="classroom in classrooms"
        :key="classroom.id"
        class="cursor-pointer transition-shadow hover:border-primary/40 hover:shadow-md"
        role="link"
        tabindex="0"
        @click="open(classroom.id)"
        @keydown.enter="open(classroom.id)"
        @keydown.space.prevent="open(classroom.id)"
      >
        <CardHeader>
          <CardTitle class="flex items-start gap-2">
            <School class="mt-0.5 size-5 shrink-0 text-primary" />
            <span class="min-w-0 break-words">{{ classroom.name }}</span>
          </CardTitle>
        </CardHeader>
        <CardContent class="space-y-3">
          <div class="flex flex-wrap gap-1">
            <Badge variant="secondary">{{ classroom.gradeLevelName }}</Badge>
            <Badge variant="outline">{{ classroom.subjectName }}</Badge>
          </div>
          <div class="flex items-center gap-4 text-sm text-muted-foreground">
            <span class="flex items-center gap-1">
              <Users class="size-4" />
              {{ t.staff.classroomPicker.students(classroom.studentCount) }}
            </span>
            <span class="flex items-center gap-1">
              <GraduationCap class="size-4" />
              {{ t.staff.classroomPicker.teachers(classroom.teacherCount) }}
            </span>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
