<script setup lang="ts">
import { computed } from 'vue'
import { usePetsStore, rarityConfig } from '@/stores/pets'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useRouter } from 'vue-router'
import { PawPrint, Star, Heart } from 'lucide-vue-next'

const petsStore = usePetsStore()
const router = useRouter()

// Use the full optimized image (not thumbnail) for the hero display
const selectedPetImage = computed(() => {
  if (!petsStore.selectedPet || !petsStore.selectedOwnedPet) return ''
  return petsStore.getOptimizedPetImageUrlForTier(
    petsStore.selectedPet,
    petsStore.selectedOwnedPet.tier,
  )
})

function goToCollections() {
  router.push('/student/collections')
}

function goToMyPet() {
  router.push('/student/my-pet')
}
</script>

<template>
  <Card
    class="group cursor-pointer gap-0 overflow-hidden py-0 transition-shadow hover:shadow-lg"
    @click="petsStore.selectedPet ? goToMyPet() : goToCollections()"
  >
    <CardContent class="flex flex-1 flex-col p-0">
      <template v-if="petsStore.selectedPet">
        <div class="flex flex-1 flex-col">
          <!-- Pet Display Area (stretches to fill available height) -->
          <div
            class="relative flex flex-1 items-center justify-center overflow-hidden px-6"
            :class="rarityConfig[petsStore.selectedPet.rarity].bgColor"
          >
            <!-- Decorative background circles -->
            <div
              class="absolute left-1/2 top-1/2 size-48 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-20 sm:size-56 lg:size-72"
              :class="rarityConfig[petsStore.selectedPet.rarity].borderColor"
              style="border-width: 3px; border-style: dashed"
            />
            <div
              class="absolute left-1/2 top-1/2 size-36 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-10 sm:size-44 lg:size-56"
              :class="rarityConfig[petsStore.selectedPet.rarity].borderColor"
              style="border-width: 2px; border-style: dotted"
            />

            <!-- Pet Image -->
            <img
              :src="selectedPetImage"
              :alt="petsStore.selectedPet.name"
              width="320"
              height="320"
              fetchpriority="high"
              decoding="async"
              class="relative z-10 h-full max-h-64 w-auto object-contain drop-shadow-lg animate-bounce-slow transition-transform group-hover:scale-110 sm:max-h-72 lg:max-h-80"
            />
          </div>

          <!-- Pet Info (fixed at bottom) -->
          <div class="flex w-full items-center justify-between px-5 py-3">
            <div class="flex items-center gap-3">
              <PawPrint class="size-5 text-purple-500" />
              <div>
                <p class="text-lg font-semibold">{{ petsStore.selectedPet.name }}</p>
                <div class="flex items-center gap-1.5">
                  <Badge
                    variant="outline"
                    :class="rarityConfig[petsStore.selectedPet.rarity].color"
                    class="text-xs"
                  >
                    {{ rarityConfig[petsStore.selectedPet.rarity].label }}
                  </Badge>
                  <Badge v-if="petsStore.selectedOwnedPet" variant="secondary" class="text-xs">
                    <Star class="mr-0.5 size-2.5" />
                    T{{ petsStore.selectedOwnedPet.tier }}
                  </Badge>
                </div>
              </div>
            </div>
            <span class="text-xs text-muted-foreground">Tap to visit</span>
          </div>
        </div>
      </template>

      <!-- Empty State -->
      <template v-else>
        <div class="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-12">
          <div
            class="flex size-24 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/50"
          >
            <Heart class="size-12 text-purple-400" />
          </div>
          <div class="text-center">
            <p class="text-lg font-semibold text-muted-foreground">No pet selected</p>
            <p class="mt-1 text-sm text-muted-foreground">Tap to choose a pet companion!</p>
          </div>
        </div>
      </template>
    </CardContent>
  </Card>
</template>

<style scoped>
@keyframes bounce-slow {
  0%,
  100% {
    transform: translateY(0);
  }
  50% {
    transform: translateY(-8px);
  }
}

.animate-bounce-slow {
  animation: bounce-slow 2s ease-in-out infinite;
}
</style>
