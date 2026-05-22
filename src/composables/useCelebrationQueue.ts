import { ref, computed, readonly, type Ref } from 'vue'
import type { Database } from '@/types/database.types'

type BadgeRow = Database['public']['Tables']['badges']['Row']

export type Celebration =
  | { type: 'levelUp'; oldLevel: number; newLevel: number }
  | { type: 'badgeUnlock'; badge: BadgeRow }

const PRIORITY: Record<Celebration['type'], number> = {
  levelUp: 0, // shows first — biggest, rarest
  badgeUnlock: 1, // shows after level-up
  // missionComplete: 2, — reserved for future missions feature
}

// Module-scoped state: shared across all callers of useCelebrationQueue()
const queue: Ref<Celebration[]> = ref([])

function priorityOf(c: Celebration): number {
  return PRIORITY[c.type]
}

export function useCelebrationQueue() {
  function enqueue(items: Celebration[]) {
    if (items.length === 0) return
    queue.value = [...queue.value, ...items].sort((a, b) => priorityOf(a) - priorityOf(b))
  }

  function dismiss() {
    queue.value.shift()
  }

  const current = computed(() => queue.value[0] ?? null)
  const pendingCount = computed(() => queue.value.length)

  return {
    enqueue,
    dismiss,
    current,
    pendingCount,
    queue: readonly(queue),
  }
}
