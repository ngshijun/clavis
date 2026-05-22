<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { usePetsStore, rarityConfig, getRarityLabel, type PetRarity, type Pet } from '@/stores/pets'
import { usePetsLoader } from '@/composables/usePetsLoader'
import { useT } from '@/composables/useT'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Combine, Sparkles, Loader2, Circle, Star, Flame, Crown } from 'lucide-vue-next'
import type { Component } from 'vue'
import CombinePetsDialog from '@/components/student/CombinePetsDialog.vue'
import CombineResultDialog from '@/components/student/CombineResultDialog.vue'
import PetDetailDialog from '@/components/student/PetDetailDialog.vue'

const authStore = useAuthStore()
const petsStore = usePetsStore()
const { isLoading } = usePetsLoader()
const t = useT()

const rarityOrder: PetRarity[] = ['legendary', 'epic', 'rare', 'common']

const rarityIcons: Record<PetRarity, Component> = {
  common: Circle,
  rare: Star,
  epic: Flame,
  legendary: Crown,
}

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
          <h1 class="text-2xl font-bold">{{ t.student.collections.title }}</h1>
          <p class="text-muted-foreground">{{ t.student.collections.subtitle }}</p>
        </div>
        <div class="flex items-center gap-4">
          <Button variant="outline" as-child data-tour="unlock-new-pets">
            <RouterLink to="/student/gacha">
              <Sparkles class="mr-2 size-4" />
              {{ t.student.collections.unlockNewPets }}
            </RouterLink>
          </Button>
          <Button @click="showCombineDialog = true">
            <Combine class="mr-2 size-4" />
            {{ t.student.collections.combinePets }}
          </Button>
          <div class="text-right">
            <p class="text-2xl font-bold">{{ petsStore.totalOwned }} / {{ petsStore.totalPets }}</p>
            <p class="text-sm text-muted-foreground">{{ t.student.collections.petsCollected }}</p>
          </div>
        </div>
      </div>

      <!-- Collection by Rarity -->
      <div class="space-y-5">
        <Card
          v-for="rarity in rarityOrder"
          :key="rarity"
          class="relative overflow-hidden transition-shadow duration-300 hover:shadow-md"
        >
          <!-- Subtle rarity-themed accent gradient along the top -->
          <div
            class="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b opacity-50"
            :class="[rarityConfig[rarity].gradientFrom, rarityConfig[rarity].gradientTo]"
          />

          <CardHeader class="relative pb-3">
            <div class="flex items-center justify-between gap-3">
              <CardTitle class="flex items-center gap-2.5 text-base">
                <component
                  :is="rarityIcons[rarity]"
                  class="size-5"
                  :class="rarityConfig[rarity].color"
                />
                <span :class="rarityConfig[rarity].color">
                  {{ getRarityLabel(rarity) }}
                </span>
              </CardTitle>
              <Badge variant="outline" :class="rarityConfig[rarity].color">
                {{ petsStore.collectionStats[rarity].owned }} /
                {{ petsStore.collectionStats[rarity].total }}
              </Badge>
            </div>
            <CardDescription>{{
              t.student.collections.dropRate(rarityConfig[rarity].chance)
            }}</CardDescription>
          </CardHeader>
          <CardContent class="relative">
            <div class="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
              <div
                v-for="pet in petsStore.petsByRarity[rarity]"
                :key="pet.id"
                :data-tour="pet.name === 'Cloud Bunny' ? 'first-pet-card' : undefined"
                class="group relative flex cursor-pointer flex-col items-center rounded-lg border px-2 pb-2 pt-3 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg"
                :class="[
                  petsStore.isPetOwned(pet.id)
                    ? [
                        rarityConfig[rarity].bgColor,
                        rarityConfig[rarity].borderColor,
                        rarityConfig[rarity].hoverShadow,
                      ]
                    : 'border-gray-200 bg-gray-100 dark:border-gray-700 dark:bg-muted',
                  isSelected(pet.id) ? 'ring-2 ring-primary ring-offset-2' : '',
                ]"
                @click="openPetDialog(pet)"
              >
                <!-- Selected indicator -->
                <div
                  v-if="isSelected(pet.id)"
                  class="absolute -right-2 -top-2 flex size-5 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground"
                >
                  ★
                </div>

                <!-- Duplicate count badge -->
                <div
                  v-if="petsStore.isPetOwned(pet.id) && getPetCount(pet.id) > 1"
                  class="absolute -left-2 -top-2 flex size-5 items-center justify-center rounded-full bg-purple-500 text-[10px] font-bold text-white"
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
                    class="px-1 py-0 text-[10px]"
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
