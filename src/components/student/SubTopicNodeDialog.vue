<script setup lang="ts">
import { computed } from 'vue'
import { Loader2, Play } from 'lucide-vue-next'
import type { LearningMapNode, SubTopicStats } from '@/lib/learningMap'
import StarRating from './StarRating.vue'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useT } from '@/composables/useT'

/**
 * Detail view for a learning-map stop: stars, best score, sessions
 * completed, and the Start / Practice-again CTA.
 */
const props = defineProps<{
  node: LearningMapNode | null
  stats: SubTopicStats | null
  isStarting: boolean
}>()

const emit = defineEmits<{
  start: []
}>()

const open = defineModel<boolean>('open', { required: true })

const t = useT()

const hasQuestions = computed(() => (props.node?.questionCount ?? 0) > 0)
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent v-if="node" class="max-w-[calc(100%-2rem)] sm:max-w-sm">
      <DialogHeader>
        <DialogTitle class="pr-6">{{ node.name }}</DialogTitle>
        <DialogDescription>
          {{ t.student.learningMap.questionCount(node.questionCount) }}
        </DialogDescription>
      </DialogHeader>

      <div class="flex flex-col items-center gap-3 py-2">
        <StarRating
          :stars="node.stars"
          size="lg"
          role="img"
          :aria-label="t.student.learningMap.nodeAria(node.name, node.stars)"
        />
        <div class="space-y-1 text-center">
          <template v-if="stats">
            <p class="font-semibold">
              {{ t.student.learningMap.bestScore(stats.bestScorePercent) }}
            </p>
            <p class="text-sm text-muted-foreground">
              {{ t.student.learningMap.sessionsCompleted(stats.sessionsCompleted) }}
            </p>
          </template>
          <p v-else-if="hasQuestions" class="text-sm text-muted-foreground">
            {{ t.student.learningMap.notPracticedYet }}
          </p>
          <!-- Explains the disabled CTA below, so it sits with the other status copy. -->
          <p v-if="!hasQuestions" class="text-sm text-muted-foreground">
            {{ t.student.learningMap.noQuestionsYet }}
          </p>
        </div>
      </div>

      <DialogFooter>
        <Button class="w-full" :disabled="isStarting || !hasQuestions" @click="emit('start')">
          <Loader2 v-if="isStarting" class="mr-2 size-4 animate-spin" />
          <Play v-else class="mr-2 size-4" />
          {{
            node.state === 'not-started'
              ? t.student.learningMap.startPractice
              : t.student.learningMap.practiceAgain
          }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
