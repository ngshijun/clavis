import { ref, onScopeDispose } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { usePetsStore, type Pet, type PetRarity } from '@/stores/pets'
import { toast } from 'vue-sonner'

export const SINGLE_PULL_COST = 100
export const MULTI_PULL_COST = 900 // 10 pulls for price of 9

const rarityColors: Record<PetRarity, string> = {
  common: '#22C55E',
  rare: '#3B82F6',
  epic: '#A855F7',
  legendary: '#F59E0B',
}

/**
 * Composable for gacha pull mechanics — handles single/multi pull logic,
 * coin validation, RPC calls, and result state management.
 */
export function useGachaPull() {
  const authStore = useAuthStore()
  const petsStore = usePetsStore()

  const timeouts = new Set<ReturnType<typeof setTimeout>>()

  function safeTimeout(fn: () => void, ms: number) {
    const id = setTimeout(() => {
      timeouts.delete(id)
      fn()
    }, ms)
    timeouts.add(id)
  }

  onScopeDispose(() => {
    for (const id of timeouts) clearTimeout(id)
    timeouts.clear()
  })

  const isRolling = ref(false)
  const showResultDialog = ref(false)
  const pullResults = ref<Pet[]>([])
  const newPetIds = ref<Set<string>>(new Set())
  const capsuleColor = ref('purple')
  const lastPullType = ref<'single' | 'multi'>('single')

  function getPetById(petId: string): Pet | undefined {
    return petsStore.allPets.find((p) => p.id === petId)
  }

  function isPetNew(petId: string): boolean {
    return !petsStore.ownedPets.some((p) => p.petId === petId)
  }

  async function singlePull() {
    if ((authStore.studentProfile?.coins ?? 0) < SINGLE_PULL_COST) return

    isRolling.value = true
    lastPullType.value = 'single'
    capsuleColor.value = '#A855F7'

    const { petId, error } = await petsStore.gachaPull()

    if (error || !petId) {
      isRolling.value = false
      toast.error(error ?? 'Pull failed')
      return
    }

    const pet = getPetById(petId)
    if (!pet) {
      isRolling.value = false
      await authStore.refreshProfile()
      await petsStore.fetchOwnedPets()
      return
    }

    capsuleColor.value = rarityColors[pet.rarity]
    newPetIds.value = new Set(isPetNew(pet.id) ? [pet.id] : [])

    safeTimeout(async () => {
      pullResults.value = [pet]
      await Promise.all([authStore.refreshProfile(), petsStore.fetchOwnedPets()])
      isRolling.value = false
      showResultDialog.value = true
    }, 1500)
  }

  async function freePull() {
    if (isRolling.value) return
    isRolling.value = true
    lastPullType.value = 'single'
    capsuleColor.value = '#A855F7'

    const { petId, error } = await petsStore.initialPetDraw()

    if (error || !petId) {
      isRolling.value = false
      toast.error(error ?? 'Pull failed')
      return
    }

    const pet = getPetById(petId)
    if (!pet) {
      isRolling.value = false
      await authStore.refreshProfile()
      await petsStore.fetchOwnedPets()
      return
    }

    capsuleColor.value = rarityColors[pet.rarity]
    newPetIds.value = new Set([pet.id])

    safeTimeout(async () => {
      pullResults.value = [pet]
      await Promise.all([authStore.refreshProfile(), petsStore.fetchOwnedPets()])
      isRolling.value = false
      showResultDialog.value = true
    }, 1500)
  }

  async function multiPull() {
    if ((authStore.studentProfile?.coins ?? 0) < MULTI_PULL_COST) return

    isRolling.value = true
    lastPullType.value = 'multi'
    capsuleColor.value = '#F59E0B'

    const { petIds, error } = await petsStore.gachaMultiPull()

    if (error || !petIds) {
      isRolling.value = false
      toast.error(error ?? 'Pull failed')
      return
    }

    const newIds = new Set<string>()
    const seenInThisPull = new Set<string>()
    for (const petId of petIds) {
      if (isPetNew(petId) && !seenInThisPull.has(petId)) {
        newIds.add(petId)
      }
      seenInThisPull.add(petId)
    }
    newPetIds.value = newIds

    const pets = petIds.map((id) => getPetById(id)).filter((p): p is Pet => p !== undefined)

    safeTimeout(async () => {
      pullResults.value = pets
      await Promise.all([authStore.refreshProfile(), petsStore.fetchOwnedPets()])
      isRolling.value = false
      showResultDialog.value = true
    }, 2000)
  }

  function closeResults() {
    showResultDialog.value = false
    pullResults.value = []
    newPetIds.value = new Set()
  }

  return {
    isRolling,
    showResultDialog,
    pullResults,
    newPetIds,
    capsuleColor,
    lastPullType,
    singlePull,
    freePull,
    multiPull,
    closeResults,
  }
}
