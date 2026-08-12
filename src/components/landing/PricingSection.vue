<script setup lang="ts">
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Check } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { useLanguageStore } from '@/stores/language'

const { t } = storeToRefs(useLanguageStore())
</script>

<template>
  <section class="border-t bg-landing-band py-20">
    <div class="container mx-auto px-4">
      <div class="mx-auto mb-12 max-w-2xl text-center">
        <h2 class="mb-4 text-3xl font-bold md:text-4xl">{{ t.landing.pricing.title }}</h2>
        <p class="text-lg text-muted-foreground">
          {{ t.landing.pricing.subtitle }}
        </p>
      </div>

      <Card class="mx-auto max-w-lg border-primary bg-landing-band-alt shadow-lg">
        <CardHeader>
          <CardTitle>{{ t.landing.pricing.planName }}</CardTitle>
          <CardDescription>{{ t.landing.pricing.planDescription }}</CardDescription>
          <div class="mt-4">
            <p class="text-3xl font-bold">{{ t.landing.pricing.priceLabel }}</p>
            <p class="mt-2 text-sm text-muted-foreground">{{ t.landing.pricing.priceNote }}</p>
          </div>
        </CardHeader>
        <CardContent class="flex flex-col">
          <ul class="mb-6 space-y-3">
            <li
              v-for="feature in t.landing.pricing.features"
              :key="feature"
              class="flex items-center gap-2"
            >
              <Check class="size-4 shrink-0 text-primary" />
              <span class="text-sm">{{ feature }}</span>
            </li>
          </ul>
          <Button class="w-full" as-child>
            <a href="#contact">{{ t.landing.pricing.contactUs }}</a>
          </Button>
        </CardContent>
      </Card>
    </div>
  </section>
</template>
