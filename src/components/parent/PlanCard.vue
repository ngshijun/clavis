<script setup lang="ts">
import type { SubscriptionTier, SubscriptionPlan, ScheduledChange } from '@/stores/subscription'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Check, Sparkles, Zap, CreditCard, Loader2 } from 'lucide-vue-next'

const props = defineProps<{
  plan: SubscriptionPlan
  currentTier: SubscriptionTier
  isProcessingPayment: boolean
  processingTier?: SubscriptionTier | null
  scheduledChange?: ScheduledChange | null
}>()

const emit = defineEmits<{
  change: [tier: SubscriptionTier]
}>()

function getTierIcon(tier: SubscriptionTier) {
  switch (tier) {
    case 'plus':
      return Zap
    case 'pro':
      return Sparkles
    default:
      return CreditCard
  }
}

function getButtonText() {
  if (props.plan.id === props.currentTier) return 'Current Plan'

  if (props.scheduledChange?.scheduledTier === props.plan.id) return 'Scheduled'

  if (props.plan.id === 'core') return 'Downgrade'

  const tierOrder: SubscriptionTier[] = ['core', 'plus', 'pro']
  const planIndex = tierOrder.indexOf(props.plan.id)
  const currentIndex = tierOrder.indexOf(props.currentTier)

  return planIndex > currentIndex ? 'Upgrade' : 'Downgrade'
}

function getButtonVariant() {
  if (props.plan.id === props.currentTier) return 'outline' as const
  if (props.plan.highlighted) return 'default' as const
  return 'outline' as const
}
</script>

<template>
  <Card
    :class="[
      'relative flex flex-col',
      plan.highlighted && 'border-primary shadow-md',
      currentTier === plan.id && 'bg-muted/50',
    ]"
  >
    <!-- Popular Badge -->
    <Badge v-if="plan.highlighted" class="absolute -top-2 left-1/2 -translate-x-1/2">
      Most Popular
    </Badge>

    <CardHeader>
      <div class="flex items-center gap-2">
        <component :is="getTierIcon(plan.id)" class="size-5 text-primary" />
        <CardTitle>{{ plan.name }}</CardTitle>
      </div>
      <CardDescription as="div">
        <div v-if="plan.originalPrice" class="mb-1.5 flex items-center gap-2">
          <span class="text-sm text-muted-foreground line-through decoration-muted-foreground/50">
            RM {{ plan.originalPrice.toFixed(2) }}
          </span>
          <span class="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
            Save {{ Math.round((1 - plan.price / plan.originalPrice) * 100) }}%
          </span>
        </div>
        <div>
          <span class="text-2xl font-bold text-foreground">RM {{ plan.price.toFixed(2) }}</span>
          <span class="text-muted-foreground">/month</span>
        </div>
      </CardDescription>
    </CardHeader>

    <CardContent class="flex-1">
      <div class="mb-4">
        <Badge variant="outline"> {{ plan.sessionsPerDay }} sessions/day </Badge>
      </div>
      <ul class="space-y-2">
        <li
          v-for="(feature, index) in plan.features"
          :key="index"
          class="flex items-start gap-2 text-sm"
        >
          <Check class="mt-0.5 size-4 shrink-0 text-green-500" />
          <span>{{ feature }}</span>
        </li>
      </ul>
    </CardContent>

    <CardFooter>
      <Button
        v-if="plan.id !== currentTier"
        class="w-full"
        :variant="getButtonVariant()"
        :disabled="isProcessingPayment || scheduledChange?.scheduledTier === plan.id"
        @click="emit('change', plan.id)"
      >
        <Loader2
          v-if="isProcessingPayment && (!processingTier || processingTier === plan.id)"
          class="mr-2 size-4 animate-spin"
        />
        {{ getButtonText() }}
      </Button>
      <Button v-else class="w-full" variant="outline" disabled> Current Plan </Button>
    </CardFooter>
  </Card>
</template>
