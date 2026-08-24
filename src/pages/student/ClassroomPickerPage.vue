<script setup lang="ts">
import { computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useClassroomScopeStore } from '@/stores/classroom-scope'
import { Loader2, School } from 'lucide-vue-next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useT } from '@/composables/useT'

/**
 * The student's class picker (decision 83) — the same shape as the teacher's:
 * pick a class, and everything after that belongs to it.
 *
 * A student in exactly ONE class is redirected straight in; a landing grid of
 * a single card is a dead screen, and for students that is the common case.
 *
 * No roster counts here, unlike the teacher's picker: a student's
 * `classroom_students` rows are RLS-filtered to themselves, so every class
 * would claim to hold one student and no teachers.
 */
const t = useT()
const router = useRouter()
const scope = useClassroomScopeStore()

const classrooms = computed(() => scope.classrooms)

function open(classroomId: string) {
  void router.push(`/student/classrooms/${classroomId}/dashboard`)
}

/**
 * `replace`, not `push` — the picker must not sit in history behind the
 * classroom, or Back from the dashboard would bounce straight forward again.
 */
function skipWhenSole() {
  if (!scope.isReady) return
  const sole = classrooms.value.length === 1 ? classrooms.value[0] : null
  if (sole) void router.replace(`/student/classrooms/${sole.id}/dashboard`)
}

onMounted(async () => {
  if (!scope.isReady && !scope.isLoading) await scope.fetchClassrooms()
  skipWhenSole()
})

// The guard may still have the list in flight when this mounts.
watch(() => scope.isReady, skipWhenSole)
</script>

<template>
  <div class="p-6">
    <div v-if="scope.isLoading" class="flex items-center justify-center py-16">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <div v-else-if="classrooms.length === 0" class="py-16 text-center">
      <School class="mx-auto size-16 text-muted-foreground/50" />
      <p class="mt-4 text-muted-foreground">{{ t.student.classroomPicker.empty }}</p>
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
        <CardContent>
          <div class="flex flex-wrap gap-1">
            <Badge variant="secondary">{{ classroom.gradeLevelName }}</Badge>
            <Badge variant="outline">{{ classroom.subjectName }}</Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
