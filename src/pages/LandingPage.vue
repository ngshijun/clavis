<script setup lang="ts">
import { useSeoMeta } from '@unhead/vue'
import PublicHeader from '@/components/landing/PublicHeader.vue'
import HeroSection from '@/components/landing/HeroSection.vue'
import FeaturesSection from '@/components/landing/FeaturesSection.vue'
import HowItWorksSection from '@/components/landing/HowItWorksSection.vue'
import TestimonialsSection from '@/components/landing/TestimonialsSection.vue'
import PricingSection from '@/components/landing/PricingSection.vue'
import ContactSection from '@/components/landing/ContactSection.vue'
import CtaSection from '@/components/landing/CtaSection.vue'
import FooterSection from '@/components/landing/FooterSection.vue'

// Landing page uses the titleTemplate fallback (no title set here)
// so the document title renders as "Clavis — Where Learning Feels Like Play"
// OG & Twitter meta are kept as static tags in index.html for social-crawler
// compatibility (most crawlers don't execute JS in an SPA).
useSeoMeta({
  description:
    'Clavis helps primary school students master their studies through gamified practice sessions, collectible pets, and real-time progress tracking. Aligned with SJK(C) KSSR (Semakan 2017) curriculum.',
})
</script>

<template>
  <div class="min-h-screen flex flex-col bg-background">
    <PublicHeader />
    <main class="flex-1">
      <HeroSection />
      <FeaturesSection />
      <HowItWorksSection />
      <TestimonialsSection />
      <PricingSection />
      <ContactSection />
      <CtaSection />
    </main>
    <FooterSection />
  </div>
</template>
