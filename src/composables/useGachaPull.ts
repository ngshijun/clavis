import { ref, onScopeDispose } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { usePetsStore, rarityHexColors, type Pet } from '@/stores/pets'
import { toast } from 'vue-sonner'
import { useLanguageStore } from '@/stores/language'

export const SINGLE_PULL_COST = 100
export const MULTI_PULL_COST = 900 // 10 pulls for price of 9

/**
 * Composable for gacha pull mechanics — handles single/multi pull logic,
 * coin validation, RPC calls, and result state management.
 */
export function useGachaPull() {
  const authStore = useAuthStore()
  const petsStore = usePetsStore()
  const languageStore = useLanguageStore()

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
  const lastPullType = ref<'single' | 'multi' | 'free'>('single')

  function getPetById(petId: string): Pet | undefined {
    return petsStore.allPets.find((p) => p.id === petId)
  }

  /**
   * Look up a pulled pet, refetching the catalog once if it isn't found in the
   * local cache (e.g. allPets hadn't finished loading when the pull resolved).
   */
  async function resolvePulledPet(petId: string): Promise<Pet | undefined> {
    const cached = getPetById(petId)
    if (cached) return cached
    await petsStore.fetchAllPets()
    return getPetById(petId)
  }

  function isPetNew(petId: string): boolean {
    return !petsStore.ownedPets.some((p) => p.petId === petId)
  }

  async function singlePull() {
    if (isRolling.value) return
    if ((authStore.studentProfile?.coins ?? 0) < SINGLE_PULL_COST) return

    isRolling.value = true
    lastPullType.value = 'single'
    capsuleColor.value = '#A855F7'

    const { petId, error } = await petsStore.gachaPull()

    if (error || !petId) {
      isRolling.value = false
      toast.error(error ?? languageStore.t.shared.toasts.pullFailed)
      return
    }

    const pet = await resolvePulledPet(petId)
    if (!pet) {
      // Pull succeeded server-side (coins spent, pet granted) but the catalog
      // entry is unavailable even after a refetch. Refresh local state and
      // surface a non-silent notice instead of failing silently.
      await Promise.all([authStore.refreshProfile(), petsStore.fetchOwnedPets()])
      isRolling.value = false
      toast.error(languageStore.t.shared.toasts.pullFailed)
      return
    }

    capsuleColor.value = rarityHexColors[pet.rarity]
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
    lastPullType.value = 'free'
    capsuleColor.value = '#A855F7'

    const { petId, error } = await petsStore.initialPetDraw()

    if (error || !petId) {
      isRolling.value = false
      toast.error(error ?? languageStore.t.shared.toasts.pullFailed)
      return
    }

    const pet = await resolvePulledPet(petId)
    if (!pet) {
      // Draw succeeded server-side but the catalog entry is unavailable even
      // after a refetch. Refresh local state and surface a non-silent notice.
      await Promise.all([authStore.refreshProfile(), petsStore.fetchOwnedPets()])
      isRolling.value = false
      toast.error(languageStore.t.shared.toasts.pullFailed)
      return
    }

    capsuleColor.value = rarityHexColors[pet.rarity]
    newPetIds.value = new Set([pet.id])

    safeTimeout(async () => {
      pullResults.value = [pet]
      await Promise.all([authStore.refreshProfile(), petsStore.fetchOwnedPets()])
      isRolling.value = false
      showResultDialog.value = true
    }, 1500)
  }

  async function multiPull() {
    if (isRolling.value) return
    if ((authStore.studentProfile?.coins ?? 0) < MULTI_PULL_COST) return

    isRolling.value = true
    lastPullType.value = 'multi'
    capsuleColor.value = '#F59E0B'

    const { petIds, error } = await petsStore.gachaMultiPull()

    if (error || !petIds) {
      isRolling.value = false
      toast.error(error ?? languageStore.t.shared.toasts.pullFailed)
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

    // Refetch the catalog once if any pulled pet is missing from the cache so
    // the freshly-granted pets can still be displayed.
    if (petIds.some((id) => !getPetById(id))) {
      await petsStore.fetchAllPets()
    }
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
