<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { usePetsStore, rarityConfig, type PetRarity, type Pet } from '@/stores/pets'
import { usePetsLoader } from '@/composables/usePetsLoader'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Combine, Sparkles, Loader2 } from 'lucide-vue-next'
import CombinePetsDialog from '@/components/student/CombinePetsDialog.vue'
import CombineResultDialog from '@/components/student/CombineResultDialog.vue'
import PetDetailDialog from '@/components/student/PetDetailDialog.vue'

const authStore = useAuthStore()
const petsStore = usePetsStore()
const { isLoading } = usePetsLoader()

const rarityOrder: PetRarity[] = ['legendary', 'epic', 'rare', 'common']

// Dialog state
const showPetDialog = ref(false)
const selectedPetForDialog = ref<Pet | null>(null)
const showCombineDialog = ref(false)
const showCombineResultDialog = ref(false)
const combineResults = ref<
  Array<{
    upgraded: boolean
    isNew: boolean
    resultPet: Pet | null
    resultRarity: PetRarity | null
  }>
>([])

function isSelected(petId: string): boolean {
  return authStore.studentProfile?.selectedPetId === petId
}

function getPetDisplayImage(pet: Pet): string {
  const ownedPet = petsStore.getOwnedPet(pet.id)
  if (!ownedPet) return petsStore.getOptimizedPetImageUrl(pet.imagePath, pet.updatedAt)
  return petsStore.getOptimizedPetImageUrlForTier(pet, ownedPet.tier)
}

function getPetTier(petId: string): number {
  return petsStore.getOwnedPet(petId)?.tier ?? 1
}

function getPetCount(petId: string): number {
  return petsStore.getOwnedPet(petId)?.count ?? 0
}

function openPetDialog(pet: Pet) {
  selectedPetForDialog.value = pet
  showPetDialog.value = true
}

function handleCombined(
  results: Array<{
    upgraded: boolean
    isNew: boolean
    resultPet: Pet | null
    resultRarity: PetRarity | null
  }>,
) {
  combineResults.value = results
  showCombineDialog.value = false
  showCombineResultDialog.value = true
}

function closeCombineResult() {
  showCombineResultDialog.value = false
  combineResults.value = []
  showCombineDialog.value = true
}
</script>

<template>
  <div class="space-y-6 p-6">
    <!-- Loading State -->
    <div v-if="isLoading" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <template v-else>
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold">Collections</h1>
          <p class="text-muted-foreground">View all available pets and track your collection</p>
        </div>
        <div class="flex items-center gap-4">
          <Button variant="outline" as-child data-tour="unlock-new-pets">
            <RouterLink to="/student/gacha">
              <Sparkles class="mr-2 size-4" />
              Unlock New Pets
            </RouterLink>
          </Button>
          <Button @click="showCombineDialog = true">
            <Combine class="mr-2 size-4" />
            Combine Pets
          </Button>
          <div class="text-right">
            <p class="text-2xl font-bold">{{ petsStore.totalOwned }} / {{ petsStore.totalPets }}</p>
            <p class="text-sm text-muted-foreground">Pets Collected</p>
          </div>
        </div>
      </div>

      <!-- Collection by Rarity -->
      <div class="space-y-6">
        <Card v-for="rarity in rarityOrder" :key="rarity">
          <CardHeader class="pb-3">
            <div class="flex items-center justify-between">
              <CardTitle
                class="flex items-center gap-2 text-base"
                :class="rarityConfig[rarity].color"
              >
                {{ rarityConfig[rarity].label }}
              </CardTitle>
              <Badge variant="outline" :class="rarityConfig[rarity].color">
                {{ petsStore.collectionStats[rarity].owned }} /
                {{ petsStore.collectionStats[rarity].total }}
              </Badge>
            </div>
            <CardDescription>{{ rarityConfig[rarity].chance }}% drop rate</CardDescription>
          </CardHeader>
          <CardContent>
            <div class="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
              <div
                v-for="pet in petsStore.petsByRarity[rarity]"
                :key="pet.id"
                :data-tour="pet.name === 'Cloud Bunny' ? 'first-pet-card' : undefined"
                class="relative flex flex-col items-center rounded-lg border px-2 pb-2 pt-3 transition-all"
                :class="[
                  petsStore.isPetOwned(pet.id)
                    ? [rarityConfig[rarity].bgColor, rarityConfig[rarity].borderColor]
                    : 'border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-muted',
                  isSelected(pet.id) ? 'ring-2 ring-primary ring-offset-2' : '',
                  'cursor-pointer hover:scale-105',
                ]"
                @click="openPetDialog(pet)"
              >
                <!-- Selected indicator -->
                <div
                  v-if="isSelected(pet.id)"
                  class="absolute -top-2 -right-2 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground"
                >
                  ★
                </div>

                <!-- Duplicate count badge -->
                <div
                  v-if="petsStore.isPetOwned(pet.id) && getPetCount(pet.id) > 1"
                  class="absolute -top-2 -left-2 flex size-5 items-center justify-center rounded-full bg-purple-500 text-[10px] font-bold text-white"
                >
                  {{ getPetCount(pet.id) }}
                </div>

                <!-- Pet Image -->
                <div class="flex aspect-square w-full items-center justify-center">
                  <img
                    :src="
                      petsStore.isPetOwned(pet.id)
                        ? getPetDisplayImage(pet)
                        : petsStore.getOptimizedPetImageUrl(pet.imagePath, pet.updatedAt)
                    "
                    :alt="pet.name"
                    loading="lazy"
                    class="size-full object-contain"
                    :class="{ 'brightness-0 opacity-20': !petsStore.isPetOwned(pet.id) }"
                  />
                </div>

                <!-- Pet Name + Tier Badge -->
                <div class="mt-1 flex items-center justify-center gap-1">
                  <p
                    class="text-center text-xs font-medium leading-tight"
                    :class="
                      petsStore.isPetOwned(pet.id)
                        ? rarityConfig[rarity].textColor
                        : 'text-gray-400 dark:text-gray-600'
                    "
                  >
                    {{ pet.name }}
                  </p>
                  <Badge
                    v-if="petsStore.isPetOwned(pet.id) && getPetTier(pet.id) > 1"
                    variant="outline"
                    class="text-[10px] px-1 py-0"
                  >
                    T{{ getPetTier(pet.id) }}
                  </Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </template>

    <!-- Combine Pets Dialog -->
    <CombinePetsDialog
      :open="showCombineDialog"
      @update:open="showCombineDialog = $event"
      @combined="handleCombined"
    />

    <!-- Combine Result Dialog -->
    <CombineResultDialog
      :open="showCombineResultDialog"
      :results="combineResults"
      @update:open="closeCombineResult"
    />

    <!-- Pet Detail Dialog -->
    <PetDetailDialog
      :open="showPetDialog"
      :pet="selectedPetForDialog"
      @update:open="showPetDialog = $event"
    />
  </div>
</template>
