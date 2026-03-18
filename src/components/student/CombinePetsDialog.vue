<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  usePetsStore,
  rarityConfig,
  COMBINE_SUCCESS_RATES,
  type PetRarity,
  type Pet,
  type OwnedPet,
} from '@/stores/pets'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { HelpCircle, Combine, Sparkles, Loader2, Plus, ArrowRight } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  combined: [
    results: Array<{
      upgraded: boolean
      isNew: boolean
      resultPet: Pet | null
      resultRarity: PetRarity | null
    }>,
  ]
}>()

const petsStore = usePetsStore()

type CombineRarity = Exclude<PetRarity, 'legendary'>
const combineRarityOrder: CombineRarity[] = ['common', 'rare', 'epic']

const selectedCombineRarity = ref<CombineRarity>('common')
const petSelectionCounts = ref<Map<string, number>>(new Map())
const isCombining = ref(false)

function getNextRarity(rarity: CombineRarity): PetRarity {
  const nextMap: Record<CombineRarity, PetRarity> = {
    common: 'rare',
    rare: 'epic',
    epic: 'legendary',
  }
  return nextMap[rarity]
}

const ownedPetsForCombine = computed(() => {
  return petsStore.ownedPetsByRarity[selectedCombineRarity.value].filter((op) => op.count > 1)
})

const totalSelectedCount = computed(() => {
  let total = 0
  for (const count of petSelectionCounts.value.values()) {
    total += count
  }
  return total
})

function getSelectionCount(ownedPetId: string): number {
  return petSelectionCounts.value.get(ownedPetId) ?? 0
}

function getAvailableCount(ownedPet: OwnedPet): number {
  const selected = getSelectionCount(ownedPet.id)
  return Math.max(0, ownedPet.count - 1 - selected)
}

function incrementSelection(ownedPet: OwnedPet) {
  if (totalSelectedCount.value >= 4) return
  if (getAvailableCount(ownedPet) <= 0) return

  const newMap = new Map(petSelectionCounts.value)
  const current = newMap.get(ownedPet.id) ?? 0
  newMap.set(ownedPet.id, current + 1)
  petSelectionCounts.value = newMap
}

function decrementSelection(ownedPet: OwnedPet) {
  const current = getSelectionCount(ownedPet.id)
  if (current <= 0) return

  const newMap = new Map(petSelectionCounts.value)
  if (current === 1) {
    newMap.delete(ownedPet.id)
  } else {
    newMap.set(ownedPet.id, current - 1)
  }
  petSelectionCounts.value = newMap
}

function handleCombineRarityChange(rarity: CombineRarity) {
  selectedCombineRarity.value = rarity
  petSelectionCounts.value = new Map()
}

function closeDialog() {
  petSelectionCounts.value = new Map()
  emit('update:open', false)
}

function getPetForOwnedPet(ownedPet: OwnedPet): Pet | undefined {
  return petsStore.getPetById(ownedPet.petId)
}

function buildCombineIds(): string[] {
  const ids: string[] = []
  for (const [ownedPetId, count] of petSelectionCounts.value.entries()) {
    for (let i = 0; i < count; i++) {
      ids.push(ownedPetId)
    }
  }
  return ids
}

const selectedPetsPreview = computed(() => {
  const pets: Array<{ ownedPet: OwnedPet; pet: Pet }> = []
  for (const [ownedPetId, count] of petSelectionCounts.value.entries()) {
    const ownedPet = ownedPetsForCombine.value.find((op) => op.id === ownedPetId)
    if (ownedPet) {
      const pet = getPetForOwnedPet(ownedPet)
      if (pet) {
        for (let i = 0; i < count; i++) {
          pets.push({ ownedPet, pet })
        }
      }
    }
  }
  return pets
})

function clearAllSelections() {
  petSelectionCounts.value = new Map()
}

const quickCombineCount = computed(() => {
  let totalAvailable = 0
  for (const ownedPet of ownedPetsForCombine.value) {
    totalAvailable += Math.max(0, ownedPet.count - 1)
  }
  return Math.floor(totalAvailable / 4)
})

function getCombineCountForRarity(rarity: CombineRarity): number {
  let totalAvailable = 0
  for (const ownedPet of petsStore.ownedPetsByRarity[rarity]) {
    totalAvailable += Math.max(0, ownedPet.count - 1)
  }
  return Math.floor(totalAvailable / 4)
}

function getOwnedPetIdSet(): Set<string> {
  return new Set(petsStore.ownedPets.map((op) => op.petId))
}

async function handleCombine() {
  if (totalSelectedCount.value !== 4) return

  isCombining.value = true
  const ownedPetIds = buildCombineIds()
  const preCombineOwned = getOwnedPetIdSet()

  try {
    const result = await petsStore.combinePets(ownedPetIds)

    if (result.error !== null) {
      toast.error(result.error)
      return
    }

    const resultPet = result.resultPetId ? petsStore.getPetById(result.resultPetId) : null
    emit('combined', [
      {
        upgraded: result.upgraded,
        isNew: result.resultPetId ? !preCombineOwned.has(result.resultPetId) : false,
        resultPet: resultPet ?? null,
        resultRarity: result.resultRarity,
      },
    ])
    petSelectionCounts.value = new Map()
  } catch (err) {
    console.error('Failed to combine pets:', err)
    toast.error('Failed to combine pets')
  } finally {
    isCombining.value = false
  }
}

async function handleQuickCombine() {
  if (quickCombineCount.value === 0) return

  isCombining.value = true
  const results: Array<{
    upgraded: boolean
    isNew: boolean
    resultPet: Pet | null
    resultRarity: PetRarity | null
  }> = []

  try {
    const petPool: string[] = []
    for (const ownedPet of ownedPetsForCombine.value) {
      const availableCount = Math.max(0, ownedPet.count - 1)
      for (let i = 0; i < availableCount; i++) {
        petPool.push(ownedPet.id)
      }
    }

    const preCombineOwned = getOwnedPetIdSet()
    const seenInThisBatch = new Set<string>()

    const combineCount = Math.floor(petPool.length / 4)
    for (let i = 0; i < combineCount; i++) {
      const idsToUse = petPool.slice(i * 4, (i + 1) * 4)
      const result = await petsStore.combinePets(idsToUse)

      if (result.error === null) {
        const resultPet = result.resultPetId ? petsStore.getPetById(result.resultPetId) : null
        const isNew =
          result.resultPetId !== undefined &&
          !preCombineOwned.has(result.resultPetId) &&
          !seenInThisBatch.has(result.resultPetId)
        if (result.resultPetId) seenInThisBatch.add(result.resultPetId)
        results.push({
          upgraded: result.upgraded,
          isNew,
          resultPet: resultPet ?? null,
          resultRarity: result.resultRarity,
        })
      }
    }

    if (results.length > 0) {
      emit('combined', results)
    } else {
      toast.error('Failed to combine pets')
    }

    petSelectionCounts.value = new Map()
  } catch (err) {
    console.error('Failed to quick-combine pets:', err)
    toast.error('Failed to combine pets')
  } finally {
    isCombining.value = false
  }
}
</script>

<template>
  <Dialog :open="props.open" @update:open="closeDialog">
    <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2">
          <Combine class="size-5 text-purple-500" />
          Combine Pets
        </DialogTitle>
        <DialogDescription>
          Select 4 pets of the same rarity to combine them for a chance at a higher rarity pet
        </DialogDescription>
      </DialogHeader>

      <!-- Rarity Tabs -->
      <Tabs :model-value="selectedCombineRarity" class="w-full">
        <TabsList class="grid w-full grid-cols-3">
          <TabsTrigger
            v-for="rarity in combineRarityOrder"
            :key="rarity"
            :value="rarity"
            :class="rarityConfig[rarity].color"
            @click="handleCombineRarityChange(rarity)"
          >
            {{ rarityConfig[rarity].label }}
            <Badge variant="secondary" class="ml-2">
              {{ getCombineCountForRarity(rarity) }}
            </Badge>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <!-- 4-Slot Preview -->
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <p class="text-sm font-medium">Selected ({{ totalSelectedCount }}/4)</p>
          <Button
            v-if="totalSelectedCount > 0"
            variant="ghost"
            size="sm"
            class="h-6 px-2 text-xs"
            @click="clearAllSelections"
          >
            Clear
          </Button>
        </div>

        <div class="grid grid-cols-4 gap-2">
          <div
            v-for="i in 4"
            :key="i"
            class="flex aspect-square flex-col items-center justify-center rounded-lg border-2 border-dashed p-1.5"
            :class="[
              selectedPetsPreview[i - 1]
                ? [
                    'border-solid cursor-pointer hover:opacity-75 transition-opacity',
                    rarityConfig[selectedCombineRarity].bgColor,
                    rarityConfig[selectedCombineRarity].borderColor,
                  ]
                : [rarityConfig[selectedCombineRarity].borderColor, 'opacity-40'],
            ]"
            @click="
              selectedPetsPreview[i - 1] && decrementSelection(selectedPetsPreview[i - 1]!.ownedPet)
            "
          >
            <template v-if="selectedPetsPreview[i - 1]">
              <img
                :src="
                  petsStore.getOptimizedPetImageUrl(
                    selectedPetsPreview[i - 1]!.pet.imagePath,
                    selectedPetsPreview[i - 1]!.pet.updatedAt,
                  )
                "
                :alt="selectedPetsPreview[i - 1]!.pet.name"
                class="size-16 object-contain sm:size-20"
              />
              <p class="mt-1 max-w-full truncate text-center text-xs font-medium">
                {{ selectedPetsPreview[i - 1]!.pet.name }}
              </p>
            </template>
            <template v-else>
              <Plus class="size-6 text-muted-foreground" />
            </template>
          </div>
        </div>
      </div>

      <!-- Success Rate Badge -->
      <div class="flex items-center justify-center gap-2">
        <Badge variant="outline" class="gap-1.5 px-3 py-1 text-sm">
          <span :class="rarityConfig[selectedCombineRarity].color" class="font-medium">
            {{ rarityConfig[selectedCombineRarity].label }}
          </span>
          <ArrowRight class="size-3.5" />
          <span
            :class="rarityConfig[getNextRarity(selectedCombineRarity)].color"
            class="font-medium"
          >
            {{ rarityConfig[getNextRarity(selectedCombineRarity)].label }}
          </span>
          <span class="text-muted-foreground">·</span>
          <span class="font-semibold">
            {{ COMBINE_SUCCESS_RATES[selectedCombineRarity] }}% success
          </span>
        </Badge>
      </div>

      <!-- Pet Selection Grid -->
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <p class="text-sm font-medium">Your Pets</p>
          <p class="text-xs text-muted-foreground">Click to add · click selected above to remove</p>
        </div>

        <div
          v-if="ownedPetsForCombine.length > 0"
          class="max-h-[280px] overflow-y-auto rounded-lg border p-2"
        >
          <div class="grid grid-cols-4 gap-2 sm:grid-cols-5">
            <div
              v-for="ownedPet in ownedPetsForCombine"
              :key="ownedPet.id"
              class="relative flex cursor-pointer flex-col items-center rounded-lg border-2 p-2 transition-all hover:scale-105"
              :class="[
                getSelectionCount(ownedPet.id) > 0
                  ? 'border-purple-500 bg-purple-100 dark:bg-purple-950/50'
                  : [
                      rarityConfig[selectedCombineRarity].bgColor,
                      rarityConfig[selectedCombineRarity].borderColor,
                    ],
                getAvailableCount(ownedPet) === 0 ? 'opacity-50' : '',
              ]"
              @click="incrementSelection(ownedPet)"
              @contextmenu.prevent="decrementSelection(ownedPet)"
            >
              <!-- Selection count badge -->
              <div
                v-if="getSelectionCount(ownedPet.id) > 0"
                class="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-purple-500 text-xs font-bold text-white"
              >
                {{ getSelectionCount(ownedPet.id) }}
              </div>

              <!-- Pet Image -->
              <img
                v-if="getPetForOwnedPet(ownedPet)"
                :src="
                  petsStore.getOptimizedPetImageUrl(
                    getPetForOwnedPet(ownedPet)!.imagePath,
                    getPetForOwnedPet(ownedPet)!.updatedAt,
                  )
                "
                :alt="getPetForOwnedPet(ownedPet)!.name"
                loading="lazy"
                class="size-16 object-contain sm:size-20"
              />

              <!-- Pet Name & Count -->
              <p class="mt-1 max-w-full truncate text-center text-xs font-medium">
                {{ getPetForOwnedPet(ownedPet)?.name }}
              </p>
              <p v-if="ownedPet.count > 1" class="text-[10px] text-muted-foreground">
                x{{ ownedPet.count - 1 }}
              </p>
            </div>
          </div>
        </div>

        <!-- Empty State -->
        <div
          v-else
          class="flex flex-col items-center justify-center rounded-lg border py-8 text-center text-muted-foreground"
        >
          <HelpCircle class="mb-2 size-10 opacity-50" />
          <p class="text-sm">No {{ rarityConfig[selectedCombineRarity].label }} pets</p>
        </div>
      </div>

      <!-- Footer Buttons -->
      <DialogFooter class="gap-2">
        <Button
          variant="outline"
          :disabled="quickCombineCount === 0 || isCombining"
          @click="handleQuickCombine"
        >
          <Loader2 v-if="isCombining" class="mr-2 size-4 animate-spin" />
          <Sparkles v-else class="mr-2 size-4" />
          Combine All ({{ quickCombineCount }}x)
        </Button>
        <Button :disabled="totalSelectedCount !== 4 || isCombining" @click="handleCombine">
          <Loader2 v-if="isCombining" class="mr-2 size-4 animate-spin" />
          <Combine v-else class="mr-2 size-4" />
          {{ isCombining ? 'Combining...' : 'Combine' }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
