<script setup lang="ts">
import { computed, ref, nextTick } from 'vue'
import { usePetsStore, rarityConfig, getRarityLabel, type Pet } from '@/stores/pets'
import { useAuthStore } from '@/stores/auth'
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
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
  type CarouselApi,
} from '@/components/ui/carousel'
import { Check, PawPrint, Lock, Sparkles, CircleDashed } from 'lucide-vue-next'
import { toast } from 'vue-sonner'

const props = defineProps<{
  open: boolean
  pet: Pet | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const authStore = useAuthStore()
const petsStore = usePetsStore()
const carouselApi = ref<CarouselApi | null>(null)
const currentSlide = ref(1)

const cfg = computed(() => (props.pet ? rarityConfig[props.pet.rarity] : null))

const isOwned = computed(() => (props.pet ? petsStore.isPetOwned(props.pet.id) : false))

const currentSlideUnlocked = computed(
  () => !!props.pet && isTierUnlocked(props.pet.id, currentSlide.value),
)

function isSelected(petId: string): boolean {
  return authStore.studentProfile?.selectedPetId === petId
}

function getPetTier(petId: string): number {
  return petsStore.getOwnedPet(petId)?.tier ?? 1
}

function getTierImageUrl(pet: Pet, tier: number): string {
  return petsStore.getOptimizedPetImageUrlForTier(pet, tier)
}

function isTierUnlocked(petId: string, tier: number): boolean {
  const ownedPet = petsStore.getOwnedPet(petId)
  if (!ownedPet) return false
  return ownedPet.tier >= tier
}

function onCarouselInit(api: CarouselApi) {
  if (!api) return
  carouselApi.value = api
  currentSlide.value = api.selectedScrollSnap() + 1
  api.on('select', () => {
    currentSlide.value = api.selectedScrollSnap() + 1
  })
  if (props.pet) {
    const currentTier = getPetTier(props.pet.id)
    api.scrollTo(currentTier - 1, true)
  }
}

async function handleSelectPet(petId: string) {
  if (isSelected(petId)) return
  const pet = petsStore.allPets.find((p) => p.id === petId)
  await petsStore.selectPet(petId)
  toast.success(`${pet?.name ?? 'Pet'} selected!`)
}

function openPet() {
  if (!props.pet) return
  const currentTier = getPetTier(props.pet.id)
  currentSlide.value = currentTier
  nextTick(() => {
    setTimeout(() => {
      carouselApi.value?.scrollTo(currentTier - 1, true)
    }, 50)
  })
}

function handleOpenChange(value: boolean) {
  if (value) {
    openPet()
  }
  emit('update:open', value)
}
</script>

<template>
  <Dialog :open="props.open" @update:open="handleOpenChange">
    <DialogContent class="overflow-hidden p-0 sm:max-w-lg">
      <template v-if="props.pet && cfg">
        <!-- Hero zone: rarity-tinted backdrop with status pill and title -->
        <div class="relative overflow-hidden border-b" :class="cfg.borderColor">
          <!-- Layered gradient backdrop -->
          <div
            class="absolute inset-0 bg-gradient-to-b opacity-80"
            :class="[cfg.gradientFrom, cfg.gradientTo]"
          />

          <div class="relative flex flex-col items-center gap-2 px-6 pb-3 pt-6">
            <!-- Status pill — "Not yet acquired" for unowned pets,
                 otherwise reflects the currently-visible carousel slide -->
            <div
              class="inline-flex items-center gap-1.5 rounded-full border bg-background/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider shadow-sm backdrop-blur"
              :class="[cfg.borderColor, cfg.color]"
            >
              <template v-if="!isOwned">
                <CircleDashed class="size-3.5" />
                <span>Not yet acquired</span>
              </template>
              <template v-else>
                <Check v-if="currentSlideUnlocked" class="size-3.5" />
                <CircleDashed v-else class="size-3.5" />
                <span>Tier {{ currentSlide }}</span>
              </template>
            </div>

            <!-- Pet name + rarity chip on a single row -->
            <div class="flex flex-wrap items-center justify-center gap-2">
              <h2 class="text-xl font-bold tracking-tight">{{ props.pet.name }}</h2>
              <Badge variant="outline" :class="cfg.color">
                {{ getRarityLabel(props.pet.rarity) }}
              </Badge>
            </div>

            <!-- Accessibility-only header -->
            <DialogHeader class="sr-only">
              <DialogTitle>{{ props.pet.name }}</DialogTitle>
              <DialogDescription>{{ getRarityLabel(props.pet.rarity) }} pet</DialogDescription>
            </DialogHeader>
          </div>
        </div>

        <!-- Pet Tier Carousel -->
        <div class="px-10 py-3">
          <Carousel class="mx-auto w-full outline-none" @init-api="onCarouselInit">
            <CarouselContent>
              <CarouselItem v-for="tier in 3" :key="tier">
                <div class="flex flex-col items-center gap-2 p-1">
                  <!-- Pet Image -->
                  <div
                    class="relative flex aspect-square w-full items-center justify-center rounded-xl border-2 p-4"
                    :class="[
                      isTierUnlocked(props.pet.id, tier)
                        ? [cfg.bgColor, cfg.borderColor]
                        : 'border-gray-300 bg-gray-100 dark:border-gray-700 dark:bg-muted',
                    ]"
                  >
                    <img
                      :src="getTierImageUrl(props.pet, tier)"
                      :alt="`${props.pet.name} Tier ${tier}`"
                      loading="lazy"
                      class="size-full object-contain transition-all"
                      :class="{
                        'brightness-0 opacity-20': !isTierUnlocked(props.pet.id, tier),
                      }"
                    />
                    <!-- Lock overlay for locked tiers -->
                    <div
                      v-if="!isTierUnlocked(props.pet.id, tier)"
                      class="absolute inset-0 flex items-center justify-center"
                    >
                      <div class="rounded-full bg-background/80 p-3">
                        <Lock class="size-8 text-muted-foreground" />
                      </div>
                    </div>
                  </div>

                  <!-- Evolve hint (owned but this tier still locked) -->
                  <p
                    v-if="petsStore.isPetOwned(props.pet.id) && !isTierUnlocked(props.pet.id, tier)"
                    class="text-xs text-muted-foreground"
                  >
                    Feed your pet to evolve!
                  </p>
                </div>
              </CarouselItem>
            </CarouselContent>
            <CarouselPrevious class="-left-10" />
            <CarouselNext class="-right-10" />
          </Carousel>
        </div>

        <DialogFooter
          v-if="!petsStore.isPetOwned(props.pet.id)"
          class="flex-col gap-2 p-6 pt-0 sm:flex-col"
        >
          <Button class="w-full" as-child>
            <RouterLink to="/student/gacha">
              <Sparkles class="mr-2 size-4" />
              Unlock New Pets!
            </RouterLink>
          </Button>
        </DialogFooter>
        <DialogFooter
          v-if="petsStore.isPetOwned(props.pet.id)"
          class="flex-col gap-2 p-6 pt-0 sm:flex-col"
        >
          <Button v-if="isSelected(props.pet.id)" variant="outline" class="w-full" disabled>
            <Check class="mr-2 size-4" />
            Selected
          </Button>
          <Button
            v-else
            data-tour="select-as-companion"
            class="w-full"
            @click="handleSelectPet(props.pet.id)"
          >
            <PawPrint class="mr-2 size-4" />
            Select as My Pet
          </Button>
        </DialogFooter>
      </template>
    </DialogContent>
  </Dialog>
</template>
