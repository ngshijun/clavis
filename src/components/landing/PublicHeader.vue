<script setup lang="ts">
import logoSvg from '@/assets/logo.svg'
import { Button } from '@/components/ui/button'
import ThemeToggle from '@/components/layout/ThemeToggle.vue'
import LanguageToggle from '@/components/layout/LanguageToggle.vue'
import { storeToRefs } from 'pinia'
import { useLanguageStore } from '@/stores/language'

const { t } = storeToRefs(useLanguageStore())
</script>

<template>
  <header
    class="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60"
  >
    <div class="container mx-auto flex h-16 items-center justify-between px-4">
      <RouterLink to="/" class="flex items-center gap-2">
        <img :src="logoSvg" alt="Clavis logo" class="size-8" />
        <span class="font-logo translate-y-1 text-2xl font-bold text-primary">Clavis</span>
      </RouterLink>

      <div class="flex items-center gap-2">
        <Button variant="outline" as-child>
          <RouterLink to="/login">{{ t.landing.header.login }}</RouterLink>
        </Button>
        <Button as-child>
          <RouterLink to="/login">{{ t.landing.header.signup }}</RouterLink>
        </Button>
        <LanguageToggle />
        <ThemeToggle />
      </div>
    </div>
  </header>
</template>
