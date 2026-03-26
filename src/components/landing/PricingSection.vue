<script setup lang="ts">
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check } from 'lucide-vue-next'
import { storeToRefs } from 'pinia'
import { useLanguageStore } from '@/stores/language'

const { t } = storeToRefs(useLanguageStore())

const popularIndex = 2 // Pro plan
</script>

<template>
  <section class="border-t py-20">
    <div class="container mx-auto px-4">
      <div class="mx-auto mb-12 max-w-2xl text-center">
        <h2 class="mb-4 text-3xl font-bold md:text-4xl">{{ t.pricing.title }}</h2>
        <p class="text-lg text-muted-foreground">
          {{ t.pricing.subtitle }}
        </p>
      </div>

      <div class="grid gap-6 md:grid-cols-3">
        <Card
          v-for="(plan, index) in t.pricing.plans"
          :key="index"
          :class="[
            'relative flex flex-col',
            index === popularIndex ? 'border-primary shadow-lg' : '',
          ]"
        >
          <Badge v-if="index === popularIndex" class="absolute -top-3 left-1/2 -translate-x-1/2">
            {{ t.pricing.mostPopular }}
          </Badge>
          <CardHeader>
            <CardTitle>{{ plan.name }}</CardTitle>
            <CardDescription>{{ plan.description }}</CardDescription>
            <div class="mt-4">
              <div v-if="plan.originalPrice" class="mb-1.5 flex items-center gap-2">
                <span
                  class="text-base text-muted-foreground line-through decoration-muted-foreground/50"
                >
                  {{ plan.originalPrice }}
                </span>
                <span
                  class="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary"
                >
                  Save {{ plan.savePercent }}
                </span>
              </div>
              <span class="text-3xl font-bold">{{ plan.price }}</span>
              <span v-if="plan.period" class="text-muted-foreground">{{ plan.period }}</span>
            </div>
          </CardHeader>
          <CardContent class="flex flex-1 flex-col">
            <ul class="mb-6 flex-1 space-y-3">
              <li v-for="feature in plan.features" :key="feature" class="flex items-center gap-2">
                <Check class="size-4 text-primary" />
                <span class="text-sm">{{ feature }}</span>
              </li>
            </ul>
            <Button
              :variant="index === popularIndex ? 'default' : 'outline'"
              class="w-full"
              as-child
            >
              <RouterLink to="/signup">{{ t.pricing.getStarted }}</RouterLink>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  </section>
</template>
