<script setup lang="ts">
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { User, Mail, Cake, GraduationCap, CalendarDays } from 'lucide-vue-next'

import { formatDate } from '@/lib/date'
import { useT } from '@/composables/useT'

const t = useT()

defineProps<{
  student: {
    name: string
    email: string
    dateOfBirth: string | null
    gradeLevelName: string | null
    joinedAt: string | null
  }
}>()
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle class="flex items-center gap-2">
        <User class="size-5" />
        {{ t.shared.studentInfoTab.title }}
      </CardTitle>
    </CardHeader>
    <CardContent>
      <div class="grid gap-6 sm:grid-cols-2">
        <!-- Personal -->
        <div class="space-y-4">
          <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {{ t.shared.studentInfoTab.personalSection }}
          </p>

          <div class="flex items-center gap-3">
            <div class="flex size-9 items-center justify-center rounded-full bg-muted">
              <User class="size-4 text-muted-foreground" />
            </div>
            <div>
              <p class="text-xs text-muted-foreground">{{ t.shared.studentInfoTab.nameLabel }}</p>
              <p class="font-medium">{{ student.name }}</p>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <div class="flex size-9 items-center justify-center rounded-full bg-muted">
              <Mail class="size-4 text-muted-foreground" />
            </div>
            <div>
              <p class="text-xs text-muted-foreground">{{ t.shared.studentInfoTab.emailLabel }}</p>
              <p class="font-medium">{{ student.email }}</p>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <div class="flex size-9 items-center justify-center rounded-full bg-muted">
              <Cake class="size-4 text-muted-foreground" />
            </div>
            <div>
              <p class="text-xs text-muted-foreground">{{ t.shared.studentInfoTab.dobLabel }}</p>
              <p class="font-medium">{{ formatDate(student.dateOfBirth) }}</p>
            </div>
          </div>
        </div>

        <!-- Account -->
        <div class="space-y-4">
          <p class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {{ t.shared.studentInfoTab.accountSection }}
          </p>

          <div class="flex items-center gap-3">
            <div class="flex size-9 items-center justify-center rounded-full bg-muted">
              <GraduationCap class="size-4 text-muted-foreground" />
            </div>
            <div>
              <p class="text-xs text-muted-foreground">
                {{ t.shared.studentInfoTab.gradeLevelLabel }}
              </p>
              <p class="font-medium">{{ student.gradeLevelName ?? '-' }}</p>
            </div>
          </div>

          <div class="flex items-center gap-3">
            <div class="flex size-9 items-center justify-center rounded-full bg-muted">
              <CalendarDays class="size-4 text-muted-foreground" />
            </div>
            <div>
              <p class="text-xs text-muted-foreground">{{ t.shared.studentInfoTab.joinedLabel }}</p>
              <p class="font-medium">{{ formatDate(student.joinedAt) }}</p>
            </div>
          </div>
        </div>
      </div>
    </CardContent>
  </Card>
</template>
