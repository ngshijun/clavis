<script setup lang="ts">
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Map, ClipboardList, CheckCircle2, Users, BarChart3, GraduationCap } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { useLanguageStore } from '@/stores/language'

const { t } = storeToRefs(useLanguageStore())

const featureIcons = [Map, ClipboardList, CheckCircle2, Users, BarChart3, GraduationCap]
</script>

<template>
  <section class="border-t bg-landing-band-alt py-20">
    <div class="container mx-auto px-4">
      <div class="mx-auto mb-12 max-w-2xl text-center">
        <h2 class="mb-4 text-3xl font-bold md:text-4xl">{{ t.landing.features.title }}</h2>
        <p class="text-lg text-muted-foreground">
          {{ t.landing.features.subtitle }}
        </p>
      </div>

      <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <Card
          v-for="(feature, index) in t.landing.features.items"
          :key="index"
          class="border-0 bg-landing-band shadow-md"
        >
          <CardHeader>
            <div class="mb-4 flex size-12 items-center justify-center rounded-lg bg-primary/10">
              <component :is="featureIcons[index]" class="size-6 text-primary" />
            </div>
            <CardTitle class="text-xl">{{ feature.title }}</CardTitle>
            <CardDescription class="text-base">{{ feature.description }}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  </section>
</template>
