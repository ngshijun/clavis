<script setup lang="ts">
import { Button } from '@/components/ui/button'
import { storeToRefs } from 'pinia'
import { useLanguageStore } from '@/stores/language'

const { t } = storeToRefs(useLanguageStore())
</script>

<template>
  <section class="border-t bg-landing-band py-20">
    <div class="container mx-auto px-4">
      <div class="mx-auto max-w-2xl text-center">
        <h2 class="mb-4 text-3xl font-bold md:text-4xl">
          {{ t.landing.cta.title }}
        </h2>
        <p class="mb-8 text-lg text-muted-foreground">
          {{ t.landing.cta.subtitle }}
        </p>
        <div class="flex flex-col justify-center gap-4 sm:flex-row">
          <Button size="lg" as-child>
            <RouterLink to="/login">{{ t.landing.cta.getStarted }}</RouterLink>
          </Button>
          <Button size="lg" variant="outline" as-child>
            <RouterLink to="/login">{{ t.landing.cta.haveAccount }}</RouterLink>
          </Button>
        </div>
      </div>
    </div>
  </section>
</template>
