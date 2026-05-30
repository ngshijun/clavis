<script setup lang="ts">
import { watch, computed } from 'vue'
import { useCelebrationQueue } from '@/composables/useCelebrationQueue'
import { useT } from '@/composables/useT'
import { useShare } from '@/composables/useShare'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { getBadgeIconUrl } from '@/lib/storage'
import { Share2, Link, CirclePoundSterling } from 'lucide-vue-next'

const celebrationQueue = useCelebrationQueue()
const t = useT()
const { share, copyLink } = useShare()

// Only render when the head of the queue is a badge unlock
const currentBadge = computed(() => {
  const item = celebrationQueue.current.value
  return item?.type === 'badgeUnlock' ? item.badge : null
})

const isOpen = computed(() => currentBadge.value !== null)

const badgeStrings = computed(() => {
  const badge = currentBadge.value
  if (!badge) return { name: '', description: '' }
  const badges = t.value.student.badges as Record<
    string,
    { name: string; description: string } | undefined
  >
  return (
    badges[badge.slug] ?? {
      name: badge.slug,
      description: '',
    }
  )
})

const hasMoreInQueue = computed(() => celebrationQueue.pendingCount.value > 1)

const tierColorClass = computed(() => {
  const badge = currentBadge.value
  if (!badge) return ''
  switch (badge.tier) {
    case 'bronze':
      return 'border-amber-700'
    case 'silver':
      return 'border-slate-400'
    case 'gold':
      return 'border-yellow-500'
    case 'platinum':
      return 'border-sky-400'
    case 'diamond':
      return 'border-cyan-400'
    case 'master':
      return 'border-purple-500'
    case 'grandmaster':
      return 'border-rose-500'
    default:
      return ''
  }
})

function getShareText(): string {
  return t.value.student.badgeUnlockDialog.shareMessage(badgeStrings.value.name)
}

function shareBadge() {
  if (!currentBadge.value) return
  share({ title: t.value.student.badgeUnlockDialog.title, text: getShareText() })
}

function copyBadgeLink() {
  if (!currentBadge.value) return
  copyLink(getShareText())
}

// Fire a gentle confetti burst on each new badge unlock
watch(currentBadge, async (badge) => {
  if (badge) {
    const { default: confetti } = await import('canvas-confetti')
    confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } })
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
        <DialogTitle class="text-center text-xl">
          {{ t.student.badgeUnlockDialog.title }}
        </DialogTitle>
        <DialogDescription class="text-center">
          {{ badgeStrings.description }}
        </DialogDescription>
      </DialogHeader>

      <div v-if="currentBadge" class="space-y-4 py-2">
        <div class="flex flex-col items-center gap-3">
          <div :class="['rounded-full border-4 p-3', tierColorClass]">
            <img
              :src="getBadgeIconUrl(currentBadge.icon_path)"
              :alt="badgeStrings.name"
              class="size-20"
            />
          </div>
          <p class="text-2xl font-bold">{{ badgeStrings.name }}</p>
          <div
            v-if="currentBadge.coin_reward > 0"
            class="flex items-center gap-1 text-sm text-yellow-600"
          >
            <CirclePoundSterling class="size-4" />
            <span>{{ t.student.badgeUnlockDialog.coinReward(currentBadge.coin_reward) }}</span>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <Button class="flex-1" @click="dismiss">
            {{
              hasMoreInQueue ? t.student.badgeUnlockDialog.next : t.student.badgeUnlockDialog.close
            }}
          </Button>
          <Button variant="outline" size="icon" @click="copyBadgeLink">
            <Link class="size-4" />
          </Button>
          <Button variant="outline" size="icon" @click="shareBadge">
            <Share2 class="size-4" />
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
