<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { usePetsStore, rarityConfig, getRarityLabel } from '@/stores/pets'
import { usePetsLoader } from '@/composables/usePetsLoader'
import { usePetConversation } from '@/composables/usePetConversation'
import { usePetAnimation } from '@/composables/usePetAnimation'
import { useT } from '@/composables/useT'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Heart, Sparkles, Hand, Star, Apple, ShoppingCart, Loader2 } from 'lucide-vue-next'
import { toast } from 'vue-sonner'
import FoodExchangeDialog from '@/components/student/FoodExchangeDialog.vue'
import EvolutionCard from '@/components/student/EvolutionCard.vue'

const router = useRouter()
const authStore = useAuthStore()
const petsStore = usePetsStore()
const { isLoading } = usePetsLoader()
const t = useT()

const selectedPet = computed(() => petsStore.selectedPet)
const selectedOwnedPet = computed(() => petsStore.selectedOwnedPet)
const currentFood = computed(() => authStore.studentProfile?.food ?? 0)
const currentCoins = computed(() => authStore.studentProfile?.coins ?? 0)

const FOOD_PRICE = 50

const { showBubble: showConversationBubble, currentMessage, triggerMessage } = usePetConversation()
const anim = usePetAnimation()

// Tracked so the evolution-end timeout can be cancelled on unmount, preventing
// it from firing against the disposed usePetAnimation refs after navigation.
let evolveResetTimeout: number | null = null

onUnmounted(() => {
  if (evolveResetTimeout !== null) {
    clearTimeout(evolveResetTimeout)
    evolveResetTimeout = null
  }
})

// Evolution progress
const evolutionProgress = computed(() => {
  if (!selectedOwnedPet.value) return null
  return petsStore.getEvolutionProgress(selectedOwnedPet.value)
})

// Get current tier image
const currentTierImage = computed(() => {
  if (!selectedPet.value || !selectedOwnedPet.value) return ''
  return petsStore.getOptimizedPetImageUrlForTier(selectedPet.value, selectedOwnedPet.value.tier)
})

// Food exchange dialog state
const showFoodExchangeDialog = ref(false)
const foodExchangeRef = ref<InstanceType<typeof FoodExchangeDialog> | null>(null)

function onPetClick() {
  if (anim.triggerPet()) {
    triggerMessage('petting')
  }
}

async function feedPet() {
  if (anim.isFeeding.value || !selectedOwnedPet.value) return

  if (evolutionProgress.value?.isMaxTier) {
    toast.info(t.value.student.myPet.toastMaxTier)
    return
  }

  if (evolutionProgress.value?.canEvolve) {
    toast.info(t.value.student.myPet.toastReadyToEvolve)
    return
  }

  if (currentFood.value <= 0) {
    toast.warning(t.value.student.myPet.toastNoFood)
    triggerMessage('hungry')
    return
  }

  anim.triggerFeed()

  const result = await petsStore.feedPetForEvolution(selectedOwnedPet.value.id, 1)

  if (result.error !== null) {
    toast.error(result.error)
  } else {
    triggerMessage('feeding')
    if (result.canEvolve) {
      toast.success(t.value.student.myPet.toastEvolveReady)
    }
  }
}

async function evolvePet() {
  if (anim.isEvolving.value || !selectedOwnedPet.value) return

  if (!evolutionProgress.value?.canEvolve) {
    toast.warning(t.value.student.myPet.toastNotEnoughFood)
    return
  }

  anim.triggerEvolve()

  const result = await petsStore.evolvePet(selectedOwnedPet.value.id)

  if (result.error !== null) {
    toast.error(result.error)
  } else {
    toast.success(t.value.student.myPet.toastEvolveSuccess(result.newTier))
  }

  // evolvePet() already updates ownedPet.tier/foodFed locally on success (and
  // re-fetches in its own catch fallback), so no extra fetch is needed here.

  evolveResetTimeout = window.setTimeout(() => {
    evolveResetTimeout = null
    anim.endEvolve()
  }, 1500)
}

async function handleExchangeFood(amount: number) {
  const { error } = await petsStore.exchangeCoinsForFood(amount)

  if (error) {
    toast.error(error)
    foodExchangeRef.value?.handleDone()
    return
  }

  await authStore.refreshProfile()
  toast.success(t.value.student.myPet.toastExchangeSuccess(amount, FOOD_PRICE))
  showFoodExchangeDialog.value = false
  foodExchangeRef.value?.handleDone()
}

function goToCollections() {
  router.push('/student/collections')
}

function getTierLabel(tier: number): string {
  return t.value.student.myPet.tierLabel(tier)
}
</script>

<template>
  <div class="space-y-6 p-6">
    <!-- Loading State -->
    <div v-if="isLoading" class="flex items-center justify-center py-12">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <template v-else>
      <!-- Header with Gacha and Buy Food Buttons -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-2xl font-bold">{{ t.student.myPet.title }}</h1>
          <p class="text-muted-foreground">{{ t.student.myPet.subtitle }}</p>
        </div>
        <div class="flex items-center gap-2">
          <Button variant="outline" @click="router.push('/student/gacha')">
            <Sparkles class="mr-2 size-4" />
            {{ t.student.myPet.unlockNewPets }}
          </Button>
          <Button @click="showFoodExchangeDialog = true">
            <ShoppingCart class="mr-2 size-4" />
            {{ t.student.myPet.buyFood }}
          </Button>
        </div>
      </div>

      <!-- No Pet Selected -->
      <Card v-if="!selectedPet" class="text-center">
        <CardContent class="py-12">
          <div
            class="mx-auto mb-4 flex size-24 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/50"
          >
            <Heart class="size-12 text-purple-400" />
          </div>
          <h2 class="text-xl font-semibold">{{ t.student.myPet.noPetTitle }}</h2>
          <p class="mt-2 text-muted-foreground">
            {{ t.student.myPet.noPetDesc }}
          </p>
          <Button
            class="mt-4 bg-gradient-to-r from-purple-500 to-fuchsia-500 hover:from-purple-600 hover:to-fuchsia-600"
            @click="goToCollections"
          >
            {{ t.student.myPet.goToCollections }}
          </Button>
        </CardContent>
      </Card>

      <!-- Pet Display -->
      <template v-else>
        <div class="grid gap-6 lg:grid-cols-3">
          <!-- Pet Card -->
          <Card class="lg:col-span-2">
            <CardHeader>
              <div class="flex items-center justify-between">
                <div>
                  <CardTitle class="flex items-center gap-2">
                    {{ selectedPet.name }}
                    <Badge v-if="selectedOwnedPet" variant="secondary" class="ml-1">
                      <Star class="mr-1 size-3" />
                      {{ getTierLabel(selectedOwnedPet.tier) }}
                    </Badge>
                  </CardTitle>
                  <CardDescription>
                    <Badge :class="rarityConfig[selectedPet.rarity].color" variant="outline">
                      {{ getRarityLabel(selectedPet.rarity) }}
                    </Badge>
                  </CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  class="dark:bg-input/50"
                  @click="goToCollections"
                  >{{ t.student.myPet.changePet }}</Button
                >
              </div>
            </CardHeader>
            <CardContent>
              <!-- Pet Display Area -->
              <div
                class="relative flex h-[28rem] cursor-pointer items-center justify-center overflow-hidden rounded-xl transition-all"
                :class="[rarityConfig[selectedPet.rarity].bgColor]"
                @click="onPetClick"
              >
                <!-- Decorative background circles -->
                <div
                  class="absolute left-1/2 top-1/2 size-72 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-20 sm:size-80 lg:size-96"
                  :class="rarityConfig[selectedPet.rarity].borderColor"
                  style="border-width: 3px; border-style: dashed"
                />
                <div
                  class="absolute left-1/2 top-1/2 size-56 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-10 sm:size-64 lg:size-72"
                  :class="rarityConfig[selectedPet.rarity].borderColor"
                  style="border-width: 2px; border-style: dotted"
                />

                <!-- Floating hearts animation -->
                <div v-if="anim.showHearts.value" class="pointer-events-none absolute inset-0">
                  <Heart
                    v-for="(pos, i) in [
                      { left: '25%', top: '30%' },
                      { left: '70%', top: '25%' },
                      { left: '15%', top: '55%' },
                      { left: '80%', top: '50%' },
                      { left: '35%', top: '65%' },
                      { left: '60%', top: '70%' },
                      { left: '45%', top: '40%' },
                      { left: '55%', top: '55%' },
                    ]"
                    :key="i"
                    class="absolute size-6 fill-red-500 text-red-500 animate-heart-float"
                    :style="{
                      left: pos.left,
                      top: pos.top,
                      animationDelay: `${i * 0.1}s`,
                    }"
                  />
                </div>

                <!-- Sparkles animation for feeding -->
                <div v-if="anim.showSparkles.value" class="pointer-events-none absolute inset-0">
                  <Sparkles
                    v-for="(pos, i) in [
                      { left: '20%', top: '25%' },
                      { left: '75%', top: '30%' },
                      { left: '30%', top: '60%' },
                      { left: '65%', top: '55%' },
                      { left: '45%', top: '35%' },
                      { left: '55%', top: '70%' },
                      { left: '15%', top: '45%' },
                      { left: '80%', top: '65%' },
                    ]"
                    :key="i"
                    class="absolute size-5 text-yellow-400 animate-sparkle"
                    :style="{
                      left: pos.left,
                      top: pos.top,
                      animationDelay: `${i * 0.12}s`,
                    }"
                  />
                </div>

                <!-- Food particles animation -->
                <div
                  v-if="anim.showFoodParticles.value"
                  class="pointer-events-none absolute inset-0"
                >
                  <div
                    v-for="(pos, i) in [
                      { left: '25%' },
                      { left: '45%' },
                      { left: '60%' },
                      { left: '75%' },
                      { left: '35%' },
                    ]"
                    :key="i"
                    class="absolute animate-food-fall text-2xl"
                    :style="{
                      left: pos.left,
                      animationDelay: `${i * 0.12}s`,
                    }"
                  >
                    🍖
                  </div>
                </div>

                <!-- Evolution animation -->
                <div
                  v-if="anim.isEvolving.value"
                  class="pointer-events-none absolute inset-0 flex items-center justify-center"
                >
                  <div class="absolute size-40 animate-ping rounded-full bg-yellow-400/30"></div>
                  <div class="absolute size-60 animate-pulse rounded-full bg-yellow-400/20"></div>
                </div>

                <!-- Pet with animations -->
                <div
                  class="relative transition-all duration-300"
                  :class="{
                    'scale-110 -rotate-3': anim.isPetting.value,
                    'scale-105 animate-wiggle': anim.isFeeding.value,
                    'scale-125 animate-glow': anim.isEvolving.value,
                  }"
                >
                  <img
                    :src="currentTierImage"
                    :alt="selectedPet.name"
                    class="size-96 object-contain drop-shadow-lg"
                    :class="{
                      'animate-bounce-slow':
                        !anim.isPetting.value && !anim.isFeeding.value && !anim.isEvolving.value,
                    }"
                  />
                </div>

                <!-- Conversation Bubble -->
                <Transition name="bubble">
                  <div
                    v-if="showConversationBubble"
                    class="absolute right-4 top-1/2 z-20 -translate-y-1/2"
                  >
                    <div
                      class="relative rounded-2xl border-2 border-purple-300 bg-white px-4 py-3 shadow-lg dark:border-purple-600 dark:bg-card"
                    >
                      <p class="max-w-44 text-sm font-medium">{{ currentMessage }}</p>
                      <div
                        class="absolute -left-2 top-1/2 size-3 -translate-y-1/2 rotate-45 border-b-2 border-l-2 border-purple-300 bg-white dark:border-purple-600 dark:bg-card"
                      ></div>
                    </div>
                  </div>
                </Transition>
              </div>

              <!-- Interaction Buttons -->
              <div class="mt-4 flex justify-center gap-4">
                <Button
                  size="lg"
                  variant="outline"
                  class="flex-1 border-pink-300 bg-pink-50 text-pink-700 hover:bg-pink-100 dark:border-pink-800 dark:bg-pink-950/30 dark:text-pink-400 dark:hover:bg-pink-950/50"
                  :disabled="anim.isPetting.value"
                  @click="onPetClick"
                >
                  <Hand class="mr-2 size-5" />
                  {{ t.student.myPet.petButton }}
                  <Heart class="ml-2 size-4 fill-pink-400 text-pink-400" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  class="flex-1 border-green-300 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400 dark:hover:bg-green-950/50"
                  :disabled="
                    anim.isFeeding.value ||
                    currentFood <= 0 ||
                    evolutionProgress?.isMaxTier ||
                    evolutionProgress?.canEvolve
                  "
                  @click="feedPet"
                >
                  <Apple class="mr-2 size-5" />
                  {{ t.student.myPet.feedButton }}
                  <span class="ml-2 text-xs opacity-70">({{ currentFood }})</span>
                </Button>
              </div>
            </CardContent>
          </Card>

          <!-- Evolution Card -->
          <EvolutionCard
            :current-tier="selectedOwnedPet?.tier ?? 1"
            :evolution-progress="evolutionProgress"
            :is-evolving="anim.isEvolving.value"
            @evolve="evolvePet"
            @view-collection="goToCollections"
          />
        </div>
      </template>
    </template>

    <!-- Food Exchange Dialog -->
    <FoodExchangeDialog
      ref="foodExchangeRef"
      :open="showFoodExchangeDialog"
      :current-coins="currentCoins"
      :exchange-rate="FOOD_PRICE"
      @update:open="showFoodExchangeDialog = $event"
      @exchange="handleExchangeFood"
    />
  </div>
</template>

<style scoped>
@keyframes float-up {
  0% {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
  100% {
    opacity: 0;
    transform: translateY(-100px) scale(0.5);
  }
}

.animate-float-up {
  animation: float-up 1.5s ease-out forwards;
}

@keyframes heart-float {
  0% {
    opacity: 0;
    transform: translateY(0) scale(0.5);
  }
  20% {
    opacity: 1;
    transform: translateY(-10px) scale(1);
  }
  100% {
    opacity: 0;
    transform: translateY(-80px) scale(0.6);
  }
}

.animate-heart-float {
  animation: heart-float 1.5s ease-out forwards;
}

@keyframes sparkle {
  0%,
  100% {
    opacity: 0;
    transform: scale(0) rotate(0deg);
  }
  50% {
    opacity: 1;
    transform: scale(1) rotate(180deg);
  }
}

.animate-sparkle {
  animation: sparkle 1s ease-in-out infinite;
}

@keyframes food-fall {
  0% {
    opacity: 1;
    transform: translateY(-20px) rotate(0deg);
  }
  100% {
    opacity: 0;
    transform: translateY(80px) rotate(360deg);
  }
}

.animate-food-fall {
  animation: food-fall 0.8s ease-in forwards;
}

@keyframes wiggle {
  0%,
  100% {
    transform: rotate(-3deg);
  }
  50% {
    transform: rotate(3deg);
  }
}

.animate-wiggle {
  animation: wiggle 0.3s ease-in-out infinite;
}

@keyframes glow {
  0%,
  100% {
    filter: drop-shadow(0 0 10px rgba(234, 179, 8, 0.5));
  }
  50% {
    filter: drop-shadow(0 0 30px rgba(234, 179, 8, 0.8));
  }
}

.animate-glow {
  animation: glow 0.5s ease-in-out infinite;
}

/* Speech bubble transition */
.bubble-enter-active {
  animation: bubble-in 0.3s ease-out;
}

.bubble-leave-active {
  animation: bubble-out 0.2s ease-in;
}

@keyframes bubble-in {
  0% {
    opacity: 0;
    transform: translateY(-50%) translateX(-20px) scale(0.8);
  }
  100% {
    opacity: 1;
    transform: translateY(-50%) translateX(0) scale(1);
  }
}

@keyframes bubble-out {
  0% {
    opacity: 1;
    transform: translateY(-50%) translateX(0) scale(1);
  }
  100% {
    opacity: 0;
    transform: translateY(-50%) translateX(20px) scale(0.8);
  }
}
</style>
