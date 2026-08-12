<script setup lang="ts">
import { Building2, ClipboardCheck, TrendingUp } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { useLanguageStore } from '@/stores/language'

const { t } = storeToRefs(useLanguageStore())

const stepIcons = [Building2, ClipboardCheck, TrendingUp]
</script>

<template>
  <section class="border-t bg-landing-band py-20">
    <div class="container mx-auto px-4">
      <div class="mx-auto mb-12 max-w-2xl text-center">
        <h2 class="mb-4 text-3xl font-bold md:text-4xl">{{ t.landing.howItWorks.title }}</h2>
        <p class="text-lg text-muted-foreground">
          {{ t.landing.howItWorks.subtitle }}
        </p>
      </div>

      <div class="mx-auto grid max-w-4xl gap-8 md:grid-cols-3">
        <div
          v-for="(step, index) in t.landing.howItWorks.steps"
          :key="index"
          class="relative text-center"
        >
          <!-- Connecting line (hidden on mobile, visible on md+) -->
          <div
            v-if="index < t.landing.howItWorks.steps.length - 1"
            class="absolute top-8 left-[calc(50%+3rem)] hidden h-px w-[calc(100%-4rem)] border-t-2 border-dashed border-primary/30 md:block"
          />

          <div class="relative mx-auto mb-4 flex size-16 items-center justify-center">
            <div class="absolute inset-0 rounded-full bg-primary/10" />
            <component :is="stepIcons[index]" class="relative size-7 text-primary" />
            <span
              class="absolute -right-1 -top-1 flex size-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
            >
              {{ index + 1 }}
            </span>
          </div>
          <h3 class="mb-2 text-lg font-semibold">{{ step.title }}</h3>
          <p class="text-sm text-muted-foreground">{{ step.description }}</p>
        </div>
      </div>
    </div>
  </section>
</template>
