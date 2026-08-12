<script setup lang="ts">
import type { Component } from 'vue'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

defineProps<{
  label: string
  value: string | number
  icon?: Component
  subtitle?: string
  /** 'danger' paints the value in the destructive color (e.g. at-risk count > 0). */
  tone?: 'default' | 'danger'
}>()
</script>

<template>
  <Card>
    <CardHeader class="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle class="text-sm font-medium">{{ label }}</CardTitle>
      <component :is="icon" v-if="icon" class="size-4 text-muted-foreground" />
    </CardHeader>
    <CardContent>
      <div class="text-2xl font-bold" :class="{ 'text-destructive': tone === 'danger' }">
        {{ value }}
      </div>
      <p v-if="subtitle" class="text-xs text-muted-foreground">{{ subtitle }}</p>
    </CardContent>
  </Card>
</template>
