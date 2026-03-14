import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAuthStore } from './auth'
import type { Database } from '@/types/database.types'
import { handleError } from '@/lib/errors'
import { getStorageImageUrl, type ImageTransformOptions } from '@/lib/storage'

export type PetRarity = Database['public']['Enums']['pet_rarity']

export interface Pet {
  id: string
  name: string
  rarity: PetRarity
  imagePath: string
  tier2ImagePath: string | null
  tier3ImagePath: string | null
  createdAt: string | null
  updatedAt: string | null
}

export interface OwnedPet {
  id: string
  petId: string
  studentId: string
  count: number
  tier: number
  foodFed: number
  createdAt: string | null
}

// Evolution costs (progressive)
export const EVOLUTION_COSTS = {
  tier1to2: 10,
  tier2to3: 25,
} as const

// Combine success rates (Korean MMO style)
export const COMBINE_SUCCESS_RATES: Record<Exclude<PetRarity, 'legendary'>, number> = {
  common: 50, // Common -> Rare: 50%
  rare: 35, // Rare -> Epic: 35%
  epic: 25, // Epic -> Legendary: 25%
} as const

export const rarityConfig: Record<
  PetRarity,
  {
    label: string
    color: string
    bgColor: string
    borderColor: string
    textColor: string
    chance: number
  }
> = {
  common: {
    label: 'Common',
    color: 'text-green-500',
    bgColor: 'bg-green-100 dark:bg-green-900/30',
    borderColor: 'border-green-300 dark:border-green-800',
    textColor: 'text-green-800 dark:text-green-200',
    chance: 60,
  },
  rare: {
    label: 'Rare',
    color: 'text-blue-500',
    bgColor: 'bg-blue-100 dark:bg-blue-900/30',
    borderColor: 'border-blue-300 dark:border-blue-800',
    textColor: 'text-blue-800 dark:text-blue-200',
    chance: 30,
  },
  epic: {
    label: 'Epic',
    color: 'text-purple-500',
    bgColor: 'bg-purple-100 dark:bg-purple-900/30',
    borderColor: 'border-purple-300 dark:border-purple-800',
    textColor: 'text-purple-800 dark:text-purple-200',
    chance: 9,
  },
  legendary: {
    label: 'Legendary',
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-100 dark:bg-yellow-900/30',
    borderColor: 'border-yellow-300 dark:border-yellow-800',
    textColor: 'text-yellow-800 dark:text-yellow-200',
    chance: 1,
  },
}

export const usePetsStore = defineStore('pets', () => {
  const authStore = useAuthStore()

  // State
  const allPets = ref<Pet[]>([])
  const ownedPets = ref<OwnedPet[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // O(1) lookup Maps (computed from arrays for efficient access)
  const ownedPetByPetId = computed(() => {
    const map = new Map<string, OwnedPet>()
    for (const op of ownedPets.value) {
      map.set(op.petId, op)
    }
    return map
  })

  const petById = computed(() => {
    const map = new Map<string, Pet>()
    for (const pet of allPets.value) {
      map.set(pet.id, pet)
    }
    return map
  })

  // Fetch all pets from database
  async function fetchAllPets(): Promise<{ error: string | null }> {
    isLoading.value = true
    error.value = null

    try {
      const { data, error: fetchError } = await supabase
        .from('pets')
        .select('*')
        .order('rarity')
        .order('name')

      if (fetchError) {
        const message = handleError(fetchError, 'Failed to fetch pets.')
        error.value = message
        return { error: message }
      }

      allPets.value = (data || []).map((pet) => ({
        id: pet.id,
        name: pet.name,
        rarity: pet.rarity,
        imagePath: pet.image_path,
        tier2ImagePath: pet.tier2_image_path,
        tier3ImagePath: pet.tier3_image_path,
        createdAt: pet.created_at,
        updatedAt: pet.updated_at,
      }))

      return { error: null }
    } catch (err) {
      const message = handleError(err, 'Failed to fetch pets.')
      error.value = message
      return { error: message }
    } finally {
      isLoading.value = false
    }
  }

  // Fetch owned pets for current student
  async function fetchOwnedPets(): Promise<{ error: string | null }> {
    const studentId = authStore.user?.id
    if (!studentId) {
      return { error: 'Not logged in' }
    }

    try {
      const { data, error: fetchError } = await supabase
        .from('owned_pets')
        .select('*')
        .eq('student_id', studentId)

      if (fetchError) {
        return { error: handleError(fetchError, 'Failed to fetch owned pets.') }
      }

      ownedPets.value = (data || []).map((op) => ({
        id: op.id,
        petId: op.pet_id,
        studentId: op.student_id,
        count: op.count ?? 1,
        tier: op.tier ?? 1,
        foodFed: op.food_fed ?? 0,
        createdAt: op.created_at,
      }))

      return { error: null }
    } catch (err) {
      const message = handleError(err, 'Failed to fetch owned pets.')
      return { error: message }
    }
  }

  // Get pet image URL from storage path with optional transformation and cache-busting
  function getPetImageUrl(
    imagePath: string | null,
    updatedAt?: string | null,
    transform?: ImageTransformOptions,
  ): string {
    const url = getStorageImageUrl('pet-images', imagePath, transform)
    if (!url || !updatedAt) return url
    // Add cache-busting query param for pet images that change on evolution
    const separator = url.includes('?') ? '&' : '?'
    return `${url}${separator}v=${new Date(updatedAt).getTime()}`
  }

  // Get optimized pet image URL (medium size for dialog display)
  function getOptimizedPetImageUrl(imagePath: string | null, updatedAt?: string | null): string {
    return getPetImageUrl(imagePath, updatedAt, { width: 400, quality: 80 })
  }

  // Get pet image URL based on tier
  function getPetImageUrlForTier(pet: Pet, tier: number): string {
    let imagePath: string | null = pet.imagePath
    if (tier === 2 && pet.tier2ImagePath) {
      imagePath = pet.tier2ImagePath
    } else if (tier === 3 && pet.tier3ImagePath) {
      imagePath = pet.tier3ImagePath
    }
    return getPetImageUrl(imagePath, pet.updatedAt)
  }

  // Get optimized pet image URL based on tier (for dialog display)
  function getOptimizedPetImageUrlForTier(pet: Pet, tier: number): string {
    let imagePath: string | null = pet.imagePath
    if (tier === 2 && pet.tier2ImagePath) {
      imagePath = pet.tier2ImagePath
    } else if (tier === 3 && pet.tier3ImagePath) {
      imagePath = pet.tier3ImagePath
    }
    return getOptimizedPetImageUrl(imagePath, pet.updatedAt)
  }

  // Get evolution progress for an owned pet
  function getEvolutionProgress(ownedPet: OwnedPet): {
    currentTier: number
    foodFed: number
    requiredFood: number
    canEvolve: boolean
    isMaxTier: boolean
  } {
    const currentTier = ownedPet.tier
    const isMaxTier = currentTier >= 3

    let requiredFood = 0
    if (currentTier === 1) {
      requiredFood = EVOLUTION_COSTS.tier1to2
    } else if (currentTier === 2) {
      requiredFood = EVOLUTION_COSTS.tier2to3
    }

    return {
      currentTier,
      foodFed: ownedPet.foodFed,
      requiredFood,
      canEvolve: !isMaxTier && ownedPet.foodFed >= requiredFood,
      isMaxTier,
    }
  }

  // Get pets grouped by rarity
  const petsByRarity = computed(() => {
    const grouped: Record<PetRarity, Pet[]> = {
      common: [],
      rare: [],
      epic: [],
      legendary: [],
    }

    for (const pet of allPets.value) {
      grouped[pet.rarity].push(pet)
    }

    return grouped
  })

  // Check if a pet is owned (O(1) via Map)
  function isPetOwned(petId: string): boolean {
    return ownedPetByPetId.value.has(petId)
  }

  // Get owned pet data (O(1) via Map)
  function getOwnedPet(petId: string): OwnedPet | undefined {
    return ownedPetByPetId.value.get(petId)
  }

  // Get pet by ID (O(1) via Map)
  function getPetById(petId: string): Pet | undefined {
    return petById.value.get(petId)
  }

  // Add a pet to collection (from gacha)
  async function addPet(petId: string): Promise<{ error: string | null }> {
    const studentId = authStore.user?.id
    if (!studentId) {
      return { error: 'Not logged in' }
    }

    try {
      // Check if already owned (O(1) via Map)
      const existing = getOwnedPet(petId)

      if (existing) {
        // Increment count
        const { error: updateError } = await supabase
          .from('owned_pets')
          .update({ count: existing.count + 1 })
          .eq('id', existing.id)

        if (updateError) {
          return { error: handleError(updateError, 'Failed to add pet.') }
        }

        existing.count++
      } else {
        // Insert new owned pet
        const { data, error: insertError } = await supabase
          .from('owned_pets')
          .insert({
            student_id: studentId,
            pet_id: petId,
            count: 1,
          })
          .select()
          .single()

        if (insertError) {
          return { error: handleError(insertError, 'Failed to add pet.') }
        }

        ownedPets.value.push({
          id: data.id,
          petId: data.pet_id,
          studentId: data.student_id,
          count: data.count ?? 1,
          tier: data.tier ?? 1,
          foodFed: data.food_fed ?? 0,
          createdAt: data.created_at,
        })
      }

      return { error: null }
    } catch (err) {
      const message = handleError(err, 'Failed to add pet.')
      return { error: message }
    }
  }

  // Get collection stats
  const collectionStats = computed(() => {
    const stats: Record<PetRarity, { total: number; owned: number }> = {
      common: { total: 0, owned: 0 },
      rare: { total: 0, owned: 0 },
      epic: { total: 0, owned: 0 },
      legendary: { total: 0, owned: 0 },
    }

    for (const pet of allPets.value) {
      stats[pet.rarity].total++
      if (isPetOwned(pet.id)) {
        stats[pet.rarity].owned++
      }
    }

    return stats
  })

  const totalOwned = computed(() => {
    return ownedPets.value.length
  })

  const totalPets = computed(() => {
    return allPets.value.length
  })

  // Get selected pet
  const selectedPet = computed(() => {
    const petId = authStore.studentProfile?.selectedPetId
    if (!petId) return null
    return allPets.value.find((p) => p.id === petId) ?? null
  })

  // Select a pet (must be owned)
  async function selectPet(petId: string): Promise<{ error: string | null }> {
    if (!isPetOwned(petId)) {
      return { error: 'Pet not owned' }
    }

    const result = await authStore.setSelectedPet(petId)
    return result
  }

  // Deselect pet
  async function deselectPet(): Promise<{ error: string | null }> {
    const result = await authStore.setSelectedPet(null)
    return result
  }

  // Feed a pet to accumulate food for evolution
  async function feedPetForEvolution(
    ownedPetId: string,
    foodAmount: number = 1,
  ): Promise<
    { error: null; foodFed: number; requiredFood: number; canEvolve: boolean } | { error: string }
  > {
    const studentId = authStore.user?.id
    if (!studentId) {
      return { error: 'Not logged in' }
    }

    try {
      const { data, error: rpcError } = await supabase.rpc('feed_pet_for_evolution', {
        p_owned_pet_id: ownedPetId,
        p_student_id: studentId,
        p_food_amount: foodAmount,
      })

      if (rpcError) {
        return { error: handleError(rpcError, 'Failed to feed pet.') }
      }

      const result = data as {
        success: boolean
        error?: string
        food_fed?: number
        required_food?: number
        can_evolve?: boolean
      }

      if (!result.success) {
        return { error: result.error ?? 'Failed to feed pet.' }
      }

      // Update local state with fallback refresh on error
      try {
        const ownedPet = ownedPets.value.find((op) => op.id === ownedPetId)
        if (ownedPet) {
          ownedPet.foodFed = result.food_fed ?? ownedPet.foodFed
        }
      } catch (err) {
        console.error('Local state update failed after feeding, re-fetching:', err)
        await fetchOwnedPets()
      }

      // Refresh auth store to get updated food count
      await authStore.refreshProfile()

      return {
        error: null,
        foodFed: result.food_fed ?? 0,
        requiredFood: result.required_food ?? 0,
        canEvolve: result.can_evolve ?? false,
      }
    } catch (err) {
      const message = handleError(err, 'Failed to feed pet.')
      return { error: message }
    }
  }

  // Evolve a pet to the next tier
  async function evolvePet(
    ownedPetId: string,
  ): Promise<{ error: null; newTier: number } | { error: string }> {
    const studentId = authStore.user?.id
    if (!studentId) {
      return { error: 'Not logged in' }
    }

    try {
      const { data, error: rpcError } = await supabase.rpc('evolve_pet', {
        p_owned_pet_id: ownedPetId,
        p_student_id: studentId,
      })

      if (rpcError) {
        return { error: handleError(rpcError, 'Failed to evolve pet.') }
      }

      const result = data as {
        success: boolean
        error?: string
        new_tier?: number
        pet_id?: string
      }

      if (!result.success) {
        return { error: result.error ?? 'Failed to evolve pet.' }
      }

      // Update local state with fallback refresh on error
      try {
        const ownedPet = ownedPets.value.find((op) => op.id === ownedPetId)
        if (ownedPet) {
          ownedPet.tier = result.new_tier ?? ownedPet.tier
          ownedPet.foodFed = 0
        }
      } catch (err) {
        console.error('Local state update failed after evolving, re-fetching:', err)
        await fetchOwnedPets()
      }

      return {
        error: null,
        newTier: result.new_tier ?? 0,
      }
    } catch (err) {
      const message = handleError(err, 'Failed to evolve pet.')
      return { error: message }
    }
  }

  // Get the selected pet's owned data (including tier)
  const selectedOwnedPet = computed(() => {
    const petId = authStore.studentProfile?.selectedPetId
    if (!petId) return null
    return ownedPets.value.find((op) => op.petId === petId) ?? null
  })

  // Get owned pets grouped by rarity (for combining)
  const ownedPetsByRarity = computed(() => {
    const grouped: Record<PetRarity, OwnedPet[]> = {
      common: [],
      rare: [],
      epic: [],
      legendary: [],
    }
    for (const ownedPet of ownedPets.value) {
      const pet = getPetById(ownedPet.petId)
      if (pet) {
        grouped[pet.rarity].push(ownedPet)
      }
    }
    return grouped
  })

  // Combine 4 pets of same rarity for chance at higher rarity
  async function combinePets(
    ownedPetIds: string[],
  ): Promise<
    | { error: null; upgraded: boolean; resultPetId: string; resultRarity: PetRarity }
    | { error: string }
  > {
    const studentId = authStore.user?.id
    if (!studentId) {
      return { error: 'Not logged in' }
    }

    if (ownedPetIds.length !== 4) {
      return { error: 'Must select exactly 4 pets' }
    }

    try {
      const { data, error: rpcError } = await supabase.rpc('combine_pets', {
        p_student_id: studentId,
        p_owned_pet_ids: ownedPetIds,
      })

      if (rpcError) {
        return { error: handleError(rpcError, 'Failed to combine pets.') }
      }

      const result = data as {
        success: boolean
        error?: string
        upgraded?: boolean
        result_pet_id?: string
        result_rarity?: PetRarity
      }

      if (!result.success) {
        return { error: result.error ?? 'Failed to combine pets.' }
      }

      // Refresh owned pets to reflect changes
      await fetchOwnedPets()

      return {
        error: null,
        upgraded: result.upgraded ?? false,
        resultPetId: result.result_pet_id ?? '',
        resultRarity: result.result_rarity ?? 'common',
      }
    } catch (err) {
      const message = handleError(err, 'Failed to combine pets.')
      return { error: message }
    }
  }

  // Gacha single pull (server-side RPC)
  async function gachaPull(): Promise<{ petId: string | null; error: string | null }> {
    try {
      const { data: petId, error: rpcError } = await supabase.rpc('gacha_pull')
      if (rpcError) {
        return { petId: null, error: handleError(rpcError, 'Pull failed') }
      }
      return { petId: petId ?? null, error: null }
    } catch (err) {
      return { petId: null, error: handleError(err, 'Pull failed') }
    }
  }

  // Gacha multi pull (10x, server-side RPC)
  async function gachaMultiPull(): Promise<{ petIds: string[] | null; error: string | null }> {
    try {
      const { data: petIds, error: rpcError } = await supabase.rpc('gacha_multi_pull')
      if (rpcError) {
        return { petIds: null, error: handleError(rpcError, 'Pull failed') }
      }
      return { petIds: petIds ?? null, error: null }
    } catch (err) {
      return { petIds: null, error: handleError(err, 'Pull failed') }
    }
  }

  // Initial pet draw — free starter pet for first-time students (server-side RPC)
  async function initialPetDraw(): Promise<{ petId: string | null; error: string | null }> {
    try {
      const { data: petId, error: rpcError } = await supabase.rpc('initial_pet_draw')
      if (rpcError) {
        return { petId: null, error: handleError(rpcError, 'Initial draw failed') }
      }
      return { petId: petId ?? null, error: null }
    } catch (err) {
      return { petId: null, error: handleError(err, 'Initial draw failed') }
    }
  }

  // Exchange coins for food (server-side RPC)
  async function exchangeCoinsForFood(foodAmount: number): Promise<{ error: string | null }> {
    try {
      const { error: rpcError } = await supabase.rpc('exchange_coins_for_food', {
        p_food_amount: foodAmount,
      })
      if (rpcError) {
        const message = rpcError.message.includes('Insufficient')
          ? 'Not enough coins!'
          : handleError(rpcError, 'Failed to exchange coins for food')
        return { error: message }
      }
      return { error: null }
    } catch (err) {
      return { error: handleError(err, 'Failed to exchange coins for food') }
    }
  }

  // Reset user-specific state (call on logout)
  // Note: allPets is shared data and doesn't need reset
  function $reset() {
    ownedPets.value = []
    isLoading.value = false
    error.value = null
  }

  return {
    // State
    allPets,
    ownedPets,
    isLoading,
    error,

    // Fetch functions
    fetchAllPets,
    fetchOwnedPets,

    // Getters
    petsByRarity,
    collectionStats,
    totalOwned,
    totalPets,
    selectedPet,
    selectedOwnedPet,
    ownedPetsByRarity,

    // Helper functions
    getPetImageUrl,
    getPetImageUrlForTier,
    getOptimizedPetImageUrl,
    getOptimizedPetImageUrlForTier,
    getEvolutionProgress,
    isPetOwned,
    getOwnedPet,
    getPetById,

    // Gacha & exchange
    gachaPull,
    gachaMultiPull,
    initialPetDraw,
    exchangeCoinsForFood,

    // Student actions
    addPet,
    selectPet,
    deselectPet,
    feedPetForEvolution,
    evolvePet,
    combinePets,

    $reset,
  }
})
