<script setup lang="ts">
import logoSvg from '@/assets/logo.svg'
import { storeToRefs } from 'pinia'
import { useLanguageStore } from '@/stores/language'

const { t } = storeToRefs(useLanguageStore())
</script>

<template>
  <footer class="border-t bg-landing-band py-12">
    <div class="container mx-auto px-4">
      <div class="flex flex-col items-center justify-between gap-6 md:flex-row">
        <div>
          <div class="flex items-center gap-2">
            <img :src="logoSvg" alt="Clavis logo" class="size-10" />
            <span class="font-logo translate-y-1 text-2xl font-bold text-primary">Clavis</span>
          </div>
          <p class="mt-1 text-xs italic text-muted-foreground">
            {{ t.landing.footer.tagline }}
          </p>
        </div>

        <nav class="flex flex-wrap justify-center gap-6">
          <RouterLink
            to="/login"
            class="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {{ t.landing.footer.login }}
          </RouterLink>
          <RouterLink
            to="/login"
            class="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {{ t.landing.footer.signup }}
          </RouterLink>
          <RouterLink
            to="/forgot-password"
            class="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {{ t.landing.footer.forgotPassword }}
          </RouterLink>
        </nav>

        <p class="text-sm text-muted-foreground">
          &copy; {{ new Date().getFullYear() }} {{ t.landing.footer.copyright }}
        </p>
      </div>
    </div>
  </footer>
</template>
