<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { BookOpen, GraduationCap, PawPrint } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { useLanguageStore } from '@/stores/language'

const { t } = storeToRefs(useLanguageStore())
</script>

<template>
  <section class="relative overflow-hidden bg-landing-band py-20 md:py-32">
    <div class="container mx-auto px-4">
      <div class="mx-auto max-w-3xl text-center">
        <div
          class="mb-6 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-sm font-medium text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300"
        >
          <GraduationCap class="size-4" />
          <span>{{ t.landing.hero.badge }}</span>
        </div>

        <h1 class="mb-6 text-4xl font-bold tracking-tight md:text-5xl lg:text-6xl">
          {{ t.landing.hero.titleBefore }}
          <span class="text-primary">{{ t.landing.hero.titleHighlight }}</span>
        </h1>

        <p class="mb-8 text-lg text-muted-foreground md:text-xl">
          {{ t.landing.hero.description }}
        </p>

        <div class="flex flex-col justify-center gap-4 sm:flex-row">
          <Button size="lg" as-child>
            <RouterLink to="/login">{{ t.landing.hero.getStarted }}</RouterLink>
          </Button>
          <Button size="lg" variant="outline" as-child>
            <RouterLink to="/login">{{ t.landing.hero.haveAccount }}</RouterLink>
          </Button>
        </div>

        <!-- Stats bar -->
        <div class="mt-12 flex flex-col items-center justify-center gap-8 sm:flex-row sm:gap-12">
          <div class="flex items-center gap-3">
            <BookOpen class="size-5 text-primary" />
            <div class="text-left">
              <p class="text-lg font-bold leading-tight">
                {{ t.landing.hero.stats.questionsValue }}
              </p>
              <p class="text-xs text-muted-foreground">{{ t.landing.hero.stats.questionsLabel }}</p>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <GraduationCap class="size-5 text-primary" />
            <div class="text-left">
              <p class="text-lg font-bold leading-tight">{{ t.landing.hero.stats.levelsValue }}</p>
              <p class="text-xs text-muted-foreground">{{ t.landing.hero.stats.levelsLabel }}</p>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <PawPrint class="size-5 text-primary" />
            <div class="text-left">
              <p class="text-lg font-bold leading-tight">{{ t.landing.hero.stats.petsValue }}</p>
              <p class="text-xs text-muted-foreground">{{ t.landing.hero.stats.petsLabel }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Product screenshot -->
      <div class="mx-auto mt-16 max-w-5xl px-4">
        <img
          src="/screenshots/main-hero.webp"
          alt="Clavis — 50% off launch promotion"
          width="1280"
          height="720"
          class="aspect-video w-full"
          fetchpriority="high"
          decoding="async"
        />
      </div>
    </div>

    <!-- Background decoration -->
    <div class="absolute inset-0 -z-10 overflow-hidden">
      <div
        class="absolute -top-40 left-1/2 size-80 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
      />
      <div class="absolute -bottom-40 left-1/4 size-60 rounded-full bg-primary/5 blur-3xl" />
      <div class="absolute -bottom-20 right-1/4 size-40 rounded-full bg-primary/10 blur-3xl" />
    </div>
  </section>
</template>
