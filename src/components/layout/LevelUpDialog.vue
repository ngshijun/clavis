<script setup lang="ts">
import { watch, computed } from 'vue'
import { useCelebrationQueue } from '@/composables/useCelebrationQueue'
import { useT } from '@/composables/useT'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Star, Share2, Link } from 'lucide-vue-next'
import { useShare } from '@/composables/useShare'

const celebrationQueue = useCelebrationQueue()
const t = useT()
const { share, copyLink } = useShare()

// Only render when the current celebration is a level-up
const currentLevelUp = computed(() =>
  celebrationQueue.current.value?.type === 'levelUp' ? celebrationQueue.current.value : null,
)

const isOpen = computed(() => currentLevelUp.value !== null)

function getShareText() {
  if (!currentLevelUp.value) return ''
  return t.value.shared.layout.levelUpDialog.shareText(currentLevelUp.value.newLevel)
}

function shareLevel() {
  if (!currentLevelUp.value) return
  share({ title: t.value.shared.layout.levelUpDialog.shareTitle, text: getShareText() })
}

function copyLevelLink() {
  if (!currentLevelUp.value) return
  copyLink(getShareText())
}

// Fire confetti when a level-up appears at the head of the queue
watch(currentLevelUp, async (info) => {
  if (info) {
    const { default: confetti } = await import('canvas-confetti')
    const duration = 1500
    const end = Date.now() + duration
    const frame = () => {
      confetti({ particleCount: 3, angle: 60, spread: 55, origin: { x: 0 } })
      confetti({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1 } })
      if (Date.now() < end) requestAnimationFrame(frame)
    }
    frame()
  }
})

function dismiss() {
  celebrationQueue.dismiss()
}
</script>

<template>
  <Dialog
    :open="isOpen"
    @update:open="
      (v: boolean) => {
        if (!v) dismiss()
      }
    "
  >
    <DialogContent class="sm:max-w-md text-center">
      <DialogHeader class="pr-0">
        <DialogTitle class="text-center text-xl">{{
          t.shared.layout.levelUpDialog.title
        }}</DialogTitle>
        <DialogDescription class="text-center">
          {{ t.shared.layout.levelUpDialog.subtitle }}
        </DialogDescription>
      </DialogHeader>

      <div v-if="currentLevelUp" class="space-y-4 py-2">
        <div class="flex flex-col items-center gap-2">
          <Star class="size-12 text-yellow-500" />
          <p class="text-4xl font-bold">
            {{ t.shared.layout.levelUpDialog.levelReached(currentLevelUp.newLevel) }}
          </p>
          <p class="text-sm text-muted-foreground">
            {{ t.shared.layout.levelUpDialog.keepPracticing }}
          </p>
        </div>

        <div class="flex items-center gap-2">
          <Button class="flex-1" @click="dismiss">
            {{ t.shared.layout.levelUpDialog.awesome }}
          </Button>
          <Button variant="outline" size="icon" @click="copyLevelLink">
            <Link class="size-4" />
          </Button>
          <Button variant="outline" size="icon" @click="shareLevel">
            <Share2 class="size-4" />
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
