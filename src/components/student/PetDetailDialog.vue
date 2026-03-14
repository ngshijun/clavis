<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { usePetsStore, rarityConfig, type Pet } from '@/stores/pets'
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
import { Check, Star, Lock, Sparkles } from 'lucide-vue-next'
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
  nextTick(() => {
    const currentTier = getPetTier(props.pet!.id)
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
    <DialogContent class="sm:max-w-lg">
      <DialogHeader v-if="props.pet">
        <DialogTitle class="flex items-center gap-2">
          {{ props.pet.name }}
          <Badge variant="outline" :class="rarityConfig[props.pet.rarity].color">
            {{ rarityConfig[props.pet.rarity].label }}
          </Badge>
        </DialogTitle>
        <DialogDescription>
          {{
            petsStore.isPetOwned(props.pet.id)
              ? `Current Tier: ${getPetTier(props.pet.id)} / 3`
              : 'Not yet acquired'
          }}
        </DialogDescription>
      </DialogHeader>

      <!-- Pet Tier Carousel -->
      <div v-if="props.pet" class="px-10 py-4">
        <Carousel class="mx-auto w-full outline-none" @init-api="onCarouselInit">
          <CarouselContent>
            <CarouselItem v-for="tier in 3" :key="tier">
              <div class="flex flex-col items-center gap-3 p-2">
                <!-- Tier Label -->
                <Badge
                  :variant="isTierUnlocked(props.pet.id, tier) ? 'default' : 'secondary'"
                  class="text-sm"
                >
                  <Star class="mr-1 size-3" />
                  Tier {{ tier }}
                </Badge>

                <!-- Pet Image -->
                <div
                  class="relative flex aspect-square w-full items-center justify-center rounded-xl border-2 p-6"
                  :class="[
                    isTierUnlocked(props.pet.id, tier)
                      ? [
                          rarityConfig[props.pet.rarity].bgColor,
                          rarityConfig[props.pet.rarity].borderColor,
                        ]
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

                <!-- Tier Status -->
                <p v-if="petsStore.isPetOwned(props.pet.id)" class="text-sm text-muted-foreground">
                  {{ isTierUnlocked(props.pet.id, tier) ? 'Unlocked' : 'Feed your pet to evolve!' }}
                </p>
              </div>
            </CarouselItem>
          </CarouselContent>
          <CarouselPrevious class="-left-10" />
          <CarouselNext class="-right-10" />
        </Carousel>
      </div>

      <DialogFooter
        v-if="props.pet && !petsStore.isPetOwned(props.pet.id)"
        class="flex-col gap-2 sm:flex-col"
      >
        <Button class="w-full" as-child>
          <RouterLink to="/student/gacha">
            <Sparkles class="mr-2 size-4" />
            Unlock New Pets!
          </RouterLink>
        </Button>
      </DialogFooter>
      <DialogFooter
        v-if="props.pet && petsStore.isPetOwned(props.pet.id)"
        class="flex-col gap-2 sm:flex-col"
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
          <Star class="mr-2 size-4" />
          Select as My Pet
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
