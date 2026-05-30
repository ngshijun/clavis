<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import { Star, PawPrint } from 'lucide-vue-next'
import { rarityConfig, getRarityLabel } from '@/stores/pets'
import type { StudentPetData } from '@/composables/useStudentProfileDialog'

defineProps<{
  pet: StudentPetData | null
  noPetLabel: string
}>()
</script>

<template>
  <!-- Pet (left column, spans 2 rows) -->
  <div v-if="pet" class="row-span-2 flex min-h-[24rem] flex-col overflow-hidden rounded-lg border">
    <!-- Pet Display Area -->
    <div
      class="relative flex flex-1 items-center justify-center overflow-hidden px-6"
      :class="rarityConfig[pet.rarity].bgColor"
    >
      <!-- Decorative background circles -->
      <div
        class="absolute left-1/2 top-1/2 size-48 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-20 lg:size-56"
        :class="rarityConfig[pet.rarity].borderColor"
        style="border-width: 3px; border-style: dashed"
      />
      <div
        class="absolute left-1/2 top-1/2 size-36 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-10 lg:size-44"
        :class="rarityConfig[pet.rarity].borderColor"
        style="border-width: 2px; border-style: dotted"
      />
      <img
        :src="pet.imageUrl"
        :alt="pet.name"
        class="animate-bounce-slow relative z-10 h-full max-h-64 w-auto object-contain drop-shadow-lg"
      />
    </div>
    <!-- Pet Info -->
    <div class="flex items-center gap-3 px-5 py-3">
      <PawPrint class="size-5 text-purple-500" />
      <div>
        <p class="text-sm font-semibold">{{ pet.name }}</p>
        <div class="flex items-center gap-1.5">
          <Badge variant="outline" :class="rarityConfig[pet.rarity].color" class="text-xs">
            {{ getRarityLabel(pet.rarity) }}
          </Badge>
          <Badge variant="secondary" class="text-xs">
            <Star class="mr-0.5 size-2.5" />
            T{{ pet.tier }}
          </Badge>
        </div>
      </div>
    </div>
  </div>
  <div
    v-else
    class="row-span-2 flex flex-col items-center justify-center gap-4 rounded-lg border border-dashed"
  >
    <div
      class="flex size-24 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/50"
    >
      <PawPrint class="size-12 text-purple-400" />
    </div>
    <p class="text-lg font-semibold text-muted-foreground">{{ noPetLabel }}</p>
  </div>
</template>
