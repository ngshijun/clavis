<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { usePetsStore, rarityConfig, type PetRarity } from '@/stores/pets'
import { useGachaPull, SINGLE_PULL_COST, MULTI_PULL_COST } from '@/composables/useGachaPull'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Sparkles,
  Loader2,
  CirclePoundSterling,
  Info,
  PawPrint,
  FolderHeart,
} from 'lucide-vue-next'
import { useRouter } from 'vue-router'

const router = useRouter()
const authStore = useAuthStore()
const petsStore = usePetsStore()

// Reversed rarity order for display (legendary first)
const rarityOrder: (keyof typeof rarityConfig)[] = ['legendary', 'epic', 'rare', 'common']

const currentCoins = computed(() => authStore.studentProfile?.coins ?? 0)

// Capsule colors for drop rates display
const rarityColors: Record<PetRarity, string> = {
  common: '#22C55E',
  rare: '#3B82F6',
  epic: '#A855F7',
  legendary: '#F59E0B',
}

const {
  isRolling,
  showResultDialog,
  pullResults,
  newPetIds,
  capsuleColor,
  lastPullType,
  singlePull,
  multiPull,
  freePull,
  closeResults,
} = useGachaPull()

// First-pet mode: student has 0 owned pets, use freePull instead of singlePull
const isFirstPetMode = computed(() => petsStore.ownedPets.length === 0)

function handleSinglePull() {
  if (isFirstPetMode.value) {
    freePull()
  } else {
    singlePull()
  }
}

// Fetch pets on mount
onMounted(async () => {
  if (petsStore.allPets.length === 0) {
    await petsStore.fetchAllPets()
  }
  await petsStore.fetchOwnedPets()
})
</script>

<template>
  <div class="space-y-6 p-6">
    <!-- Header -->
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold">Get Pets</h1>
        <p class="text-muted-foreground">Spend coins to collect amazing pets!</p>
      </div>
      <div class="flex items-center gap-2">
        <Button variant="outline" @click="router.push('/student/collections')">
          <FolderHeart class="mr-2 size-4" />
          Collections
        </Button>
        <Button variant="outline" @click="router.push('/student/my-pet')">
          <PawPrint class="mr-2 size-4" />
          My Pet
        </Button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="petsStore.isLoading" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <template v-else>
      <div class="grid gap-6 lg:grid-cols-4">
        <!-- Gacha Machine -->
        <Card
          class="overflow-hidden border-2 border-purple-200 bg-gradient-to-b from-purple-50 to-fuchsia-50 dark:border-purple-800 dark:bg-card dark:from-purple-950/50 dark:to-fuchsia-950/50 lg:col-span-3"
        >
          <CardContent class="p-8">
            <div class="flex flex-col items-center gap-8">
              <!-- Gacha Machine Visual -->
              <div class="relative">
                <!-- Machine Body -->
                <div
                  class="relative flex h-72 w-56 flex-col items-center rounded-3xl border-4 border-purple-400 bg-gradient-to-b from-purple-600 via-purple-500 to-fuchsia-600 p-4 shadow-2xl dark:border-purple-600 dark:from-purple-800 dark:via-purple-700 dark:to-fuchsia-800"
                  :class="{ 'animate-shake': isRolling }"
                >
                  <!-- Glass Dome with Capsules -->
                  <div
                    class="relative h-36 w-full overflow-hidden rounded-t-full border-4 border-purple-300 bg-gradient-to-b from-white/90 to-white/70 dark:border-purple-500 dark:from-gray-200/90 dark:to-gray-300/70"
                  >
                    <!-- Decorative capsules inside -->
                    <div
                      class="absolute inset-0 flex flex-wrap items-center justify-center gap-1 p-3"
                    >
                      <div
                        v-for="i in 12"
                        :key="i"
                        class="size-6 rounded-full shadow-sm"
                        :class="[
                          i % 4 === 0
                            ? 'bg-gradient-to-br from-yellow-400 to-amber-500'
                            : i % 3 === 0
                              ? 'bg-gradient-to-br from-purple-400 to-fuchsia-500'
                              : i % 2 === 0
                                ? 'bg-gradient-to-br from-blue-400 to-cyan-500'
                                : 'bg-gradient-to-br from-gray-300 to-gray-400',
                        ]"
                        :style="{
                          transform: `translate(${Math.sin(i * 1.5) * 8}px, ${Math.cos(i * 2) * 4}px)`,
                        }"
                      />
                    </div>
                    <!-- Glass shine effect -->
                    <div
                      class="absolute left-2 top-2 h-16 w-8 rotate-12 rounded-full bg-white/40"
                    />
                  </div>

                  <!-- Machine Label -->
                  <div
                    class="mt-2 rounded-lg bg-gradient-to-r from-yellow-400 to-amber-400 px-6 py-1 shadow-md"
                  >
                    <span class="text-sm font-bold text-amber-900">LUCKY PETS</span>
                  </div>

                  <!-- Dispenser Opening -->
                  <div class="mt-auto flex flex-col items-center">
                    <div class="h-4 w-20 rounded-t-lg bg-gradient-to-b from-gray-700 to-gray-800" />
                    <div
                      class="flex h-12 w-24 items-center justify-center rounded-b-2xl border-4 border-gray-700 bg-gray-900"
                    >
                      <!-- Dispensing capsule animation -->
                      <div
                        v-if="isRolling"
                        class="size-8 animate-bounce rounded-full shadow-lg"
                        :style="{
                          background: `linear-gradient(135deg, ${capsuleColor}, ${capsuleColor}dd)`,
                        }"
                      />
                      <div v-else class="text-2xl">🎁</div>
                    </div>
                  </div>
                </div>

                <!-- Decorative stars -->
                <Sparkles
                  class="absolute -left-4 -top-2 size-8 text-yellow-400"
                  :class="{ 'animate-pulse': isRolling }"
                />
                <Sparkles
                  class="absolute -right-4 top-8 size-6 text-pink-400"
                  :class="{ 'animate-pulse': isRolling }"
                />
                <Sparkles
                  class="absolute -left-2 bottom-16 size-5 text-purple-400"
                  :class="{ 'animate-pulse': isRolling }"
                />
              </div>

              <!-- Pull Buttons -->
              <div class="flex flex-col gap-4 sm:flex-row">
                <Button
                  data-tour="gacha-single-pull"
                  size="lg"
                  class="min-w-44 bg-gradient-to-r from-purple-500 to-fuchsia-500 text-white shadow-lg transition-all hover:from-purple-600 hover:to-fuchsia-600 hover:shadow-xl disabled:opacity-50"
                  :disabled="isRolling || (!isFirstPetMode && currentCoins < SINGLE_PULL_COST)"
                  @click="handleSinglePull"
                >
                  <span class="mr-2 text-lg">🎰</span>
                  {{ isFirstPetMode ? 'Free Draw!' : 'Single Pull' }}
                  <Badge
                    v-if="!isFirstPetMode"
                    variant="secondary"
                    class="ml-2 gap-1 bg-white/20 text-white hover:bg-white/20"
                  >
                    <CirclePoundSterling class="size-3" />
                    {{ SINGLE_PULL_COST }}
                  </Badge>
                </Button>
                <Button
                  v-if="!isFirstPetMode"
                  size="lg"
                  class="min-w-44 bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg transition-all hover:from-amber-600 hover:to-orange-600 hover:shadow-xl disabled:opacity-50"
                  :disabled="isRolling || currentCoins < MULTI_PULL_COST"
                  @click="multiPull"
                >
                  <span class="mr-2 text-lg">✨</span>
                  10x Pull
                  <Badge
                    variant="secondary"
                    class="ml-2 gap-1 bg-white/20 text-white hover:bg-white/20"
                  >
                    <CirclePoundSterling class="size-3" />
                    {{ MULTI_PULL_COST }}
                  </Badge>
                </Button>
              </div>

              <p
                v-if="!isFirstPetMode && currentCoins < SINGLE_PULL_COST"
                class="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-950/50 dark:text-red-400"
              >
                Not enough coins! Complete practice sessions to earn more.
              </p>
            </div>
          </CardContent>
        </Card>

        <!-- Drop Rates Card -->
        <Card class="border-purple-200 dark:border-purple-800 lg:col-span-1">
          <CardHeader class="pb-3">
            <CardTitle class="flex items-center gap-2 text-lg">
              <Info class="size-4" />
              Drop Rates
            </CardTitle>
            <CardDescription>Chances for each rarity</CardDescription>
          </CardHeader>
          <CardContent>
            <div class="flex flex-col gap-2">
              <div
                v-for="rarity in rarityOrder"
                :key="rarity"
                class="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-muted/50"
                :class="[rarityConfig[rarity].borderColor]"
              >
                <div class="flex items-center gap-2">
                  <div class="size-4 rounded-full" :style="{ background: rarityColors[rarity] }" />
                  <span class="text-sm font-medium" :class="rarityConfig[rarity].color">
                    {{ rarityConfig[rarity].label }}
                  </span>
                </div>
                <span class="font-bold" :class="rarityConfig[rarity].color">
                  {{ rarityConfig[rarity].chance }}%
                </span>
              </div>
            </div>

            <!-- Pricing Info -->
            <div class="mt-4 rounded-lg bg-muted/50 p-3">
              <p class="mb-2 text-xs font-medium text-muted-foreground">Pricing</p>
              <div class="space-y-1 text-sm">
                <div class="flex justify-between">
                  <span>Single Pull</span>
                  <span class="font-medium">{{ SINGLE_PULL_COST }} coins</span>
                </div>
                <div class="flex justify-between">
                  <span>10x Pull</span>
                  <span class="font-medium"
                    >{{ MULTI_PULL_COST }} coins
                    <span class="text-xs text-green-600">(10% off)</span></span
                  >
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </template>

    <!-- Results Dialog -->
    <Dialog :open="showResultDialog" @update:open="closeResults">
      <DialogContent class="sm:max-w-5xl border-2 border-purple-300 dark:border-purple-700">
        <DialogHeader>
          <DialogTitle class="flex items-center gap-2 text-xl">
            <span class="text-2xl">🎉</span>
            Congratulations!
          </DialogTitle>
          <DialogDescription>
            You got {{ pullResults.length }} new pet{{ pullResults.length > 1 ? 's' : '' }}!
          </DialogDescription>
        </DialogHeader>
        <div
          class="max-h-[60vh] gap-3 overflow-y-auto py-4"
          :class="
            pullResults.length > 1 ? 'flex flex-wrap justify-center' : 'grid place-items-center'
          "
        >
          <div
            v-for="(pet, index) in pullResults"
            :key="index"
            :data-tour="isFirstPetMode && index === 0 ? 'gacha-result-pet' : undefined"
            class="flex flex-col items-center rounded-xl border-2 px-2 pb-2 pt-3 transition-transform hover:scale-105"
            :class="[rarityConfig[pet.rarity].bgColor, rarityConfig[pet.rarity].borderColor]"
          >
            <div class="relative">
              <img
                :src="petsStore.getOptimizedPetImageUrl(pet.imagePath, pet.updatedAt)"
                :alt="pet.name"
                class="size-40 object-contain drop-shadow-md"
              />
              <!-- New badge for first-time pets -->
              <Badge
                v-if="newPetIds.has(pet.id)"
                class="absolute -right-2 -top-2 bg-green-500 px-1.5 text-[10px]"
              >
                NEW!
              </Badge>
            </div>
            <p class="mt-2 text-center text-sm font-semibold">{{ pet.name }}</p>
            <Badge :class="rarityConfig[pet.rarity].color" variant="outline" class="mt-1 text-xs">
              {{ rarityConfig[pet.rarity].label }}
            </Badge>
          </div>
        </div>
        <div class="flex justify-end gap-2">
          <Button data-tour="gacha-close-results" variant="outline" @click="closeResults"
            >Close</Button
          >
          <template v-if="!isFirstPetMode">
            <!-- Single pull again button -->
            <Button
              v-if="lastPullType === 'single'"
              class="bg-gradient-to-r from-purple-500 to-fuchsia-500 hover:from-purple-600 hover:to-fuchsia-600"
              :disabled="currentCoins < SINGLE_PULL_COST"
              @click="(closeResults(), singlePull())"
            >
              <span class="mr-1">🎰</span>
              Pull 1 More
              <Badge
                variant="secondary"
                class="ml-2 gap-1 bg-white/20 text-white hover:bg-white/20"
              >
                <CirclePoundSterling class="size-3" />
                {{ SINGLE_PULL_COST }}
              </Badge>
            </Button>
            <!-- Multi pull again button -->
            <Button
              v-else
              class="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
              :disabled="currentCoins < MULTI_PULL_COST"
              @click="(closeResults(), multiPull())"
            >
              <span class="mr-1">✨</span>
              Pull 10 More
              <Badge
                variant="secondary"
                class="ml-2 gap-1 bg-white/20 text-white hover:bg-white/20"
              >
                <CirclePoundSterling class="size-3" />
                {{ MULTI_PULL_COST }}
              </Badge>
            </Button>
          </template>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>

<style scoped>
@keyframes shake {
  0%,
  100% {
    transform: translateX(0) rotate(0);
  }
  10%,
  30%,
  50%,
  70%,
  90% {
    transform: translateX(-4px) rotate(-1deg);
  }
  20%,
  40%,
  60%,
  80% {
    transform: translateX(4px) rotate(1deg);
  }
}

.animate-shake {
  animation: shake 0.6s ease-in-out infinite;
}
</style>
